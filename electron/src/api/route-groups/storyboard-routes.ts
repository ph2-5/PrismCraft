import type { Route } from "../types";
import { defineRoute } from "../types";
import * as apiGateway from "../../api-gateway";
import * as promptService from "@shared-logic/prompt/prompt-service";
import * as storyboardGeneration from "@shared-logic/story/storyboard-generation";
import * as videoRecovery from "@shared-logic/video/video-recovery";
import * as videoTracker from "@shared-logic/video/video-tracker";
import { getDb } from "../../database";
import { getLogger } from "../../logging";
import {
  videoTrackingInfoSchema,
  videoProviderInfoSchema,
  storyboardGenerateKeyframeSchema,
  storyboardGenerateFramePairSchema,
  storyboardGenerateVideoSchema,
  storyboardGenerateFullWorkflowSchema,
  storyboardGenerateKeyframeChainSchema,
  videoRecoverSchema,
  videoTasksBulkSaveSchema,
} from "../schemas";

const logger = getLogger("api-routes");

export const storyboardRoutes: Record<string, Route> = {
  "video/tracking-info": defineRoute({
    schema: videoTrackingInfoSchema,
    handler: async (_m, b) => {
      const info = videoTracker.buildTrackingInfo(
        b.taskId,
        b.apiUrl,
        b.apiKeyPreview,
        b.model,
      );
      return { success: true, data: info };
    },
    methods: ["POST"],
  }),
  "video/provider-info": defineRoute({
    schema: videoProviderInfoSchema,
    handler: async (_m, b) => {
      const info = videoTracker.getProviderInfo(b.apiUrl);
      return { success: true, data: info };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-keyframe": defineRoute({
    schema: storyboardGenerateKeyframeSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateBeatKeyframe(
        apiGateway as unknown as import("@shared-logic/story/storyboard-generation").ApiGateway,
        promptService,
        b.beat as import("@shared-logic/story/storyboard-generation").Beat,
        b.prevBeat as import("@shared-logic/story/storyboard-generation").Beat | undefined,
        b.options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-frame-pair": defineRoute({
    schema: storyboardGenerateFramePairSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateBeatFramePair(
        apiGateway as unknown as import("@shared-logic/story/storyboard-generation").ApiGateway,
        promptService,
        b.beat as import("@shared-logic/story/storyboard-generation").Beat,
        b.options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-video": defineRoute({
    schema: storyboardGenerateVideoSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateBeatVideo(
        apiGateway as unknown as import("@shared-logic/story/storyboard-generation").ApiGateway,
        b.beat as import("@shared-logic/story/storyboard-generation").Beat,
        b.options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-full-workflow": defineRoute({
    schema: storyboardGenerateFullWorkflowSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateBeatFullWorkflow(
        apiGateway as unknown as import("@shared-logic/story/storyboard-generation").ApiGateway,
        promptService,
        b.beat as import("@shared-logic/story/storyboard-generation").Beat,
        b.prevBeat as import("@shared-logic/story/storyboard-generation").Beat | undefined,
        b.options,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "storyboard/generate-keyframe-chain": defineRoute({
    schema: storyboardGenerateKeyframeChainSchema,
    handler: async (_m, b) => {
      const result = await storyboardGeneration.generateKeyframeChain(
        apiGateway as unknown as import("@shared-logic/story/storyboard-generation").ApiGateway,
        promptService,
        b.beats as import("@shared-logic/story/storyboard-generation").Beat[],
        b.options as Parameters<typeof storyboardGeneration.generateKeyframeChain>[3],
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "video/recover": defineRoute({
    schema: videoRecoverSchema,
    handler: async (_m, b) => {
      const result = await videoRecovery.recoverVideoByTaskId(
        apiGateway as unknown as import("@shared-logic/story/storyboard-generation").ApiGateway,
        b.taskId,
        b.taskRecord,
      );
      return { success: true, data: result };
    },
    methods: ["POST"],
  }),
  "video-tasks/bulk-save": defineRoute({
    schema: videoTasksBulkSaveSchema,
    handler: async (_m, b) => {
      const tasks = b.tasks;
      if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
        return { success: true, saved: 0 };
      }
      try {
        const db = getDb();
        const insertStmt = db.prepare(
          `INSERT OR REPLACE INTO video_tasks
           (id, status, progress, video_url, story_id, beat_id, message, config, provider, media_refs, tracking, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        const updateStmt = db.prepare(
          `UPDATE video_tasks SET status = ?, progress = ?, video_url = COALESCE(?, video_url), message = ?, updated_at = ? WHERE id = ?`,
        );
        let saved = 0;
        const nowSec = Math.floor(Date.now() / 1000);
        db.transaction(() => {
          for (const task of tasks) {
            try {
              const taskId = task.taskId as string || task.id as string;
              if (!taskId) continue;
              const status = (task.status as string) || "pending";
              const progress = (task.progress as number) || 0;
              const videoUrl = (task.videoUrl as string) || null;
              const storyId = (task.storyId as string) || null;
              const beatId = (task.beatId as string) || null;
              const message = (task.message as string) || null;
              const config = task.config ? JSON.stringify(task.config) : "{}";
              const provider = task.provider ? JSON.stringify(task.provider) : "{}";
              const mediaRefs = task.mediaRefs ? JSON.stringify(task.mediaRefs) : "{}";
              const tracking = task.tracking ? JSON.stringify(task.tracking) : "{}";
              const createdAt = typeof task.createdAt === "number"
                ? task.createdAt
                : nowSec;

              const existing = db.prepare("SELECT id FROM video_tasks WHERE id = ?").get(taskId) as { id: string } | undefined;
              if (existing) {
                updateStmt.run(status, progress, videoUrl, message, nowSec, taskId);
              } else {
                insertStmt.run(taskId, status, progress, videoUrl, storyId, beatId, message, config, provider, mediaRefs, tracking, createdAt, nowSec);
              }
              saved++;
            } catch {
              logger.warn("[API] Failed to save individual video task in bulk-save");
            }
          }
        });
        return { success: true, saved };
      } catch (error) {
        logger.error("[API] video-tasks/bulk-save failed:", error instanceof Error ? error : undefined);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    },
    methods: ["POST"],
  }),
};
