import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/config", () => {
    return HttpResponse.json({
      providers: [
        { id: "seedance", name: "Seedance", models: [{ id: "seedance-v1", capabilities: ["video"] }] },
        { id: "kuaishou", name: "可灵AI", models: [{ id: "kling-v1", capabilities: ["video"] }] },
        { id: "pixverse", name: "Pixverse", models: [{ id: "pixverse-v1", capabilities: ["video"] }] },
      ],
    });
  }),

  http.post("/api/generate-video", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.prompt) {
      return HttpResponse.json(
        { error: "Missing prompt", code: "CONFIG_MISSING" },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      task_id: "mock_task_12345",
      status: "pending",
      estimated_time: 30,
    });
  }),

  http.post("/api/generate-image", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.prompt) {
      return HttpResponse.json(
        { error: "Missing prompt", code: "CONFIG_MISSING" },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      task_id: "mock_img_task_12345",
      status: "completed",
      url: "https://mock.image/fake.png",
    });
  }),

  http.post("/api/generate-keyframe", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.content && !body.characterRef) {
      return HttpResponse.json(
        { error: "Missing content or characterRef", code: "CONFIG_MISSING" },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      task_id: "mock_keyframe_12345",
      status: "completed",
      url: "https://mock.image/keyframe.png",
    });
  }),

  http.post("/api/generate-frame-pair", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;

    if (!body.keyframeUrl) {
      return HttpResponse.json(
        { error: "Missing keyframeUrl", code: "CONFIG_MISSING" },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      task_id: "mock_framepair_12345",
      status: "completed",
      first_frame_url: "https://mock.image/first.png",
      last_frame_url: "https://mock.image/last.png",
    });
  }),

  http.get("/api/video-status/:taskId", ({ params }) => {
    const { taskId } = params;

    if (taskId === "mock_not_found") {
      return HttpResponse.json(
        { error: "Task not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    return HttpResponse.json({
      task_id: taskId,
      status: "completed",
      url: `https://mock.video/${taskId}.mp4`,
      progress: 100,
    });
  }),

  http.get("/api/models", () => {
    return HttpResponse.json({
      models: [
        { id: "seedance-v1", name: "Seedance V1", provider: "seedance" },
        { id: "kling-v1", name: "可灵 V1", provider: "kuaishou" },
      ],
    });
  }),

  http.post("/api/test-connection", async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const apiKey = body.api_key as string | undefined;

    if (!apiKey || apiKey === "invalid") {
      return HttpResponse.json(
        { error: "Invalid API Key", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    return HttpResponse.json({ success: true, message: "Connection successful" });
  }),

  http.post("/api/upload", async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return HttpResponse.json(
        { error: "No file provided", code: "BAD_REQUEST" },
        { status: 400 },
      );
    }

    return HttpResponse.json({
      url: `https://mock.upload/${file.name}`,
      filename: file.name,
      size: file.size,
    });
  }),
];
