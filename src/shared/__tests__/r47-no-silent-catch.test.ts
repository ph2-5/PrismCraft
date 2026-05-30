import { describe, it, expect, vi, beforeEach } from "vitest";

describe("R47: Catch blocks must not silently swallow errors", () => {
  let warnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    warnSpy = vi.fn();
  });

  it("should log error when JSON parse fails instead of silently returning default", () => {
    const parseWithLogging = (raw: string, fallback: Record<string, unknown>) => {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch (e) {
        warnSpy("[Module] JSON parse failed", e);
        return fallback;
      }
    };

    const result = parseWithLogging("invalid json", { default: true });

    expect(result).toEqual({ default: true });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      "[Module] JSON parse failed",
      expect.any(SyntaxError),
    );
  });

  it("should NOT call warn when parse succeeds", () => {
    const parseWithLogging = (raw: string, fallback: Record<string, unknown>) => {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch (e) {
        warnSpy("[Module] JSON parse failed", e);
        return fallback;
      }
    };

    const result = parseWithLogging('{"key":"value"}', { default: true });

    expect(result).toEqual({ key: "value" });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("empty catch block hides failure — anti-pattern demonstration", () => {
    const results: string[] = [];

    const silentCatch = (raw: string) => {
      try {
        JSON.parse(raw);
        results.push("success");
      } catch {
        results.push("fallback");
      }
    };

    silentCatch("invalid json");

    expect(results).toEqual(["fallback"]);
  });

  it("catch with logging preserves error observability", () => {
    const errorLog: Array<{ message: string; error: unknown }> = [];

    const loggingCatch = (raw: string) => {
      try {
        return JSON.parse(raw);
      } catch (e) {
        errorLog.push({ message: "parse failed", error: e });
        return null;
      }
    };

    loggingCatch("broken{{{");

    expect(errorLog).toHaveLength(1);
    expect(errorLog[0].error).toBeInstanceOf(SyntaxError);
  });

  it("cleanup operations (revokeObjectURL) are acceptable without logging", () => {
    const revokeSpy = vi.fn();
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = revokeSpy;

    const cleanup = (blobUrl: string | null) => {
      if (blobUrl) {
        try {
          URL.revokeObjectURL(blobUrl);
        } catch {
          // Cleanup failure is inconsequential — no logging needed
        }
      }
    };

    cleanup("blob:test");
    expect(revokeSpy).toHaveBeenCalledWith("blob:test");

    URL.revokeObjectURL = originalRevoke;
  });
});
