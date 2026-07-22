import { describe, it, expect } from "vitest";
import {
  fixShotParams,
  fixStoryBeat,
  validateStoryPlan,
  parseStoryPlanJSON,
  convertToStoryBeats,
  type RawStoryBeat,
} from "../story-service";

describe("story-service", () => {
  describe("fixShotParams", () => {
    it("合法 shotType/cameraMovement/cameraAngle 应保持不变（不进 autoFixed）", () => {
      const result = fixShotParams({
        shotType: "wide",
        cameraAngle: "eye_level",
        cameraMovement: "static",
        duration: 5,
      });
      expect(result.fixed.shotType).toBe("wide");
      expect(result.fixed.cameraAngle).toBe("eye_level");
      expect(result.fixed.cameraMovement).toBe("static");
      expect(result.fixed.duration).toBe(5);
      // shotInstruction 应被填充
      expect(result.fixed.shotInstruction).toBeDefined();
      expect(result.autoFixed).toHaveLength(0);
    });

    it("中文别名应被转换为标准值并加入 autoFixed", () => {
      const result = fixShotParams({
        shotType: "特写",
        cameraAngle: "平视",
        cameraMovement: "推",
        duration: 5,
      });
      expect(result.fixed.shotType).toBe("特写"); // shotType 字段保持原值（normalized 仅写入 shotInstruction）
      expect(result.fixed.shotInstruction?.shotSize).toBe("close");
      expect(result.fixed.shotInstruction?.cameraAngle).toBe("eye_level");
      expect(result.fixed.shotInstruction?.cameraMovement).toBe("push");
      // 应有 3 条 autoFixed 信息
      expect(result.autoFixed.length).toBeGreaterThan(0);
    });

    it("duration < 2 应被钳制为 2 并记录 autoFixed", () => {
      const result = fixShotParams({
        shotType: "medium",
        duration: 1,
      });
      expect(result.fixed.duration).toBe(2);
      expect(result.autoFixed).toContain("duration: 1 → 2");
    });

    it("duration > 30 应被钳制为 30 并记录 autoFixed", () => {
      const result = fixShotParams({
        shotType: "medium",
        duration: 60,
      });
      expect(result.fixed.duration).toBe(30);
      expect(result.autoFixed).toContain("duration: 60 → 30");
    });

    it("duration 为 null 时应设为默认值 5（不进 autoFixed）", () => {
      const result = fixShotParams({
        shotType: "medium",
        duration: null,
      });
      expect(result.fixed.duration).toBe(5);
    });

    it("无效 shotType 应被替换为默认 medium 并记录 autoFixed", () => {
      const result = fixShotParams({
        shotType: "totally_invalid",
        duration: 5,
      });
      expect(result.fixed.shotInstruction?.shotSize).toBe("medium");
      expect(result.autoFixed.length).toBeGreaterThan(0);
    });

    it("shotType 缺失时应使用默认值 medium（不进 autoFixed）", () => {
      const result = fixShotParams({
        duration: 5,
      });
      // shotType 缺失走 defaultOnMissing=true 路径，不写入 autoFixed
      expect(result.fixed.shotInstruction?.shotSize).toBe("medium");
    });

    it("shotInstruction 应被填充", () => {
      const result = fixShotParams({
        shotType: "close",
        cameraAngle: "low",
        cameraMovement: "push",
        duration: 4,
      });
      expect(result.fixed.shotInstruction).toEqual({
        shotSize: "close",
        cameraAngle: "low",
        cameraMovement: "push",
      });
    });

    it("所有字段缺失时仍应正常返回（不抛异常）", () => {
      expect(() => fixShotParams({})).not.toThrow();
      const result = fixShotParams({});
      expect(result.fixed.duration).toBe(5);
    });

    it("下划线/连字符的合法值应被规范化", () => {
      const result = fixShotParams({
        shotType: "close_up",
        cameraAngle: "eye-level",
        cameraMovement: "zoom_in",
        duration: 5,
      });
      // close_up 应映射为 close（别名表）
      expect(result.fixed.shotInstruction?.shotSize).toBe("close");
      expect(result.fixed.shotInstruction?.cameraMovement).toBe("push");
    });
  });

  describe("fixStoryBeat", () => {
    it("完整字段应保留原值", () => {
      const result = fixStoryBeat({
        title: "标题",
        content: "这是一段足够长的内容描述",
        description: "描述",
        shotType: "medium",
        duration: 5,
        type: "scene",
      });
      expect(result.fixed.title).toBe("标题");
      expect(result.fixed.content).toBe("这是一段足够长的内容描述");
      expect(result.fixed.duration).toBe(5);
      expect(result.fixed.type).toBe("scene");
    });

    it("title 缺失但 content 存在时应从 content 截取前 20 字符", () => {
      const longContent = "这是一个非常长的故事内容，超过二十个字符的部分将被截断";
      const result = fixStoryBeat({
        content: longContent,
        duration: 5,
      });
      expect(result.fixed.title).toBe(longContent.slice(0, 20) + "...");
      expect(result.autoFixed).toContain("title: 从content自动生成");
    });

    it("content 缺失但 description 存在时应从 description 复制", () => {
      const result = fixStoryBeat({
        title: "T",
        description: "由描述补全的内容",
        duration: 5,
      });
      expect(result.fixed.content).toBe("由描述补全的内容");
      expect(result.autoFixed).toContain("content: 从description复制");
    });

    it("duration 缺失时应默认为 5", () => {
      const result = fixStoryBeat({
        title: "T",
        content: "足够长的内容描述",
        type: "scene",
      });
      expect(result.fixed.duration).toBe(5);
      expect(result.autoFixed).toContain("duration: 缺失 → 5");
    });

    it("type 缺失时应从 content 推导", () => {
      const result = fixStoryBeat({
        title: "T",
        content: "两人开始对话",
        duration: 5,
      });
      expect(result.fixed.type).toBe("dialogue");
      expect(result.autoFixed.some((m) => m.includes("type: 缺失"))).toBe(true);
    });

    it("content 包含 '特效' 时 type 应推导为 effect", () => {
      const result = fixStoryBeat({
        title: "T",
        content: "魔法特效爆发",
        duration: 5,
      });
      expect(result.fixed.type).toBe("effect");
    });

    it("shotType 缺失时 shotInstruction 仍应被填充（基于 content 推导）", () => {
      const result = fixStoryBeat({
        title: "T",
        content: "全景下的城市风貌展示",
        duration: 5,
        type: "scene",
      });
      // 包含 "全景" 推导为 wide
      expect(result.fixed.shotInstruction?.shotSize).toBe("wide");
    });

    it("缩写字段应被解析（t/c/d/st/ca/cm/tp 等）", () => {
      const result = fixStoryBeat({
        t: "标题",
        c: "这是内容描述",
        st: "medium",
        ca: "eye_level",
        cm: "static",
        d: 8,
        tp: "scene",
      });
      expect(result.fixed.title).toBe("标题");
      expect(result.fixed.content).toBe("这是内容描述");
      expect(result.fixed.shotType).toBe("medium");
      expect(result.fixed.cameraAngle).toBe("eye_level");
      expect(result.fixed.cameraMovement).toBe("static");
      expect(result.fixed.duration).toBe(8);
      expect(result.fixed.type).toBe("scene");
    });
  });

  describe("validateStoryPlan", () => {
    it("空数组应返回空 fixedPlan 和无错误", () => {
      const result = validateStoryPlan([]);
      expect(result.fixedPlan).toEqual([]);
      expect(result.errors).toEqual([]);
      expect(result.autoFixed).toEqual([]);
    });

    it("完整 plan 应通过校验无错误", () => {
      const plan: RawStoryBeat[] = [
        {
          title: "镜1",
          content: "完整的内容描述超过十个字符",
          duration: 5,
          type: "scene",
        },
        {
          title: "镜2",
          content: "另一段完整的内容描述",
          duration: 4,
          type: "action",
        },
      ];
      const result = validateStoryPlan(plan);
      expect(result.errors).toEqual([]);
      expect(result.fixedPlan).toHaveLength(2);
    });

    it("缺少 title 应被记为错误", () => {
      // 注意：fixStoryBeat 在 content 存在时会自动从 content 生成 title，
      // 故触发"缺少标题"错误需要 title 和 content 都缺失。
      const plan: RawStoryBeat[] = [
        { description: "由描述补全的内容足够长", duration: 5 },
      ];
      const result = validateStoryPlan(plan);
      expect(result.errors.some((e) => e.includes("缺少标题"))).toBe(true);
    });

    it("内容过短（少于 10 字符）应被记为错误", () => {
      const plan: RawStoryBeat[] = [
        { title: "T", content: "短", duration: 5 },
      ];
      const result = validateStoryPlan(plan);
      expect(result.errors.some((e) => e.includes("内容过短"))).toBe(true);
    });

    it("duration < 2 应被记为错误", () => {
      const plan: RawStoryBeat[] = [
        { title: "T", content: "足够长的内容描述", duration: 1 },
      ];
      const result = validateStoryPlan(plan);
      expect(result.errors.some((e) => e.includes("时长无效"))).toBe(true);
    });

    it("autoFixed 应以 [分镜N] 为前缀", () => {
      const plan: RawStoryBeat[] = [
        { content: "足够长的内容描述", duration: 5 }, // title 缺失
      ];
      const result = validateStoryPlan(plan);
      expect(result.autoFixed.some((m) => m.startsWith("[分镜1]"))).toBe(true);
    });

    it("description 缺失时应使用 content 作为 fallback", () => {
      const plan: RawStoryBeat[] = [
        { title: "T", content: "足够长的内容描述", duration: 5, type: "scene" },
      ];
      const result = validateStoryPlan(plan);
      expect(result.fixedPlan[0]?.description).toBe("足够长的内容描述");
    });

    it("characterIds 缺失时应默认为空数组", () => {
      const plan: RawStoryBeat[] = [
        { title: "T", content: "足够长的内容描述", duration: 5, type: "scene" },
      ];
      const result = validateStoryPlan(plan);
      expect(result.fixedPlan[0]?.characterIds).toEqual([]);
    });
  });

  describe("parseStoryPlanJSON", () => {
    it("应直接解析纯 JSON 数组", () => {
      const text = `[{"title":"a","content":"内容描述","duration":5,"type":"scene"}]`;
      const result = parseStoryPlanJSON(text);
      expect(result).toHaveLength(1);
      expect(result?.[0]?.title).toBe("a");
    });

    it("应从 markdown 代码块中提取数组", () => {
      const text = "```json\n[{\"title\":\"b\",\"content\":\"内容\",\"duration\":5}]\n```";
      const result = parseStoryPlanJSON(text);
      expect(result).toHaveLength(1);
      expect(result?.[0]?.title).toBe("b");
    });

    it("应从带前后缀的文本中提取数组", () => {
      const text = "前导文本 [{\"title\":\"c\"}] 尾部";
      const result = parseStoryPlanJSON(text);
      expect(result).toHaveLength(1);
      expect(result?.[0]?.title).toBe("c");
    });

    it("无效 JSON 应返回 null", () => {
      expect(parseStoryPlanJSON("not json at all")).toBeNull();
    });

    it("解析非数组 JSON（对象）应返回 null", () => {
      // 对象无法匹配 \[...\] 正则
      expect(parseStoryPlanJSON("{\"a\":1}")).toBeNull();
    });

    it("空数组应返回空数组", () => {
      const result = parseStoryPlanJSON("[]");
      expect(result).toEqual([]);
    });

    it("应支持多元素数组", () => {
      const text = `[{"title":"a"},{"title":"b"},{"title":"c"}]`;
      const result = parseStoryPlanJSON(text);
      expect(result).toHaveLength(3);
    });

    it("首尾中括号兜底提取应工作", () => {
      // 直接 JSON.parse 失败时回退到首尾中括号截取
      const text = "prefix [ invalid json but with brackets ] suffix";
      // 这段会先尝试 JSON.parse，失败后回退到首尾中括号截取再 parse
      // " invalid json but with brackets " 不是合法 JSON，应仍返回 null
      expect(parseStoryPlanJSON(text)).toBeNull();
    });

    it("元素包含非对象值（如 null）时应返回 null（抛错）", () => {
      // validateRawStoryBeats 会抛错，外层 try/catch 应捕获
      const result = parseStoryPlanJSON("[null]");
      expect(result).toBeNull();
    });
  });

  describe("convertToStoryBeats", () => {
    it("应将 RawStoryBeat 转换为 StoryBeat", () => {
      const rawBeats: RawStoryBeat[] = [
        {
          title: "镜1",
          content: "内容描述",
          duration: 5,
          type: "scene",
        },
      ];
      const result = convertToStoryBeats(rawBeats);
      expect(result).toHaveLength(1);
      const beat = result[0];
      expect(beat?.title).toBe("镜1");
      expect(beat?.content).toBe("内容描述");
      expect(beat?.duration).toBe(5);
      expect(beat?.type).toBe("scene");
    });

    it("应设置 enhancedGeneration 标志（默认 true）", () => {
      const result = convertToStoryBeats([
        { title: "T", content: "C", duration: 5 },
      ]);
      expect(result[0]?.enhancedGeneration).toBe(true);
    });

    it("enhancedGeneration=false 时应正确传递", () => {
      const result = convertToStoryBeats(
        [{ title: "T", content: "C", duration: 5 }],
        false,
      );
      expect(result[0]?.enhancedGeneration).toBe(false);
    });

    it("应使用 idGenerator 自定义 ID", () => {
      const result = convertToStoryBeats(
        [
          { title: "T", content: "C", duration: 5 },
          { title: "T2", content: "C2", duration: 5 },
        ],
        true,
        (i) => `custom-${i}`,
      );
      expect(result[0]?.id).toBe("custom-0");
      expect(result[1]?.id).toBe("custom-1");
    });

    it("未提供 idGenerator 时应生成默认 ID", () => {
      const result = convertToStoryBeats([
        { title: "T", content: "C", duration: 5 },
      ]);
      expect(result[0]?.id).toMatch(/^beat-/);
    });

    it("sequence 应从 1 开始递增", () => {
      const result = convertToStoryBeats([
        { title: "T1", content: "C", duration: 5 },
        { title: "T2", content: "C", duration: 5 },
        { title: "T3", content: "C", duration: 5 },
      ]);
      expect(result[0]?.sequence).toBe(1);
      expect(result[1]?.sequence).toBe(2);
      expect(result[2]?.sequence).toBe(3);
    });

    it("shotInstruction 应被填充", () => {
      const result = convertToStoryBeats([
        {
          title: "T",
          content: "C",
          duration: 5,
          shotType: "wide",
          cameraAngle: "low",
          cameraMovement: "push",
        },
      ]);
      expect(result[0]?.shotInstruction).toEqual({
        shotSize: "wide",
        cameraAngle: "low",
        cameraMovement: "push",
      });
    });

    it("characterIds 应被转换为 string[]", () => {
      const result = convertToStoryBeats([
        {
          title: "T",
          content: "C",
          duration: 5,
          characterIds: [1, 2, 3] as unknown as string[],
        },
      ]);
      expect(result[0]?.characterIds).toEqual(["1", "2", "3"]);
    });

    it("缩写字段应被正确解析", () => {
      const result = convertToStoryBeats([
        {
          t: "标题",
          c: "内容",
          d: 7,
          st: "medium",
          ca: "eye_level",
          cm: "static",
          tp: "scene",
        },
      ]);
      expect(result[0]?.title).toBe("标题");
      expect(result[0]?.content).toBe("内容");
      expect(result[0]?.duration).toBe(7);
      expect(result[0]?.shotInstruction?.shotSize).toBe("medium");
    });

    it("dialogue 字段应追加到 content", () => {
      const result = convertToStoryBeats([
        {
          title: "T",
          content: "原始内容",
          duration: 5,
          dialogue: "你好",
        },
      ]);
      expect(result[0]?.content).toContain("对话：你好");
    });

    it("emotion 字段应追加到 content", () => {
      const result = convertToStoryBeats([
        {
          title: "T",
          content: "原始内容",
          duration: 5,
          emotion: "悲伤",
        },
      ]);
      expect(result[0]?.content).toContain("情绪：悲伤");
    });

    it("内容中的元素 ID（CHAR_xxx/PROP_xxx）应被提取到 elementIds", () => {
      const result = convertToStoryBeats([
        {
          title: "T",
          content: "CHAR_001 进入房间，PROP_002 也在桌上",
          duration: 5,
        },
      ]);
      expect(result[0]?.elementIds).toEqual(
        expect.arrayContaining(["CHAR_001", "PROP_002"]),
      );
    });
  });
});
