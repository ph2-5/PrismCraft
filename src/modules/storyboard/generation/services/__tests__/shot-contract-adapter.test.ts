import { describe, it, expect } from "vitest";
import type { ShotContract } from "@/modules/novel";
import { shotContractToBeatPatch, shotContractsToBeatPatches } from "../shot-contract-adapter";

function makeContract(overrides: Partial<ShotContract> = {}): ShotContract {
  return {
    id: "sc-1",
    beatId: "beat-1",
    shotNumber: 1,
    shotSize: "medium",
    lens: "50mm",
    movement: "static",
    lighting: "natural",
    duration: 5,
    blocking: "主角缓步走来",
    ...overrides,
  };
}

describe("shotContractToBeatPatch", () => {
  it("映射 duration 与基础镜头字段", () => {
    const patch = shotContractToBeatPatch(makeContract());
    expect(patch.duration).toBe(5);
    expect(patch.shotInstruction).toMatchObject({
      shotSize: "medium",
      cameraMovement: "static",
      cameraAngle: "eye_level",
      lighting: "natural",
    });
  });

  it("shotSize 枚举映射：close_up → close、extreme_close_up → extreme_close", () => {
    expect(shotContractToBeatPatch(makeContract({ shotSize: "close_up" })).shotInstruction).toMatchObject({
      shotSize: "close",
    });
    expect(shotContractToBeatPatch(makeContract({ shotSize: "extreme_close_up" })).shotInstruction).toMatchObject({
      shotSize: "extreme_close",
    });
    expect(shotContractToBeatPatch(makeContract({ shotSize: "extreme_wide" })).shotInstruction).toMatchObject({
      shotSize: "extreme_wide",
    });
  });

  it("movement 近似映射：dolly→push、handheld→tracking、tilt→crane_up", () => {
    expect(shotContractToBeatPatch(makeContract({ movement: "dolly" })).shotInstruction).toMatchObject({
      cameraMovement: "push",
    });
    expect(shotContractToBeatPatch(makeContract({ movement: "handheld" })).shotInstruction).toMatchObject({
      cameraMovement: "tracking",
    });
    expect(shotContractToBeatPatch(makeContract({ movement: "tilt" })).shotInstruction).toMatchObject({
      cameraMovement: "crane_up",
    });
  });

  it("lighting 透传（枚举一致）", () => {
    expect(shotContractToBeatPatch(makeContract({ lighting: "neon" })).shotInstruction).toMatchObject({
      lighting: "neon",
    });
  });

  it("extra 字段合并", () => {
    const patch = shotContractToBeatPatch(makeContract(), { content: "补充内容" });
    expect(patch.content).toBe("补充内容");
  });
});

describe("shotContractsToBeatPatches", () => {
  it("每个 contract 产出独立 patch", () => {
    const patches = shotContractsToBeatPatches([
      makeContract({ id: "sc-1", shotNumber: 1 }),
      makeContract({ id: "sc-2", shotNumber: 2, shotSize: "close_up" }),
    ]);
    expect(patches).toHaveLength(2);
    expect(patches[0]!.contract.id).toBe("sc-1");
    expect(patches[1]!.patch.shotInstruction).toMatchObject({ shotSize: "close" });
  });
});
