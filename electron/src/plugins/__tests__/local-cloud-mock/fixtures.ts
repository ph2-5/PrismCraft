/**
 * Test Fixtures —— 测试用的固定数据
 *
 * 提供最小有效的 PNG / MP4 数据，供 Mock 服务器返回和测试断言使用。
 * 不追求视频可播放，只保证 HTTP 传输和格式标识正确。
 */

/**
 * 1x1 红色像素 PNG，base64 编码（含 data URI 前缀）。
 * 用于测试图片传输（base64 模式）。
 */
export const MINIMAL_PNG_DATA_URI =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

/**
 * 1x1 红色像素 PNG，纯 base64（不含 data URI 前缀）。
 */
export const MINIMAL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

/**
 * 假视频内容 Buffer —— 约 64 字节的二进制数据。
 *
 * 不构造完整 MP4 box 结构，因为：
 * 1. 测试只验证 HTTP 传输完整性，不验证视频可播放性
 * 2. 视频格式校验是云端大模型的职责，不是 API 链路的职责
 * 3. 客户端只下载并保存，不解码视频
 */
export const MINIMAL_VIDEO_BUFFER = Buffer.from(
  "FAKE_MP4_FOR_TESTING_NOT_A_REAL_VIDEO_BUT_VALID_BINARY_DATA",
  "utf-8",
);

/**
 * 假视频的 base64 编码。
 */
export const MINIMAL_VIDEO_BASE64 = MINIMAL_VIDEO_BUFFER.toString("base64");

/**
 * 测试用的标准 prompt。
 */
export const TEST_PROMPT = "A cat running in a garden, cinematic lighting";

/**
 * 测试用的标准时长（秒）。
 */
export const TEST_DURATION = 5;

/**
 * 生成唯一的 taskId，用于测试。
 */
export function generateTestId(prefix = "task"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
