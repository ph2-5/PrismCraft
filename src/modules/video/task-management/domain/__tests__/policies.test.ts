import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkTimeout } from "../policies/timeout-policy";
import { checkExpiration } from "../policies/expiration-policy";
import { evaluatePolicies } from "../policies/policy-engine";
import type { VideoTask } from "@/domain/schemas";

function makeTask(overrides: Partial<VideoTask> = {}): VideoTask {
  return {
    taskId: "task-1",
    status: "pending",
    progress: 0,
    message: "",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("timeout-policy", () => {
  it("should return NONE for a recent pending task", () => {
    const task = makeTask({ status: "pending", createdAt: new Date().toISOString() });
    expect(checkTimeout(task)).toEqual({ type: "NONE" });
  });

  it("should return NONE for a recent generating task", () => {
    const task = makeTask({ status: "generating", createdAt: new Date().toISOString() });
    expect(checkTimeout(task)).toEqual({ type: "NONE" });
  });

  it("should return TRANSITION to failed for a pending task older than 2 hours", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1).toISOString();
    const task = makeTask({ status: "pending", createdAt: twoHoursAgo });
    const action = checkTimeout(task);

    expect(action.type).toBe("TRANSITION");
    if (action.type === "TRANSITION") {
      expect(action.targetStatus).toBe("failed");
      expect(action.reason).toContain("超时");
    }
  });

  it("should return TRANSITION to failed for a generating task older than 2 hours", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1).toISOString();
    const task = makeTask({ status: "generating", createdAt: twoHoursAgo });
    const action = checkTimeout(task);

    expect(action.type).toBe("TRANSITION");
    if (action.type === "TRANSITION") {
      expect(action.targetStatus).toBe("failed");
    }
  });

  it("should return TRANSITION for a retrying task older than 2 hours", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1).toISOString();
    const task = makeTask({ status: "retrying", createdAt: twoHoursAgo });
    const action = checkTimeout(task);

    expect(action.type).toBe("TRANSITION");
  });

  it("should return NONE for a completed task regardless of age", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1).toISOString();
    const task = makeTask({ status: "completed", createdAt: twoHoursAgo });
    expect(checkTimeout(task)).toEqual({ type: "NONE" });
  });

  it("should return NONE for a failed task regardless of age", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1).toISOString();
    const task = makeTask({ status: "failed", createdAt: twoHoursAgo });
    expect(checkTimeout(task)).toEqual({ type: "NONE" });
  });

  it("should return NONE for a cancelled task regardless of age", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1).toISOString();
    const task = makeTask({ status: "cancelled", createdAt: twoHoursAgo });
    expect(checkTimeout(task)).toEqual({ type: "NONE" });
  });

  it("should return NONE for a task exactly at 2 hours boundary", () => {
    const exactlyTwoHours = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const task = makeTask({ status: "pending", createdAt: exactlyTwoHours });
    expect(checkTimeout(task)).toEqual({ type: "NONE" });
  });
});

describe("expiration-policy", () => {
  it("should return NONE for a recent completed task with expiresAt in the future", () => {
    const task = makeTask({
      status: "completed",
      createdAt: new Date(Date.now() - 1000).toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });
    expect(checkExpiration(task)).toEqual({ type: "NONE" });
  });

  it("should return DELETE for a completed task with expired expiresAt", () => {
    const task = makeTask({
      status: "completed",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const action = checkExpiration(task);

    expect(action.type).toBe("DELETE");
    if (action.type === "DELETE") {
      expect(action.reason).toContain("过期");
    }
  });

  it("should return DELETE for a completed task without expiresAt older than 7 days", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const task = makeTask({
      status: "completed",
      createdAt: eightDaysAgo,
    });
    const action = checkExpiration(task);

    expect(action.type).toBe("DELETE");
    if (action.type === "DELETE") {
      expect(action.reason).toContain("7天");
    }
  });

  it("should return NONE for a completed task without expiresAt within 7 days", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const task = makeTask({
      status: "completed",
      createdAt: threeDaysAgo,
    });
    expect(checkExpiration(task)).toEqual({ type: "NONE" });
  });

  it("should return NONE for a pending task regardless of age", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const task = makeTask({ status: "pending", createdAt: eightDaysAgo });
    expect(checkExpiration(task)).toEqual({ type: "NONE" });
  });

  it("should return NONE for a failed task regardless of age", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const task = makeTask({ status: "failed", createdAt: eightDaysAgo });
    expect(checkExpiration(task)).toEqual({ type: "NONE" });
  });

  it("should return NONE for a completed task exactly at 7 days boundary", () => {
    const exactlySevenDays = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const task = makeTask({
      status: "completed",
      createdAt: exactlySevenDays,
    });
    expect(checkExpiration(task)).toEqual({ type: "NONE" });
  });
});

describe("policy-engine", () => {
  it("should return empty array for a healthy pending task", () => {
    const task = makeTask({ status: "pending", createdAt: new Date().toISOString() });
    expect(evaluatePolicies(task)).toEqual([]);
  });

  it("should return timeout action for an old pending task", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1).toISOString();
    const task = makeTask({ status: "pending", createdAt: twoHoursAgo });
    const actions = evaluatePolicies(task);

    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("TRANSITION");
  });

  it("should return expiration action for an old completed task without expiresAt", () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const task = makeTask({ status: "completed", createdAt: eightDaysAgo });
    const actions = evaluatePolicies(task);

    expect(actions.length).toBe(1);
    expect(actions[0].type).toBe("DELETE");
  });

  it("should return both timeout and expiration for a timed-out completed task with expired expiresAt", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1).toISOString();
    const task = makeTask({
      status: "completed",
      createdAt: twoHoursAgo,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const actions = evaluatePolicies(task);

    expect(actions.some((a) => a.type === "DELETE")).toBe(true);
  });

  it("should return NONE actions filtered out", () => {
    const task = makeTask({ status: "pending", createdAt: new Date().toISOString() });
    const actions = evaluatePolicies(task);

    expect(actions.every((a) => a.type !== "NONE")).toBe(true);
  });
});
