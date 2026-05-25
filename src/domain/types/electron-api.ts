export interface VideoTaskRecord {
  taskId: string;
  status: "pending" | "generating" | "completed" | "failed" | "cancelled" | "retrying";
  progress: number;
  videoUrl?: string;
  localVideoPath?: string;
  message: string;
  createdAt: string;
  updatedAt?: string;
  storyId?: string;
  beatId?: string;
  config?: {
    model?: string;
    prompt?: string;
    parameters?: string;
    template_id?: string;
    template_shots?: string;
  };
  provider?: {
    api_url?: string;
    api_endpoint?: string;
    provider_id?: string;
    provider_model_id?: string;
    provider_format?: string;
  };
  mediaRefs?: {
    fixed_image_url?: string;
    fixed_image_lock_type?: string;
    reference_video_url?: string;
    reference_video_mimicry_level?: string;
  };
  tracking?: {
    last_polled_at?: number;
    poll_count?: number;
    poll_failure_count?: number;
    recovery_attempts?: number;
    expires_at?: number;
    url_obtained_at?: number;
    url_ttl?: number;
  };
}

export interface VideoTaskHistory {
  taskId: string;
  status: "pending" | "generating" | "completed" | "failed" | "retrying";
  model?: string;
  prompt?: string;
  parameters?: Record<string, unknown>;
  videoUrl?: string;
  createdAt: string;
  expiresAt: string;
  lastPolledAt?: string;
  pollCount: number;
  recoveryAttempts: number;
}

export interface CustomApiConfig {
  providerId?: string;
  modelId?: string;
  format?: string;
}
