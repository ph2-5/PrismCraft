/**
 * @huggingface/transformers 测试 mock
 *
 * 该包是可选依赖（仅在用户拖入 ONNX 模型时需要），未安装时 vitest 预扫描
 * 会尝试解析其 import 语句导致失败。通过 vitest.config.ts 的 resolve.alias
 * 将其指向本 mock，使模块解析成功。
 *
 * 运行时 local-embedding-provider.ts 的 loadPipeline() 会 try/catch 动态
 * import，mock 返回的 pipeline 会抛出异常，安全降级为"本地模型不可用"。
 */

export async function pipeline(): Promise<never> {
  throw new Error("[mock] @huggingface/transformers not installed");
}
