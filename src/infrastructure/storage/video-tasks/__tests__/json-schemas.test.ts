import { describe, it, expect } from "vitest";
import {
  parseConfig,
  parseProvider,
  parseMediaRefs,
  parseTracking,
} from "@/infrastructure/storage/video-tasks/json-schemas";

describe("parseConfig", () => {
  it("returns empty object for null", () => {
    expect(parseConfig(null)).toEqual({});
  });

  it("returns empty object for undefined", () => {
    expect(parseConfig(undefined)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseConfig("")).toEqual({});
  });

  it("parses valid JSON", () => {
    const raw = JSON.stringify({
      model: "model-v1",
      prompt: "a cat walking",
      parameters: "params",
      template_id: "tmpl-1",
      template_shots: "5",
      story_title: "Cat Story",
      beat_title: "Opening",
    });
    const result = parseConfig(raw);
    expect(result.model).toBe("model-v1");
    expect(result.prompt).toBe("a cat walking");
    expect(result.parameters).toBe("params");
    expect(result.template_id).toBe("tmpl-1");
    expect(result.template_shots).toBe("5");
    expect(result.story_title).toBe("Cat Story");
    expect(result.beat_title).toBe("Opening");
  });

  it("returns empty object for invalid JSON", () => {
    expect(parseConfig("not json")).toEqual({});
  });

  it("returns empty object for partially valid JSON", () => {
    expect(parseConfig("{invalid")).toEqual({});
  });

  it("parses partial fields", () => {
    const raw = JSON.stringify({ model: "model-v2" });
    const result = parseConfig(raw);
    expect(result.model).toBe("model-v2");
    expect(result.prompt).toBeUndefined();
    expect(result.parameters).toBeUndefined();
  });
});

describe("parseProvider", () => {
  it("returns empty object for null", () => {
    expect(parseProvider(null)).toEqual({});
  });

  it("returns empty object for undefined", () => {
    expect(parseProvider(undefined)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseProvider("")).toEqual({});
  });

  it("parses valid JSON", () => {
    const raw = JSON.stringify({
      api_url: "https://api.example.com",
      api_endpoint: "/v1/generate",
      provider_id: "provider-1",
      provider_model_id: "model-abc",
      provider_format: "mp4",
    });
    const result = parseProvider(raw);
    expect(result.api_url).toBe("https://api.example.com");
    expect(result.api_endpoint).toBe("/v1/generate");
    expect(result.provider_id).toBe("provider-1");
    expect(result.provider_model_id).toBe("model-abc");
    expect(result.provider_format).toBe("mp4");
  });

  it("returns empty object for invalid JSON", () => {
    expect(parseProvider("{broken")).toEqual({});
  });

  it("parses partial fields", () => {
    const raw = JSON.stringify({ provider_id: "p-2" });
    const result = parseProvider(raw);
    expect(result.provider_id).toBe("p-2");
    expect(result.api_url).toBeUndefined();
  });
});

describe("parseMediaRefs", () => {
  it("returns empty object for null", () => {
    expect(parseMediaRefs(null)).toEqual({});
  });

  it("returns empty object for undefined", () => {
    expect(parseMediaRefs(undefined)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseMediaRefs("")).toEqual({});
  });

  it("parses valid JSON", () => {
    const raw = JSON.stringify({
      fixed_image_url: "https://cdn.example.com/img.png",
      fixed_image_lock_type: "strict",
      reference_video_url: "https://cdn.example.com/vid.mp4",
      reference_video_mimicry_level: "high",
    });
    const result = parseMediaRefs(raw);
    expect(result.fixed_image_url).toBe("https://cdn.example.com/img.png");
    expect(result.fixed_image_lock_type).toBe("strict");
    expect(result.reference_video_url).toBe("https://cdn.example.com/vid.mp4");
    expect(result.reference_video_mimicry_level).toBe("high");
  });

  it("returns empty object for invalid JSON", () => {
    expect(parseMediaRefs("not-json")).toEqual({});
  });

  it("parses partial fields", () => {
    const raw = JSON.stringify({ fixed_image_url: "https://img.png" });
    const result = parseMediaRefs(raw);
    expect(result.fixed_image_url).toBe("https://img.png");
    expect(result.reference_video_url).toBeUndefined();
  });
});

describe("parseTracking", () => {
  it("returns empty object for null", () => {
    expect(parseTracking(null)).toEqual({});
  });

  it("returns empty object for undefined", () => {
    expect(parseTracking(undefined)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseTracking("")).toEqual({});
  });

  it("parses valid JSON", () => {
    const raw = JSON.stringify({
      last_polled_at: 1700000000,
      poll_count: 5,
      poll_failure_count: 1,
      recovery_attempts: 0,
      expires_at: 1700003600,
      url_obtained_at: 1700001000,
      url_ttl: 3600,
    });
    const result = parseTracking(raw);
    expect(result.last_polled_at).toBe(1700000000);
    expect(result.poll_count).toBe(5);
    expect(result.poll_failure_count).toBe(1);
    expect(result.recovery_attempts).toBe(0);
    expect(result.expires_at).toBe(1700003600);
    expect(result.url_obtained_at).toBe(1700001000);
    expect(result.url_ttl).toBe(3600);
  });

  it("returns empty object for invalid JSON", () => {
    expect(parseTracking("}invalid{")).toEqual({});
  });

  it("parses partial fields", () => {
    const raw = JSON.stringify({ poll_count: 3 });
    const result = parseTracking(raw);
    expect(result.poll_count).toBe(3);
    expect(result.last_polled_at).toBeUndefined();
  });
});
