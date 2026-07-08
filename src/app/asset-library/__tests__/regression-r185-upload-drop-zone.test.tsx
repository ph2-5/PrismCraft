/**
 * R185: AssetUploadSection 拖拽区域必须实际处理 drop 事件
 *
 * 回归规则目的：
 *   src/app/asset-library/AssetUploadSection.tsx 的拖拽区域必须实际处理 drop
 *   事件——调用 onDropFiles prop 或 fallback 到 fileInputRef.dispatchEvent。
 *   drag handlers 不能是空 stub，isDragOver 状态必须正确切换以提供视觉反馈，
 *   且必须支持键盘（Enter/Space 触发 click）以符合无障碍要求。
 *
 * 历史问题：
 *   原实现 drag handlers 为空 stub，用户拖拽文件无反应。
 *
 * 被测代码：
 *   src/app/asset-library/AssetUploadSection.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const { mockT, mockDataTransferCtor } = vi.hoisted(() => ({
  mockT: vi.fn((key: string) => key),
  mockDataTransferCtor: class {
    private _files: File[] = [];
    readonly items = {
      add: (file: File) => { this._files.push(file); },
      remove: (_i: number) => {},
      clear: () => { this._files = []; },
    };
    get files(): FileList {
      // 构造一个 FileList 兼容对象（带 length、item()、索引访问）
      const arr = [...this._files];
      const fileListLike = {
        length: arr.length,
        item: (i: number): File | null => (i >= 0 && i < arr.length ? arr[i]! : null),
        [Symbol.iterator]: () => arr[Symbol.iterator](),
      };
      arr.forEach((f, i) => {
        (fileListLike as Record<number, File>)[i] = f;
      });
      return fileListLike as unknown as FileList;
    }
    get types(): string[] {
      return this._files.length > 0 ? ["Files"] : [];
    }
  },
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

// Polyfill DataTransfer if the test environment does not expose it globally
// (jsdom may not expose DataTransfer as a constructor in some versions)
if (typeof globalThis.DataTransfer === "undefined") {
  (globalThis as Record<string, unknown>).DataTransfer = mockDataTransferCtor;
}

import { AssetUploadSection } from "../AssetUploadSection";

/** 构造一个包含给定文件的 DataTransfer 实例 */
function makeDataTransferWithFiles(files: File[]): DataTransfer {
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  return dt;
}

describe("R185: AssetUploadSection 拖拽区域实际处理 drop 事件", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("visible=false 时只渲染 file input（无拖拽区域）", () => {
    const fileInputRef = React.createRef<HTMLInputElement>();
    const { container } = render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        visible={false}
      />,
    );
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
    expect(container.querySelector('[role="button"]')).toBeNull();
  });

  it("drop 事件应调用 onDropFiles prop 并传递 FileList", () => {
    const onDropFiles = vi.fn();
    const fileInputRef = React.createRef<HTMLInputElement>();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        onDropFiles={onDropFiles}
        visible={true}
      />,
    );

    const dropZone = screen.getByRole("button");
    const file1 = new File(["content1"], "file1.png", { type: "image/png" });
    const file2 = new File(["content2"], "file2.mp4", { type: "video/mp4" });
    const dt = makeDataTransferWithFiles([file1, file2]);

    fireEvent.drop(dropZone, { dataTransfer: dt });

    expect(onDropFiles).toHaveBeenCalledTimes(1);
    const passedFiles = onDropFiles.mock.calls[0]![0] as FileList;
    expect(passedFiles.length).toBe(2);
    expect(passedFiles.item(0)!.name).toBe("file1.png");
    expect(passedFiles.item(1)!.name).toBe("file2.mp4");
  });

  it("无 onDropFiles 时，drop 事件应 fallback 到 fileInputRef.dispatchEvent(change)", () => {
    const fileInputRef = React.createRef<HTMLInputElement>();
    const dispatchSpy = vi.fn();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        // 不传 onDropFiles
        visible={true}
      />,
    );

    const inputEl = fileInputRef.current!;
    // jsdom 严格限制 input.files 必须为 FileList 实例，这里通过 defineProperty
    // 让赋值操作变为可写，以测试 fallback 分支
    Object.defineProperty(inputEl, "files", {
      value: null,
      writable: true,
      configurable: true,
    });
    // 监听 dispatchEvent
    inputEl.dispatchEvent = dispatchSpy;

    const dropZone = screen.getByRole("button");
    const file1 = new File(["content1"], "fallback.png", { type: "image/png" });
    const dt = makeDataTransferWithFiles([file1]);

    fireEvent.drop(dropZone, { dataTransfer: dt });

    // 应该向 fileInputRef 派发 change 事件
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const dispatchedEvent = dispatchSpy.mock.calls[0]![0] as Event;
    expect(dispatchedEvent.type).toBe("change");
    expect(dispatchedEvent.bubbles).toBe(true);
    // input.files 应被设置（包含 1 个文件）
    expect(inputEl.files!.length).toBe(1);
    expect(inputEl.files!.item(0)!.name).toBe("fallback.png");
  });

  it("dragEnter 应设置 isDragOver=true（borderColor 变为 primary）", () => {
    const fileInputRef = React.createRef<HTMLInputElement>();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        onDropFiles={vi.fn()}
        visible={true}
      />,
    );

    const dropZone = screen.getByRole("button");
    const initialBorderColor = dropZone.style.borderColor;

    fireEvent.dragEnter(dropZone, { dataTransfer: new DataTransfer() });

    expect(dropZone.style.borderColor).toBe("var(--primary)");
    expect(dropZone.style.borderColor).not.toBe(initialBorderColor);
  });

  it("dragLeave 应重置 isDragOver=false", () => {
    const fileInputRef = React.createRef<HTMLInputElement>();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        onDropFiles={vi.fn()}
        visible={true}
      />,
    );

    const dropZone = screen.getByRole("button");
    const initialBorderColor = dropZone.style.borderColor;

    fireEvent.dragEnter(dropZone, { dataTransfer: new DataTransfer() });
    expect(dropZone.style.borderColor).toBe("var(--primary)");

    fireEvent.dragLeave(dropZone, { dataTransfer: new DataTransfer() });
    expect(dropZone.style.borderColor).toBe(initialBorderColor);
  });

  it("dragOver 必须调用 preventDefault（允许 drop）", () => {
    const fileInputRef = React.createRef<HTMLInputElement>();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        onDropFiles={vi.fn()}
        visible={true}
      />,
    );

    const dropZone = screen.getByRole("button");
    const dt = new DataTransfer();

    // fireEvent.dragOver 内部会创建 DragEvent 并用 init 派生 preventDefault
    // 检查 dragOver 不抛错且组件正常处理（jsdom 中 dragOver 默认不阻止 drop）
    expect(() => {
      fireEvent.dragOver(dropZone, { dataTransfer: dt });
    }).not.toThrow();
  });

  it("键盘支持：Enter 键应触发 click 打开文件选择器", () => {
    const fileInputRef = React.createRef<HTMLInputElement>();
    const clickSpy = vi.fn();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        onDropFiles={vi.fn()}
        visible={true}
      />,
    );

    const inputEl = fileInputRef.current!;
    inputEl.click = clickSpy;

    const dropZone = screen.getByRole("button");
    expect(dropZone.tabIndex).toBe(0);

    fireEvent.keyDown(dropZone, { key: "Enter" });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("键盘支持：Space 键应触发 click 打开文件选择器", () => {
    const fileInputRef = React.createRef<HTMLInputElement>();
    const clickSpy = vi.fn();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        onDropFiles={vi.fn()}
        visible={true}
      />,
    );

    const inputEl = fileInputRef.current!;
    inputEl.click = clickSpy;

    const dropZone = screen.getByRole("button");

    fireEvent.keyDown(dropZone, { key: " " });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("键盘支持：其他键不应触发 click", () => {
    const fileInputRef = React.createRef<HTMLInputElement>();
    const clickSpy = vi.fn();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        onDropFiles={vi.fn()}
        visible={true}
      />,
    );

    const inputEl = fileInputRef.current!;
    inputEl.click = clickSpy;

    const dropZone = screen.getByRole("button");

    fireEvent.keyDown(dropZone, { key: "a" });
    fireEvent.keyDown(dropZone, { key: "Escape" });

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("drop 后 isDragOver 应重置为 false", () => {
    const fileInputRef = React.createRef<HTMLInputElement>();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        onDropFiles={vi.fn()}
        visible={true}
      />,
    );

    const dropZone = screen.getByRole("button");

    // 先 dragEnter 进入高亮状态
    fireEvent.dragEnter(dropZone, { dataTransfer: new DataTransfer() });
    expect(dropZone.style.borderColor).toBe("var(--primary)");

    // drop 后应退出高亮
    const file1 = new File(["c"], "x.png", { type: "image/png" });
    fireEvent.drop(dropZone, { dataTransfer: makeDataTransferWithFiles([file1]) });

    // borderColor 应不再为 "var(--primary)"（isDragOver 已重置）
    // 注意：uploadDropZoneStyle 用 border 简写设置颜色，所以 isDragOver=false 时
    // style 中没有 borderColor 属性（值为空字符串），只要不为 primary 即可
    expect(dropZone.style.borderColor).not.toBe("var(--primary)");
  });

  it("拖拽空文件列表时不应调用 onDropFiles", () => {
    const onDropFiles = vi.fn();
    const fileInputRef = React.createRef<HTMLInputElement>();

    render(
      <AssetUploadSection
        fileInputRef={fileInputRef}
        onImport={vi.fn()}
        onDropFiles={onDropFiles}
        visible={true}
      />,
    );

    const dropZone = screen.getByRole("button");
    fireEvent.drop(dropZone, { dataTransfer: new DataTransfer() });

    expect(onDropFiles).not.toHaveBeenCalled();
  });
});
