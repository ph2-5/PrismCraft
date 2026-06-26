/**
 * R166: Date Formatting MUST Use toLocaleString()/toLocaleTimeString() Without Hardcoded "zh-CN" Locale
 *
 * 回归规则目的：
 *   用户可见的 Date 格式化必须用 toLocaleString() / toLocaleTimeString()，
 *   不传硬编码 "zh-CN" locale 参数，让 OS/浏览器 locale 决定显示格式。
 *   硬编码 "zh-CN" 会强制所有用户看中文格式，破坏 i18n。
 *
 * 被测代码：
 *   src/shared/presentation/CrashRecoveryDialog.tsx（及其他 user-facing 组件）
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

const { mockConfirm, mockDeleteAutoSave, mockLoadAutoSaves, mockIsElectron, mockT, mockErrorLogger } = vi.hoisted(() => ({
  mockConfirm: vi.fn().mockResolvedValue(true),
  mockDeleteAutoSave: vi.fn().mockResolvedValue(undefined),
  mockLoadAutoSaves: vi.fn(),
  mockIsElectron: vi.fn(() => true),
  mockT: vi.fn((key: string, params?: Record<string, unknown>) => {
    if (key === "crash.unsavedDataDesc" && params) {
      return `发现 ${params.count ?? 0} 条自动保存记录，时间：${params.time ?? ""}`;
    }
    const map: Record<string, string> = {
      "crash.dismissConfirmMsg": "确认清除？",
      "crash.dismissConfirmTitle": "清除",
      "crash.unsavedData": "未保存数据",
      "crash.dismissAndClearConfirm": "清除并忽略",
      "crash.acknowledged": "我知道了",
      "crash.unknownTime": "未知时间",
      "crash.unknownType": "未知类型",
      "crash.moreRecords": `还有 ${params?.count ?? 0} 条`,
    };
    return map[key] ?? key;
  }),
  mockErrorLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/shared/utils/confirm", () => ({
  confirm: mockConfirm,
}));

vi.mock("@/shared/utils/platform", () => ({
  isElectron: mockIsElectron,
}));

vi.mock("@/shared/constants", () => ({
  t: mockT,
}));

vi.mock("@/shared/error-logger", () => ({
  errorLogger: mockErrorLogger,
}));

import { CrashRecoveryDialog } from "../CrashRecoveryDialog";

async function globTsx(dir: string, results: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "__tests__") continue;
      await globTsx(full, results);
    } else if (entry.isFile() && /\.tsx$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe("R166: 日期格式化不得硬编码 zh-CN locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadAutoSaves.mockResolvedValue([
      { id: "save-1", type: "story", data_json: "{}", timestamp: Date.now() - 1000 },
    ]);
    mockIsElectron.mockReturnValue(true);
  });

  it("CrashRecoveryDialog.tsx 源码不含 toLocaleString('zh-CN')", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/CrashRecoveryDialog.tsx"),
      "utf-8",
    );
    expect(source).not.toMatch(/toLocaleString\(\s*["']zh-CN["']/);
    expect(source).not.toMatch(/toLocaleTimeString\(\s*["']zh-CN["']/);
  });

  it("CrashRecoveryDialog.tsx 调用 toLocaleString() 时不传 locale 参数", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/CrashRecoveryDialog.tsx"),
      "utf-8",
    );
    // 应有 toLocaleString() 调用，且括号内为空或仅 options 对象（无 'zh-CN' 字符串）
    expect(source).toMatch(/\.toLocaleString\(\s*\)/);
    expect(source).toMatch(/\.toLocaleTimeString\(\s*\)/);
  });

  it("CrashRecoveryDialog 渲染时不强制 zh-CN locale", async () => {
    // 渲染 CrashRecoveryDialog，验证 saveTime 用 toLocaleString() 默认 locale
    // timestamp 必须在 24h 内，否则被 recentSaves 过滤掉
    const ts = Date.now() - 1000;
    mockLoadAutoSaves.mockResolvedValue([
      { id: "save-x", type: "story", data_json: "{}", timestamp: ts },
    ]);

    render(
      <CrashRecoveryDialog
        loadAutoSaves={mockLoadAutoSaves}
        deleteAutoSave={mockDeleteAutoSave}
      />,
    );

    // 等待 effect 加载 autoSaves 并 open
    const dialog = await screen.findByText("未保存数据");
    expect(dialog).not.toBeNull();

    // 验证 t() 被调用时传入的 time 参数是用 toLocaleString() 默认 locale 生成的
    // （非 zh-CN 强制）—— 通过检查 t("crash.unsavedDataDesc") 调用 params.time
    const unsavedDataDescCall = mockT.mock.calls.find(
      ([key]) => key === "crash.unsavedDataDesc",
    );
    expect(unsavedDataDescCall).toBeDefined();
    const timeParam = unsavedDataDescCall![1]?.time as string;
    // time 应该是 Date(ts).toLocaleString() 的结果
    expect(timeParam).toBe(new Date(ts).toLocaleString());
  });

  it("src/shared/presentation/*.tsx 不应出现 toLocaleString('zh-CN') 或 toLocaleTimeString('zh-CN')", async () => {
    // R166 的批次 3 范围聚焦于 shared/presentation（CrashRecoveryDialog 所在目录）。
    // 其他模块的 zh-CN 残留为既有技术债，不在本批次回归防护范围内。
    const tsxFiles = await globTsx(join(process.cwd(), "src/shared/presentation"));
    const offenders: string[] = [];
    const ZH_CN_LOCALE_REGEX = /toLocale(String|TimeString)\(\s*["']zh-CN["']/;
    for (const file of tsxFiles) {
      const source = await readFile(file, "utf-8");
      if (ZH_CN_LOCALE_REGEX.test(source)) {
        offenders.push(file);
      }
    }
    expect(
      offenders,
      `以下文件硬编码了 zh-CN locale：${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("CrashRecoveryDialog 渲染 saveTime 时用默认 locale（不强制中文格式）", async () => {
    // 用 spy 验证 Date.prototype.toLocaleString 调用时不传 "zh-CN"
    const toLocaleStringSpy = vi.spyOn(Date.prototype, "toLocaleString");
    const toLocaleTimeStringSpy = vi.spyOn(Date.prototype, "toLocaleTimeString");

    mockLoadAutoSaves.mockResolvedValue([
      { id: "save-1", type: "story", data_json: "{}", timestamp: Date.now() - 1000 },
      { id: "save-2", type: "beat", data_json: "{}", timestamp: Date.now() - 2000 },
    ]);

    render(
      <CrashRecoveryDialog
        loadAutoSaves={mockLoadAutoSaves}
        deleteAutoSave={mockDeleteAutoSave}
      />,
    );

    await screen.findByText("未保存数据");

    // 至少调用了一次 toLocaleString（用于 saveTime）
    expect(toLocaleStringSpy).toHaveBeenCalled();
    // 所有调用的第一个参数都不应是 "zh-CN"
    for (const call of toLocaleStringSpy.mock.calls) {
      const firstArg = call[0];
      expect(firstArg).not.toBe("zh-CN");
    }
    // toLocaleTimeString 同理
    for (const call of toLocaleTimeStringSpy.mock.calls) {
      const firstArg = call[0];
      expect(firstArg).not.toBe("zh-CN");
    }

    toLocaleStringSpy.mockRestore();
    toLocaleTimeStringSpy.mockRestore();
  });

  it("CrashRecoveryDialog 用 toLocaleString() 而非 toLocaleString('zh-CN')", async () => {
    // 通过 spy 验证：当时间戳存在时调用 toLocaleString 且不传 locale
    const toLocaleStringSpy = vi.spyOn(Date.prototype, "toLocaleString");

    // timestamp 必须在 24h 内，否则被 recentSaves 过滤掉
    const validTs = Date.now() - 1000;
    mockLoadAutoSaves.mockResolvedValue([
      { id: "save-valid", type: "story", data_json: "{}", timestamp: validTs },
    ]);

    render(
      <CrashRecoveryDialog
        loadAutoSaves={mockLoadAutoSaves}
        deleteAutoSave={mockDeleteAutoSave}
      />,
    );

    await screen.findByText("未保存数据");

    // 应该有一次 toLocaleString 调用，参数列表为空（默认 locale）
    const callsWithNoLocale = toLocaleStringSpy.mock.calls.filter(
      (call) => call.length === 0,
    );
    expect(callsWithNoLocale.length).toBeGreaterThanOrEqual(1);

    toLocaleStringSpy.mockRestore();
  });

  it("CrashRecoveryDialog 源码包含 t('crash.unknownTime') 作为 timestamp 缺失的回退", async () => {
    const source = await readFile(
      join(process.cwd(), "src/shared/presentation/CrashRecoveryDialog.tsx"),
      "utf-8",
    );
    // 验证源码有 unknownTime 回退逻辑（作为 timestamp falsy 时的分支）
    expect(source).toMatch(/crash\.unknownTime/);
    // 回退分支用三元运算符：timestamp ? toLocaleString() : t("crash.unknownTime")
    expect(source).toMatch(/timestamp\s*\?[^:]*\.toLocaleString\(\)\s*:\s*t\(["']crash\.unknownTime["']\)/);
  });
});
