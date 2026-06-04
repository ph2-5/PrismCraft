import { z } from "zod";

export const pollResultSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed", "cancelled", "running", "queued"]),
  progress: z.number().min(0).max(100).optional(),
  videoUrl: z.string().optional(),
  error: z.string().optional(),
});

export type PollResult = z.infer<typeof pollResultSchema>;

const API_STATUS_MAP: Record<string, string | null> = {
  pending: "pending",
  generating: "generating",
  processing: "generating",
  running: "generating",
  queued: "pending",
  completed: "completed",
  succeeded: "completed",
  success: "completed",
  failed: "failed",
  error: "failed",
  cancelled: "failed",
};

export function mapApiStatus(apiStatus: string, videoUrl?: string): "pending" | "generating" | "completed" | "failed" {
  const mapped = API_STATUS_MAP[apiStatus.toLowerCase()];
  if (mapped === "pending" || mapped === "generating" || mapped === "completed" || mapped === "failed") {
    if (mapped === "completed" && videoUrl) return "completed";
    if (mapped === "completed" && !videoUrl) return "generating";
    return mapped;
  }
  return "failed";
}
