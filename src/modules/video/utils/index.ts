import { container } from "@/infrastructure/di";

export {
  detectVideoCodec,
  getVideoCodecLabel,
  getContainerLabel,
  extractVideoFrames,
  dataUrlToFile,
} from "@/shared/video-utils";
export type {
  VideoCodec,
  AudioCodec,
  ContainerFormat,
  VideoCodecInfo,
  ExtractedFrames,
} from "@/shared/video-utils";
export const isCodecSupportedByProvider = container.isCodecSupportedByProvider;
export { downloadJSONFile } from "@/shared/utils/file-download";
export {
  videoTemplates,
  templateCategories,
  getTemplatesByCategory,
  applyVideoTemplate,
} from "./video-templates";
export type { VideoTemplate } from "./video-templates";
