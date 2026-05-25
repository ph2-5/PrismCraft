export interface VideoTaskConfig {
  model?: string;
  prompt?: string;
  parameters?: string;
  template_id?: string;
  template_shots?: string;
  story_title?: string;
  beat_title?: string;
}

export interface VideoTaskProvider {
  api_url?: string;
  api_endpoint?: string;
  provider_id?: string;
  provider_model_id?: string;
  provider_format?: string;
}

export interface VideoTaskMediaRefs {
  fixed_image_url?: string;
  fixed_image_lock_type?: string;
  reference_video_url?: string;
  reference_video_mimicry_level?: string;
}

export interface VideoTaskTracking {
  last_polled_at?: number;
  poll_count?: number;
  poll_failure_count?: number;
  recovery_attempts?: number;
  expires_at?: number;
  url_obtained_at?: number;
  url_ttl?: number;
}

export function parseConfig(raw: string | null | undefined): VideoTaskConfig {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function parseProvider(raw: string | null | undefined): VideoTaskProvider {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function parseMediaRefs(raw: string | null | undefined): VideoTaskMediaRefs {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function parseTracking(raw: string | null | undefined): VideoTaskTracking {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}
