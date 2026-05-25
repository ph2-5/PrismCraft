/**
 * API 配置系统 - 统一导出
 * 
 * 新的 API 配置系统，特点：
 * 1. 统一的配置管理
 * 2. 自动提供商检测
 * 3. 功能映射（文本/图片/视觉/视频）
 * 4. 加密存储 API Key
 * 5. 向后兼容旧代码
 */

// 客户端安全导出（仅导出客户端可用的模块）
export * from './types';
export * from './templates';
export * from './detect';
export * from './storage';
export * from './migrate';
export * from './init';
