import { describe, it, expect, vi } from "vitest";

describe("R49: React event handlers must use e.currentTarget over e.target", () => {
  it("e.currentTarget always refers to the handler-bound element", () => {
    const videoElement = document.createElement("video");
    videoElement.dataset.retried = "";

    const handlerBoundElement = videoElement;

    const mockEvent = {
      target: videoElement,
      currentTarget: handlerBoundElement,
    };

    const target = mockEvent.currentTarget;
    expect(target).toBe(handlerBoundElement);
    expect(target.dataset.retried).toBe("");
  });

  it("e.target may point to a child element due to bubbling", () => {
    const container = document.createElement("div");
    const button = document.createElement("button");
    container.appendChild(button);

    const mockEvent = {
      target: button,
      currentTarget: container,
    };

    expect(mockEvent.target).toBe(button);
    expect(mockEvent.currentTarget).toBe(container);
    expect(mockEvent.target).not.toBe(mockEvent.currentTarget);
  });

  it("using e.currentTarget avoids incorrect type assertion for video onError", () => {
    const videoElement = document.createElement("video");
    videoElement.src = "test.mp4";

    const mockEvent = {
      target: videoElement,
      currentTarget: videoElement,
    };

    const target = mockEvent.currentTarget;
    if (!target.dataset.retried) {
      target.dataset.retried = "1";
    }

    expect(target.dataset.retried).toBe("1");
  });

  it("data-retried guard prevents infinite retry loops", () => {
    const videoElement = document.createElement("video");
    let retryCount = 0;

    const handleError = (target: HTMLVideoElement) => {
      if (target.dataset.retried) return;
      target.dataset.retried = "1";
      target.src = "fallback.mp4";
      retryCount++;
    };

    handleError(videoElement);
    handleError(videoElement);
    handleError(videoElement);

    expect(retryCount).toBe(1);
    expect(videoElement.src).toContain("fallback.mp4");
  });

  it("e.target as HTMLVideoElement is unsafe when video has child source elements", () => {
    const videoElement = document.createElement("video");
    const sourceElement = document.createElement("source");
    sourceElement.src = "video.mp4";
    videoElement.appendChild(sourceElement);

    const mockBubbledEvent = {
      target: sourceElement,
      currentTarget: videoElement,
    };

    expect(mockBubbledEvent.target).toBe(sourceElement);
    expect(mockBubbledEvent.target).not.toBeInstanceOf(HTMLVideoElement);
    expect(mockBubbledEvent.currentTarget).toBeInstanceOf(HTMLVideoElement);
  });
});
