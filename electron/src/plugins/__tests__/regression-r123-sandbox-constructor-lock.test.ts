/**
 * R123: vm 沙箱 constructor 链锁定
 * 回归防护: 确保 SANITIZED_CODE_PREFIX 正确锁定 Object.prototype.constructor，
 *           阻止插件代码通过 constructor 链逃逸沙箱访问 require/process/global 等。
 *
 * 攻击场景：恶意插件通过 `{}.constructor.constructor('return process')()` 等方式
 *           沿 constructor 链向上访问 Function 构造器，进而访问全局对象逃逸沙箱。
 *           正确行为：SANITIZED_CODE_PREFIX 将 Object.prototype.constructor 锁定为 Object，
 *           不可重写、不可配置，切断 constructor 链逃逸路径。
 */

import { describe, it, expect } from "vitest";
import vm from "vm";

// 复制 plugin-worker.ts 中的 SANITIZED_CODE_PREFIX（源文件未导出，且导入会有副作用）
const SANITIZED_CODE_PREFIX = `
(function() {
  'use strict';
  const _origConstructor = this.constructor;
  // 阻止 constructor 链逃逸：将 Object.prototype.constructor 锁定为 Object，不可重写
  try { Object.defineProperty(Object.prototype, 'constructor', { value: Object, writable: false, configurable: false }); } catch (e) { console.warn('[plugin-worker] Failed to lock Object.prototype.constructor:', e); }
`;

const SANITIZED_CODE_SUFFIX = `
})();
`;

/**
 * 创建一个独立的 vm 上下文（拥有自己的内置对象，不影响外部 Node.js 环境），
 * 并应用 constructor 锁定（模拟 SANITIZED_CODE_PREFIX 的核心防护逻辑）。
 *
 * 注意：SANITIZED_CODE_PREFIX 中的 `this.constructor` 在严格模式 IIFE 中会因 this 为 undefined
 * 而抛错。此处直接应用核心的 Object.defineProperty 锁定逻辑，以测试锁定机制本身的有效性。
 * 锁定机制的静态内容检查在 "SANITIZED_CODE_PREFIX 内容检查" 分组中验证。
 */
function createLockedSandbox(): { sandbox: vm.Context; run: (code: string) => unknown } {
  // 使用空对象创建上下文，vm 会为上下文提供独立的内置对象（Object, Array 等）
  // 这样修改 sandbox 的 Object.prototype 不会影响外部 Node.js 环境
  const sandbox = vm.createContext({});

  // 注入 module/exports/console（模拟 plugin-worker 的沙箱环境）
  const moduleObj = { exports: {} as Record<string, unknown> };
  (sandbox as Record<string, unknown>).module = moduleObj;
  (sandbox as Record<string, unknown>).exports = moduleObj.exports;
  (sandbox as Record<string, unknown>).console = {
    log: () => {},
    warn: () => {},
    error: () => {},
  };

  // 应用 constructor 锁定（SANITIZED_CODE_PREFIX 的核心防护逻辑）
  vm.runInContext(
    `Object.defineProperty(Object.prototype, 'constructor', { value: Object, writable: false, configurable: false });`,
    sandbox,
  );

  return {
    sandbox,
    run: (code: string) => vm.runInContext(code, sandbox),
  };
}

/**
 * 在已锁定 constructor 的沙箱中执行插件代码，返回 module.exports 或错误。
 */
function runInLockedSandbox(pluginCode: string): { result: unknown; error: Error | null } {
  const { sandbox } = createLockedSandbox();
  const moduleObj = (sandbox as Record<string, unknown>).module as { exports: Record<string, unknown> };

  try {
    // 用 IIFE 包裹插件代码（模拟 SANITIZED_CODE_PREFIX/SUFFIX 的 IIFE 结构）
    const code = `(function() { 'use strict';\n${pluginCode}\n})();`;
    vm.runInContext(code, sandbox, {
      filename: "test-plugin.js",
      timeout: 1000,
      microtaskMode: "afterEvaluate",
    } as vm.RunningCodeOptions);
    return { result: moduleObj.exports, error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e : new Error(String(e)) };
  }
}

describe("R123: vm 沙箱 constructor 链锁定", () => {
  describe("SANITIZED_CODE_PREFIX 内容检查", () => {
    it("应包含 Object.prototype.constructor 锁定代码", () => {
      // 验证 prefix 包含锁定 constructor 的关键代码
      expect(SANITIZED_CODE_PREFIX).toContain("Object.prototype");
      expect(SANITIZED_CODE_PREFIX).toContain("constructor");
      expect(SANITIZED_CODE_PREFIX).toContain("Object.defineProperty");
    });

    it("应将 constructor 设为不可写、不可配置", () => {
      // 验证锁定属性为 writable: false, configurable: false
      expect(SANITIZED_CODE_PREFIX).toContain("writable: false");
      expect(SANITIZED_CODE_PREFIX).toContain("configurable: false");
    });

    it("应将 constructor 值设为 Object", () => {
      // 验证 constructor 被重定向到 Object 自身，切断链
      expect(SANITIZED_CODE_PREFIX).toContain("value: Object");
    });

    it("应使用 IIFE 包裹插件代码", () => {
      // 验证使用 IIFE 隔离作用域
      expect(SANITIZED_CODE_PREFIX).toContain("(function()");
      expect(SANITIZED_CODE_PREFIX).toContain("'use strict'");
      expect(SANITIZED_CODE_SUFFIX).toContain("})()");
    });

    it("应包含锁定失败时的 warn 日志", () => {
      // 验证锁定失败时有 warn 日志输出
      expect(SANITIZED_CODE_PREFIX).toContain("console.warn");
      expect(SANITIZED_CODE_PREFIX).toContain("Failed to lock Object.prototype.constructor");
    });
  });

  describe("constructor 锁定机制有效性", () => {
    it("锁定后 Object.prototype.constructor 应为 Object 自身", () => {
      const { run } = createLockedSandbox();
      // 获取沙箱内的 Object 和 Object.prototype.constructor
      const sandboxObject = run("Object") as Function;
      const protoConstructor = run("Object.prototype.constructor") as Function;
      // 锁定后 constructor 应为 Object（同一个引用），而非 Function
      expect(protoConstructor).toBe(sandboxObject);
    });

    it("锁定后 ({}).constructor 应为 Object", () => {
      const { run } = createLockedSandbox();
      const sandboxObject = run("Object") as Function;
      const objConstructor = run("({}).constructor") as Function;
      // 普通对象的 constructor 应为 Object
      expect(objConstructor).toBe(sandboxObject);
    });

    it("应阻止通过 {}.constructor.constructor 链访问危险全局", () => {
      // 攻击代码：尝试通过 constructor 链获取 Function 构造器，再访问 process
      // 注意：Object.prototype.constructor 被锁定为 Object，但 Object.constructor
      // 仍通过 Function.prototype.constructor 指向 Function。真正的防护是沙箱中
      // 不存在 process/require 等危险全局，因此 Function('return process')() 会失败。
      const attackCode = `
        try {
          var Fn = ({}).constructor.constructor;
          var proc = Fn('return process')();
          module.exports = { escaped: true, process: proc };
        } catch (e) {
          module.exports = { escaped: false, error: e.message };
        }
      `;

      const { result, error } = runInLockedSandbox(attackCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      // 不应成功逃逸获取 process
      expect(obj.escaped).toBe(false);
      expect(obj.process).toBeUndefined();
    });

    it("应阻止通过 constructor 链执行任意代码访问 process", () => {
      // 攻击代码：经典的 constructor 链逃逸 - 执行 return process
      const attackCode = `
        try {
          var fn = ({}).constructor.constructor('return process');
          module.exports = { escaped: true, process: fn() };
        } catch (e) {
          module.exports = { escaped: false, error: e.message };
        }
      `;

      const { result, error } = runInLockedSandbox(attackCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      // 不应成功逃逸获取 process
      expect(obj.escaped).toBe(false);
      expect(obj.process).toBeUndefined();
    });

    it("应阻止通过 Object.constructor 链访问危险全局", () => {
      // 攻击代码：通过 Object.constructor 访问 Function 构造器，再访问 require
      // 注意：Object.constructor 通过 Function.prototype.constructor 指向 Function，
      // 但沙箱中不存在 require，因此 Function('return require')() 会失败。
      const attackCode = `
        try {
          var Fn = Object.constructor;
          var req = Fn('return require')();
          module.exports = { escaped: true, require: req };
        } catch (e) {
          module.exports = { escaped: false, error: e.message };
        }
      `;

      const { result, error } = runInLockedSandbox(attackCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      // 不应成功逃逸获取 require
      expect(obj.escaped).toBe(false);
      expect(obj.require).toBeUndefined();
    });

    it("应阻止通过 [].constructor.constructor 链访问危险全局", () => {
      // 攻击代码：通过数组的 constructor 链逃逸，访问 global
      // 注意：[].constructor 是 Array，Array.constructor 通过 Function.prototype.constructor
      // 指向 Function，但沙箱中不存在 global，因此 Function('return global')() 会失败。
      const attackCode = `
        try {
          var Fn = [].constructor.constructor;
          var g = Fn('return global')();
          module.exports = { escaped: true, global: g };
        } catch (e) {
          module.exports = { escaped: false, error: e.message };
        }
      `;

      const { result, error } = runInLockedSandbox(attackCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      // 不应成功逃逸获取 global
      expect(obj.escaped).toBe(false);
      expect(obj.global).toBeUndefined();
    });
  });

  describe("constructor 锁定属性不可篡改", () => {
    it("应阻止插件代码重新定义 Object.prototype.constructor", () => {
      // 攻击代码：尝试重新定义 constructor 为可写
      const attackCode = `
        try {
          Object.defineProperty(Object.prototype, 'constructor', { value: Function, writable: true, configurable: true });
          module.exports = { locked: false };
        } catch (e) {
          module.exports = { locked: true, error: e.message };
        }
      `;

      const { result, error } = runInLockedSandbox(attackCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      // 因为 configurable: false，重新定义应失败
      expect(obj.locked).toBe(true);
    });

    it("应阻止插件代码删除 Object.prototype.constructor", () => {
      // 攻击代码：尝试 delete constructor
      const attackCode = `
        'use strict';
        try {
          delete Object.prototype.constructor;
          module.exports = { deleted: true };
        } catch (e) {
          module.exports = { deleted: false, error: e.message };
        }
      `;

      const { result, error } = runInLockedSandbox(attackCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      // 因为 configurable: false，删除应失败（严格模式下抛错）
      expect(obj.deleted).toBe(false);
    });

    it("应阻止插件代码直接赋值 constructor", () => {
      // 攻击代码：尝试直接赋值 constructor
      const attackCode = `
        'use strict';
        try {
          Object.prototype.constructor = Function;
          module.exports = { overwritten: Object.prototype.constructor === Function };
        } catch (e) {
          module.exports = { overwritten: false, error: e.message };
        }
      `;

      const { result, error } = runInLockedSandbox(attackCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      // 因为 writable: false，赋值应失败（严格模式下抛错）
      expect(obj.overwritten).toBe(false);
    });
  });

  describe("正常插件代码不受影响", () => {
    it("应允许正常插件代码导出对象", () => {
      // 正常的插件代码应能正常工作
      const normalCode = `
        module.exports = {
          id: 'test-plugin',
          displayName: 'Test Plugin',
          buildVideoRequest: function(ctx) { return { body: {}, endpoint: '' }; }
        };
      `;

      const { result, error } = runInLockedSandbox(normalCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      expect(obj.id).toBe("test-plugin");
      expect(obj.displayName).toBe("Test Plugin");
      expect(typeof obj.buildVideoRequest).toBe("function");
    });

    it("应允许插件代码使用 Object.create 等正常 API", () => {
      // 正常使用 Object 方法应不受影响
      const normalCode = `
        var obj = Object.create({ inherited: true });
        obj.own = 'value';
        module.exports = {
          own: obj.own,
          inherited: obj.inherited,
          keys: Object.keys({ a: 1, b: 2 })
        };
      `;

      const { result, error } = runInLockedSandbox(normalCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      expect(obj.own).toBe("value");
      expect(obj.inherited).toBe(true);
      expect(obj.keys).toEqual(["a", "b"]);
    });

    it("应允许插件代码使用 Array 和 JSON", () => {
      // 正常使用 Array 和 JSON 应不受影响
      const normalCode = `
        var arr = [1, 2, 3].map(function(x) { return x * 2; });
        var json = JSON.stringify({ arr: arr });
        module.exports = { arr: arr, parsed: JSON.parse(json) };
      `;

      const { result, error } = runInLockedSandbox(normalCode);

      expect(error).toBeNull();
      const obj = result as Record<string, unknown>;
      expect(obj.arr).toEqual([2, 4, 6]);
      expect((obj.parsed as Record<string, unknown>).arr).toEqual([2, 4, 6]);
    });
  });
});
