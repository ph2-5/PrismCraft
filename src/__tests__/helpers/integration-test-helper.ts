import { vi } from "vitest";
import { type createDiContainerMock, mockDiContainer } from "../mocks/di-container";
import type { ConsistencyCheckResult } from "@/domain/schemas/shot-system";
import * as factories from "../factories";

export interface MockApiResponses {
  textGeneration: (text: string) => void;
  imageGeneration: (url: string) => void;
  videoGeneration: (taskId: string) => void;
  videoStatus: (status: string, videoUrl?: string) => void;
  consistencyCheck: (result: ConsistencyCheckResult) => void;
  error: (code: string, message: string) => void;
}

export interface IntegrationTestContext {
  container: ReturnType<typeof createDiContainerMock>;
  factories: typeof factories;
  mockApiResponses: MockApiResponses;
  cleanup: () => void;
}

export function setupIntegrationTest(overrides?: Record<string, unknown>): IntegrationTestContext {
  const container = mockDiContainer(overrides);

  const mockApiResponses: MockApiResponses = {
    textGeneration(text: string) {
      container.textProvider.generateText.mockResolvedValue({
        success: true,
        data: { text },
      });
    },

    imageGeneration(url: string) {
      container.imageProvider.generateImage.mockResolvedValue({
        success: true,
        data: { imageUrl: url },
      });
    },

    videoGeneration(taskId: string) {
      container.videoProvider.generateVideo.mockResolvedValue({
        success: true,
        data: { videoUrl: `https://mock-cdn.example.com/videos/${taskId}.mp4`, taskId },
      });
    },

    videoStatus(status: string, videoUrl?: string) {
      container.videoProvider.queryVideoStatus.mockResolvedValue({
        success: true,
        data: {
          status,
          videoUrl: videoUrl ?? "https://mock-cdn.example.com/videos/completed.mp4",
        },
      });
    },

    consistencyCheck(result: ConsistencyCheckResult) {
      container.imageApi = {
        analyze: vi.fn().mockResolvedValue({ success: true, data: result }),
      };
    },

    error(code: string, message: string) {
      const errorResponse = { success: false, error: message, code };
      container.textProvider.generateText.mockResolvedValue(errorResponse);
      container.imageProvider.generateImage.mockResolvedValue(errorResponse);
      container.videoProvider.generateVideo.mockResolvedValue(errorResponse);
      container.videoProvider.queryVideoStatus.mockResolvedValue(errorResponse);
      container.videoProvider.generateKeyframe.mockResolvedValue(errorResponse);
      container.videoProvider.generateFramePair.mockResolvedValue(errorResponse);
      container.videoProvider.generateVideoWithFrames.mockResolvedValue(errorResponse);
    },
  };

  function cleanup() {
    vi.restoreAllMocks();
  }

  return {
    container,
    factories,
    mockApiResponses,
    cleanup,
  };
}

export {
  integrationFactories,
} from "../factories";
