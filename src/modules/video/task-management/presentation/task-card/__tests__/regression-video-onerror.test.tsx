import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";
import type { VideoTask } from "@/domain/schemas";

vi.mock("@/shared/ui/button", () => ({
  Button: ({ children, onClick, ...props }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock("@/shared/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("lucide-react", () => ({
  Video: () => <span>VideoIcon</span>,
  Download: () => <span>DownloadIcon</span>,
  Trash2: () => <span>TrashIcon</span>,
  Play: () => <span>PlayIcon</span>,
  ChevronRight: () => <span>ChevronIcon</span>,
  VideoOff: () => <span>VideoOffIcon</span>,
}));

vi.mock("@/shared/constants", () => ({
  t: (key: string) => key,
}));

vi.mock("@/modules/video/task-management", () => ({}));

import { VideoPreview } from "../video-preview";

function createTask(overrides = {}) {
  return {
    taskId: "task-1",
    videoUrl: "https://example.com/video.mp4",
    status: "completed",
    prompt: "test",
    ...overrides,
  } as VideoTask;
}

describe("R84: React Declarative onError Regression Tests", () => {
  it("should show fallback when video fails to load", () => {
    const task = createTask();
    const { container } = render(
      <VideoPreview
        task={task}
        onOpenPreview={vi.fn()}
        onOpenDetail={vi.fn()}
        onDownloadVideo={vi.fn()}
        onDeleteCache={vi.fn()}
      />,
    );

    const video = container.querySelector("video")!;
    expect(video).toBeTruthy();

    fireEvent.error(video);

    expect(container.querySelector("video")).toBeNull();
    expect(container.textContent).toContain("VideoOffIcon");
  });

  it("should reset error state when videoUrl changes", () => {
    const { rerender, container } = render(
      <VideoPreview
        task={createTask({ videoUrl: "https://old.com/video.mp4" })}
        onOpenPreview={vi.fn()}
        onOpenDetail={vi.fn()}
        onDownloadVideo={vi.fn()}
        onDeleteCache={vi.fn()}
      />,
    );

    const video = container.querySelector("video")!;
    fireEvent.error(video);
    expect(container.querySelector("video")).toBeNull();

    rerender(
      <VideoPreview
        task={createTask({ videoUrl: "https://new.com/video.mp4" })}
        onOpenPreview={vi.fn()}
        onOpenDetail={vi.fn()}
        onDownloadVideo={vi.fn()}
        onDeleteCache={vi.fn()}
      />,
    );

    expect(container.querySelector("video")).toBeTruthy();
  });

  it("should NOT use DOM manipulation in onError handler", () => {
    const appendChildSpy = vi.spyOn(Node.prototype, "appendChild");
    const task = createTask();
    const { container } = render(
      <VideoPreview
        task={task}
        onOpenPreview={vi.fn()}
        onOpenDetail={vi.fn()}
        onDownloadVideo={vi.fn()}
        onDeleteCache={vi.fn()}
      />,
    );

    appendChildSpy.mockClear();

    const video = container.querySelector("video")!;
    fireEvent.error(video);

    const programmaticAppends = appendChildSpy.mock.calls.filter(
      (call) => {
        const child = call[0] as HTMLElement;
        return child.className?.includes?.("video-fallback") ||
               child.className?.includes?.("fallback");
      },
    );
    expect(programmaticAppends.length).toBe(0);

    appendChildSpy.mockRestore();
  });

  it("should not render video when videoUrl is null", () => {
    const task = createTask({ videoUrl: null });
    const { container } = render(
      <VideoPreview
        task={task}
        onOpenPreview={vi.fn()}
        onOpenDetail={vi.fn()}
        onDownloadVideo={vi.fn()}
        onDeleteCache={vi.fn()}
      />,
    );

    expect(container.querySelector("video")).toBeNull();
    expect(container.innerHTML).toBe("");
  });
});
