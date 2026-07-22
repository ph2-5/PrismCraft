import { describe, it, expect, vi } from "vitest";
import { createIdempotentMigration } from "../create-idempotent-migration";

describe("createIdempotentMigration", () => {
  describe("initialize 基础行为", () => {
    it("首次调用应执行 migrationFn 并返回其值", async () => {
      const migrationFn = vi.fn().mockResolvedValue(42);
      const migration = createIdempotentMigration(migrationFn, vi.fn());

      const result = await migration.initialize();

      expect(result).toBe(42);
      expect(migrationFn).toHaveBeenCalledTimes(1);
    });

    it("返回值为 0 时也应正常返回（边界情况）", async () => {
      const migrationFn = vi.fn().mockResolvedValue(0);
      const migration = createIdempotentMigration(migrationFn, vi.fn());

      const result = await migration.initialize();

      expect(result).toBe(0);
    });

    it("应正确返回较大的迁移记录数", async () => {
      const migrationFn = vi.fn().mockResolvedValue(9999);
      const migration = createIdempotentMigration(migrationFn, vi.fn());

      const result = await migration.initialize();

      expect(result).toBe(9999);
    });
  });

  describe("单例 Promise 缓存", () => {
    it("多次调用 initialize 应只执行一次 migrationFn（共享内部 Promise）", async () => {
      const migrationFn = vi.fn().mockResolvedValue(10);
      const migration = createIdempotentMigration(migrationFn, vi.fn());

      // initialize 是 async function，每次调用返回新 Promise 包装，
      // 但内部共享同一个 migrationPromise，故 migrationFn 只执行一次
      const p1 = migration.initialize();
      const p2 = migration.initialize();
      const p3 = migration.initialize();

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBe(10);
      expect(r2).toBe(10);
      expect(r3).toBe(10);
      expect(migrationFn).toHaveBeenCalledTimes(1);
    });

    it("多次 await 应得到相同结果", async () => {
      const migrationFn = vi.fn().mockResolvedValue(7);
      const migration = createIdempotentMigration(migrationFn, vi.fn());

      const r1 = await migration.initialize();
      const r2 = await migration.initialize();
      const r3 = await migration.initialize();

      expect(r1).toBe(7);
      expect(r2).toBe(7);
      expect(r3).toBe(7);
      expect(migrationFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("失败处理", () => {
    it("migrationFn 抛出异常时应调用 onError 并返回 0", async () => {
      const error = new Error("migration failed");
      const migrationFn = vi.fn().mockRejectedValue(error);
      const onError = vi.fn();
      const migration = createIdempotentMigration(migrationFn, onError);

      const result = await migration.initialize();

      expect(result).toBe(0);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(error);
    });

    it("应传递非 Error 类型错误到 onError", async () => {
      const errorObj = { code: "DB_ERROR", detail: "table missing" };
      const migrationFn = vi.fn().mockRejectedValue(errorObj);
      const onError = vi.fn();
      const migration = createIdempotentMigration(migrationFn, onError);

      await migration.initialize();

      expect(onError).toHaveBeenCalledWith(errorObj);
    });

    it("应传递原始值错误到 onError", async () => {
      const migrationFn = vi.fn().mockRejectedValue("string error");
      const onError = vi.fn();
      const migration = createIdempotentMigration(migrationFn, onError);

      const result = await migration.initialize();

      expect(result).toBe(0);
      expect(onError).toHaveBeenCalledWith("string error");
    });

    it("失败后应允许重试（Promise 已重置）", async () => {
      let attempt = 0;
      const migrationFn = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt === 1) return Promise.reject(new Error("first"));
        return Promise.resolve(5);
      });
      const migration = createIdempotentMigration(migrationFn, vi.fn());

      const r1 = await migration.initialize();
      const r2 = await migration.initialize();

      expect(r1).toBe(0);
      expect(r2).toBe(5);
      expect(migrationFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("resetState", () => {
    it("resetState 后再次 initialize 应重新执行 migrationFn", async () => {
      const migrationFn = vi.fn().mockResolvedValue(3);
      const migration = createIdempotentMigration(migrationFn, vi.fn());

      await migration.initialize();
      expect(migrationFn).toHaveBeenCalledTimes(1);

      migration.resetState();

      const result = await migration.initialize();
      expect(result).toBe(3);
      expect(migrationFn).toHaveBeenCalledTimes(2);
    });

    it("未触发过 initialize 时 resetState 不应抛异常", () => {
      const migration = createIdempotentMigration(vi.fn(), vi.fn());
      expect(() => migration.resetState()).not.toThrow();
    });

    it("resetState 不应调用 migrationFn", () => {
      const migrationFn = vi.fn().mockResolvedValue(1);
      const migration = createIdempotentMigration(migrationFn, vi.fn());

      migration.resetState();

      expect(migrationFn).not.toHaveBeenCalled();
    });
  });

  describe("独立性", () => {
    it("两个迁移实例应互相独立", async () => {
      const fn1 = vi.fn().mockResolvedValue(11);
      const fn2 = vi.fn().mockResolvedValue(22);
      const m1 = createIdempotentMigration(fn1, vi.fn());
      const m2 = createIdempotentMigration(fn2, vi.fn());

      const r1 = await m1.initialize();
      const r2 = await m2.initialize();

      expect(r1).toBe(11);
      expect(r2).toBe(22);
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it("一个实例 resetState 不应影响另一个", async () => {
      const fn1 = vi.fn().mockResolvedValue(1);
      const fn2 = vi.fn().mockResolvedValue(2);
      const m1 = createIdempotentMigration(fn1, vi.fn());
      const m2 = createIdempotentMigration(fn2, vi.fn());

      await m1.initialize();
      await m2.initialize();

      m1.resetState();

      // m2 仍是缓存状态，应不重新执行
      await m2.initialize();
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);

      // m1 重置后再次 initialize 应重新执行
      await m1.initialize();
      expect(fn1).toHaveBeenCalledTimes(2);
    });
  });

  describe("返回值结构", () => {
    it("应返回包含 initialize 和 resetState 方法的对象", () => {
      const migration = createIdempotentMigration(vi.fn(), vi.fn());
      expect(typeof migration.initialize).toBe("function");
      expect(typeof migration.resetState).toBe("function");
    });

    it("initialize 返回值应是 Promise", () => {
      const migration = createIdempotentMigration(vi.fn().mockResolvedValue(1), vi.fn());
      const result = migration.initialize();
      expect(result).toBeInstanceOf(Promise);
      // 避免 unhandled rejection 警告
      result.catch(() => undefined);
    });
  });
});
