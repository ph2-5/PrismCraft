export const dynamic = "force-static";
/* eslint-disable no-restricted-imports */
import { NextRequest, NextResponse } from "next/server";
import type { VectorClock } from "@/modules/sync";
import { getServerChangeLog } from "@/modules/sync/engine";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get("deviceId");
    const since = parseInt(searchParams.get("since") || "0");
    const parsedLimit = parseInt(searchParams.get("limit") || "100");
    const limit = Math.min(Number.isNaN(parsedLimit) ? 100 : parsedLimit, 500);

    if (!deviceId) {
      return NextResponse.json(
        { success: false, error: "deviceId is required" },
        { status: 400 },
      );
    }

    if (isNaN(since) || since < 0) {
      return NextResponse.json(
        { success: false, error: "since must be a valid timestamp" },
        { status: 400 },
      );
    }

    const serverChangeLog = getServerChangeLog();

    // Filter changes from other devices since the given timestamp
    const changes = serverChangeLog
      .filter(
        (c) => c.deviceId !== deviceId && c.timestamp > since,
      )
      .slice(0, limit);

    // Calculate latest vector clock
    const latestVectorClock: VectorClock = {};
    for (const change of serverChangeLog) {
      for (const [dev, counter] of Object.entries(change.vectorClock)) {
        latestVectorClock[dev] = Math.max(latestVectorClock[dev] || 0, counter);
      }
    }

    const hasMore = changes.length === limit &&
      serverChangeLog.filter((c) => c.deviceId !== deviceId && c.timestamp > since).length > limit;

    return NextResponse.json({
      success: true,
      changes: changes.map((c) => ({
        entityType: c.entityType,
        entityId: c.entityId,
        operation: c.operation,
        vectorClock: c.vectorClock,
        data: c.data,
        timestamp: c.timestamp,
        deviceId: c.deviceId,
      })),
      latestVectorClock,
      hasMore,
      limit,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
