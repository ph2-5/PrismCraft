import type { Route } from "../types";
import { defineRoute } from "../types";
import { createApiGatewayAdapter } from "../../api-gateway";
import type { ApiGateway, Beat } from "@shared-logic/story/storyboard-generation";
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

// 创建一次适配器实例，供所有路由复用
const apiGatewayAdapter: ApiGateway = createApiGatewayAdapter();

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
        apiGatewayAdapter,
        promptService,
        b.beat as Beat,
        b.prevBeat as Beat | undefined,
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
        apiGatewayAdapter,
        promptService,
        b.beat as Beat,
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
        apiGatewayAdapter,
        b.beat as Beat,
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
        apiGatewayAdapter,
        promptService,
        b.beat as Beat,
        b.prevBeat as Beat | undefined,
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
        apiGatewayAdapter,
        promptService,
        b.beats as Beat[],
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
        apiGatewayAdapter,
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
        return { success: true, saved: 0, failures: [] };
      }
      const failures: Array<{ taskId: string; error: string }> = [];
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
        const checkStmt = db.prepare("SELECT id FROM video_tasks WHERE id = ?");
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

              const existing = checkStmt.get(taskId) as { id: string } | undefined;
              if (existing) {
                updateStmt.run(status, progress, videoUrl, message, nowSec, taskId);
              } else {
                insertStmt.run(taskId, status, progress, videoUrl, storyId, beatId, message, config, provider, mediaRefs, tracking, createdAt, nowSec);
              }
              saved++;
            } catch (error) {
              const taskId = (task.taskId as string) || (task.id as string) || "unknown";
              failures.push({ taskId, error: error instanceof Error ? error.message : String(error) });
              logger.warn("[API] Failed to save individual video task in bulk-save", { taskId });
            }
          }
        });
        return { success: true, saved, failures };
      } catch (error) {
        logger.error("[API] video-tasks/bulk-save failed:", error instanceof Error ? error : undefined);
        return { success: false, error: error instanceof Error ? error.message : "Unknown error", failures };
      }
    },
    methods: ["POST"],
  }),
};
