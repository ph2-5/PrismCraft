import { describe, it, expect } from "vitest";
import { t, hasMessage, getAllMessages } from "../../constants/messages";

describe("t()", () => {
  it("returns correct value for known key", () => {
    expect(t("common.save")).toBe("保存");
    expect(t("error.unknown")).toBe("未知错误");
    expect(t("success.saved")).toBe("保存成功");
  });

  it("returns key itself for unknown key", () => {
    expect(t("nonexistent.key")).toBe("nonexistent.key");
    expect(t("foo.bar.baz")).toBe("foo.bar.baz");
  });

  it("replaces single parameter", () => {
    expect(t("video.consecutivePollFailed", { count: 3 })).toBe(
      "连续3次轮询失败，任务已标记为失败"
    );
  });

  it("replaces multiple parameters", () => {
    expect(t("config.configuredCount", { count: 2, total: 5 })).toBe(
      "已配置 2/5 项功能"
    );
  });

  it("converts numeric parameter to string via String(v)", () => {
    expect(t("success.deletedCount", { count: 10 })).toBe("已删除 10 个");
    expect(t("error.imageSizeMin", { size: 512 })).toBe("最小允许尺寸: 512");
  });

  it("returns key when params provided but key not found", () => {
    expect(t("missing.key", { count: 1 })).toBe("missing.key");
  });

  it("does not replace placeholders when no params provided", () => {
    expect(t("error.taskStatus")).toBe("任务状态: {status}");
  });
});

describe("hasMessage()", () => {
  it("returns true for known key", () => {
    expect(hasMessage("common.save")).toBe(true);
    expect(hasMessage("video.consecutivePollFailed")).toBe(true);
    expect(hasMessage("config.configuredCount")).toBe(true);
  });

  it("returns false for unknown key", () => {
    expect(hasMessage("nonexistent.key")).toBe(false);
    expect(hasMessage("")).toBe(false);
  });
});

describe("getAllMessages()", () => {
  it("returns object containing all keys", () => {
    const all = getAllMessages();
    expect(all["common.save"]).toBe("保存");
    expect(all["error.unknown"]).toBe("未知错误");
    expect(all["success.saved"]).toBe("保存成功");
    expect(all["video.consecutivePollFailed"]).toBe(
      "连续{count}次轮询失败，任务已标记为失败"
    );
  });

  it("returns the same reference on each call", () => {
    const first = getAllMessages();
    const second = getAllMessages();
    expect(first).toBe(second);
  });
});
