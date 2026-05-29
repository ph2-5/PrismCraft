export const dynamic = "force-static";

import { NextResponse } from "next/server";

export async function GET() {
  try {
    return NextResponse.json({
      success: true,
      status: "ready",
      version: 1,
      protocol: "local-first-sync-v1",
      capabilities: {
        push: true,
        pull: true,
        conflictDetection: true,
        softDelete: true,
        revisionTracking: true,
      },
      endpoints: {
        push: "/api/sync/push",
        pull: "/api/sync/pull",
        status: "/api/sync/status",
      },
      limits: {
        maxChangesPerPush: 500,
        maxChangesPerPull: 500,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
