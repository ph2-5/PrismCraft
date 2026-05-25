export const dynamic = "force-static";
/* eslint-disable no-restricted-imports */
import { NextRequest, NextResponse } from "next/server";
import type { VectorClock } from "@/modules/sync";
import { compareVectorClocks, mergeVectorClocks } from "@/modules/sync";
import {
  getServerChangeLog,
  appendServerChanges,
  getServerVectorClock,
  saveServerVectorClock,
} from "@/modules/sync/engine";

const VALID_ENTITY_TYPES = [
  "character",
  "scene",
  "story",
  "media_asset",
  "storyboard_asset",
  "video_task",
  "story_version",
  "collection",
];

const VALID_OPERATIONS = ["insert", "update", "delete"];

interface PushChange {
  entityType: string;
  entityId: string;
  operation: string;
  vectorClock: VectorClock;
  data: Record<string, unknown> | null;
  timestamp: number;
  deviceId: string;
}

interface PushRequest {
  deviceId: string;
  changes: PushChange[];
}

interface ConflictResult {
  entityType: string;
  entityId: string;
  localVectorClock: VectorClock;
  remoteVectorClock: VectorClock;
  localData: Record<string, unknown> | null;
  remoteData: Record<string, unknown> | null;
}

export async function POST(request: NextRequest) {
  try {
    const body: PushRequest = await request.json();
    const { deviceId, changes } = body;

    if (!deviceId || typeof deviceId !== "string") {
      return NextResponse.json(
        { success: false, error: "deviceId is required" },
        { status: 400 },
      );
    }

    if (!Array.isArray(changes) || changes.length === 0) {
      return NextResponse.json(
        { success: false, error: "changes must be a non-empty array" },
        { status: 400 },
      );
    }

    if (changes.length > 500) {
      return NextResponse.json(
        { success: false, error: "Too many changes in single request (max 500)" },
        { status: 400 },
      );
    }

    const serverChangeLog = getServerChangeLog();
    const serverVectorClock = getServerVectorClock();
    const accepted: string[] = [];
    const rejected: Array<{ index: number; reason: string }> = [];
    const conflicts: ConflictResult[] = [];
    const newChanges: Array<{
      id: string;
      entityType: string;
      entityId: string;
      operation: string;
      vectorClock: VectorClock;
      data: Record<string, unknown> | null;
      timestamp: number;
      deviceId: string;
    }> = [];

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];

      if (!VALID_ENTITY_TYPES.includes(change.entityType)) {
        rejected.push({ index: i, reason: `Invalid entityType: ${change.entityType}` });
        continue;
      }

      if (!VALID_OPERATIONS.includes(change.operation)) {
        rejected.push({ index: i, reason: `Invalid operation: ${change.operation}` });
        continue;
      }

      if (!change.entityId || typeof change.entityId !== "string") {
        rejected.push({ index: i, reason: "entityId is required" });
        continue;
      }

      if (!change.vectorClock || typeof change.vectorClock !== "object") {
        rejected.push({ index: i, reason: "vectorClock is required" });
        continue;
      }

      // Check for conflicts with existing changes
      const existingChanges = serverChangeLog.filter(
        (c) => c.entityType === change.entityType && c.entityId === change.entityId,
      );

      let hasConflict = false;
      for (const existing of existingChanges) {
        const compareResult = compareVectorClocks(existing.vectorClock, change.vectorClock);
        if (compareResult === 0 && JSON.stringify(existing.vectorClock) !== JSON.stringify(change.vectorClock)) {
          // Concurrent conflict
          hasConflict = true;
          conflicts.push({
            entityType: change.entityType,
            entityId: change.entityId,
            localVectorClock: existing.vectorClock,
            remoteVectorClock: change.vectorClock,
            localData: existing.data,
            remoteData: change.data,
          });
          break;
        }
      }

      if (hasConflict) {
        continue;
      }

      // Accept the change
      const changeId = `srv_${crypto.randomUUID()}`;
      newChanges.push({
        id: changeId,
        entityType: change.entityType,
        entityId: change.entityId,
        operation: change.operation,
        vectorClock: change.vectorClock,
        data: change.data,
        timestamp: change.timestamp,
        deviceId: change.deviceId,
      });

      // Update server vector clock
      Object.assign(serverVectorClock, mergeVectorClocks(serverVectorClock, change.vectorClock));

      accepted.push(changeId);
    }

    // Persist changes
    if (newChanges.length > 0) {
      appendServerChanges(newChanges);
      saveServerVectorClock(serverVectorClock);
    }

    return NextResponse.json({
      success: true,
      accepted: accepted.length,
      acceptedIds: accepted,
      rejected,
      conflicts,
      serverVectorClock,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
