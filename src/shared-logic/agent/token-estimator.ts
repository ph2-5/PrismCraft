/**
 * Token 估算器（启发式，零依赖）
 *
 * 采用中英文区分的启发式算法：
 * - 中文字符（CJK Unified Ideographs）：1 字 ≈ 1.5 token
 * - 中日韩标点：1 字 ≈ 1 token
 * - ASCII 字母/数字/空白：4 字符 ≈ 1 token
 * - 其他 Unicode：2 字符 ≈ 1 token
 *
 * 设计依据：
 * - OpenAI BPE 对中文常见字编码为 1-2 token（多数为 1 token，生僻字 2 token）
 * - 英文 BPE 平均 4 字符 = 1 token
 * - 取 1.5 作为中文平均值，偏向高估（保守），避免上下文超限
 *
 * 若需精确估算，未来可接入 tiktoken（作为可选依赖注入）。
 * 本模块保持零外部依赖，符合 shared-logic 层规则。
 */

/** 每条消息的固定 overhead（role 标记 + 分隔符，OpenAI 格式） */
export const TOKEN_OVERHEAD_PER_MESSAGE = 4;

/** 每个工具调用的固定 overhead（tool_call 结构标记） */
export const TOKEN_OVERHEAD_PER_TOOL_CALL = 3;

/** 每个工具结果消息的固定 overhead（tool_call_id + name 标记） */
export const TOKEN_OVERHEAD_PER_TOOL_RESULT = 3;

/** system prompt 的固定 overhead */
export const TOKEN_OVERHEAD_SYSTEM = 3;

/**
 * 判断字符是否为 CJK 统一表意文字（中文/日文/韩文汉字）
 *
 * 范围参考 Unicode 标准：
 * - U+4E00-U+9FFF: CJK Unified Ideographs（常用汉字）
 * - U+3400-U+4DBF: CJK Unified Ideographs Extension A（扩展A）
 * - U+F900-U+FAFF: CJK Compatibility Ideographs（兼容汉字）
 * - U+20000-U+2A6DF: Extension B
 * - U+2A700-U+2B73F: Extension C
 * - U+2B740-U+2B81F: Extension D
 */
function isCJK(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x2a6df) ||
    (code >= 0x2a700 && code <= 0x2b73f) ||
    (code >= 0x2b740 && code <= 0x2b81f)
  );
}

/**
 * 判断字符是否为 CJK 标点符号
 *
 * 范围：
 * - U+3000-U+303F: CJK Symbols and Punctuation（。、「」等）
 * - U+FF00-U+FFEF: Halfwidth and Fullwidth Forms（！？，等全角符号）
 */
function isCJKPunctuation(code: number): boolean {
  return (
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

/**
 * 估算字符串的 token 数（中英文混合精确估算）
 *
 * 算法：遍历每个字符，按类型累加 token：
 * - CJK 汉字：1.5 token
 * - CJK 标点：1 token
 * - ASCII（字母/数字/空白）：0.25 token（4 字符 = 1 token）
 * - 其他：0.5 token
 *
 * 保守策略：对中文偏高估算，确保不超限。
 *
 * @param text 待估算的字符串
 * @returns 估算的 token 数（向上取整）
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  let cjkCount = 0;
  let cjkPunctCount = 0;
  let asciiCount = 0;
  let otherCount = 0;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isCJK(code)) {
      cjkCount++;
    } else if (isCJKPunctuation(code)) {
      cjkPunctCount++;
    } else if (code < 0x80) {
      // ASCII 字符（0-127）
      asciiCount++;
    } else {
      otherCount++;
    }
  }

  // CJK 汉字: 1.5 token/字
  // CJK 标点: 1 token/字
  // ASCII: 0.25 token/字符（4 字符 = 1 token）
  // 其他 Unicode: 0.5 token/字符
  const total =
    cjkCount * 1.5 +
    cjkPunctCount * 1.0 +
    asciiCount * 0.25 +
    otherCount * 0.5;

  return Math.ceil(total);
}

/**
 * 估算消息内容的 token 数（不含 overhead）
 *
 * 支持的消息内容：
 * - content 字符串
 * - toolCalls 的 arguments JSON
 */
export function estimateContentTokens(
  message: {
    content?: string;
    toolCalls?: Array<{ function: { arguments: string } }>;
  },
): number {
  let text = message.content ?? "";
  if (message.toolCalls && message.toolCalls.length > 0) {
    text += message.toolCalls.map((tc) => tc.function.arguments).join("");
  }
  return estimateTokens(text);
}

/**
 * 估算消息数组的 token 总数（含每条消息的 overhead）
 *
 * @param messages 消息数组
 * @param includeSystem 是否包含 system 消息（默认 true）
 * @returns token 总数
 */
export function estimateMessagesTokens(
  messages: Array<{
    role?: string;
    content?: string;
    toolCalls?: Array<{ function: { arguments: string } }>;
  }>,
  includeSystem = true,
): number {
  let total = 0;
  for (const msg of messages) {
    if (!includeSystem && msg.role === "system") continue;
    total += estimateContentTokens(msg) + TOKEN_OVERHEAD_PER_MESSAGE;
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      total += msg.toolCalls.length * TOKEN_OVERHEAD_PER_TOOL_CALL;
    }
  }
  return total;
}

/**
 * 估算 system prompt 的 token 数（含 system overhead）
 */
export function estimateSystemPromptTokens(systemPrompt: string): number {
  return estimateTokens(systemPrompt) + TOKEN_OVERHEAD_SYSTEM;
}
