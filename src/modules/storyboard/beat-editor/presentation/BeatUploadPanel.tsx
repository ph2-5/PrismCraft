import { forwardRef, useImperativeHandle, useRef } from "react";

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
) {
  const file = e.target.files?.[0];
  if (file && handler) {
    handler(beatId, file);
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

    return (
      <>
        <input
          ref={keyframeInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, beatId, onUploadKeyframe)}
        />
        <input
          ref={firstFrameInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, beatId, onUploadFirstFrame)}
        />
        <input
          ref={lastFrameInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, beatId, onUploadLastFrame)}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e, beatId, onUploadVideo)}
        />
      </>
    );
  },
);
