import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  validateUploadFile,
  IMAGE_ACCEPTED_EXTENSIONS,
  VIDEO_ACCEPTED_EXTENSIONS,
} from "@/shared/utils/upload-validation";

export interface BeatUploadPanelHandle {
  triggerKeyframeUpload: () => void;
  triggerFirstFrameUpload: () => void;
  triggerLastFrameUpload: () => void;
  triggerVideoUpload: () => void;
}

interface BeatUploadPanelProps {
  beatId: string;
  onUploadKeyframe?: (beatId: string, file: File) => void;
  onUploadFirstFrame?: (beatId: string, file: File) => void;
  onUploadLastFrame?: (beatId: string, file: File) => void;
  onUploadVideo?: (beatId: string, file: File) => void;
}

function handleFileSelect(
  e: React.ChangeEvent<HTMLInputElement>,
  beatId: string,
  handler?: (beatId: string, file: File) => void,
  allowedExtensions?: readonly string[],
) {
  const file = e.target.files?.[0];
  if (file && handler) {
    const result = validateUploadFile(file, { allowedExtensions });
    if (result.ok) {
      handler(beatId, file);
    }
  }
  e.target.value = "";
}

export const BeatUploadPanel = forwardRef<BeatUploadPanelHandle, BeatUploadPanelProps>(
  function BeatUploadPanel({
    beatId,
    onUploadKeyframe,
    onUploadFirstFrame,
    onUploadLastFrame,
    onUploadVideo,
  }, ref) {
    const keyframeInputRef = useRef<HTMLInputElement>(null);
    const firstFrameInputRef = useRef<HTMLInputElement>(null);
    const lastFrameInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      triggerKeyframeUpload: () => keyframeInputRef.current?.click(),
      triggerFirstFrameUpload: () => firstFrameInputRef.current?.click(),
      triggerLastFrameUpload: () => lastFrameInputRef.current?.click(),
      triggerVideoUpload: () => videoInputRef.current?.click(),
    }), []);

    const imageAccept = IMAGE_ACCEPTED_EXTENSIONS.join(",");
    const videoAccept = VIDEO_ACCEPTED_EXTENSIONS.join(",");

    return (
      <>
        <input
          ref={keyframeInputRef}
          type="file"
          accept={imageAccept}
          className="hidden"
          onChange={(e) => handleFileSelect(e, beatId, onUploadKeyframe, IMAGE_ACCEPTED_EXTENSIONS)}
        />
        <input
          ref={firstFrameInputRef}
          type="file"
          accept={imageAccept}
          className="hidden"
          onChange={(e) => handleFileSelect(e, beatId, onUploadFirstFrame, IMAGE_ACCEPTED_EXTENSIONS)}
        />
        <input
          ref={lastFrameInputRef}
          type="file"
          accept={imageAccept}
          className="hidden"
          onChange={(e) => handleFileSelect(e, beatId, onUploadLastFrame, IMAGE_ACCEPTED_EXTENSIONS)}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept={videoAccept}
          className="hidden"
          onChange={(e) => handleFileSelect(e, beatId, onUploadVideo, VIDEO_ACCEPTED_EXTENSIONS)}
        />
      </>
    );
  },
);
