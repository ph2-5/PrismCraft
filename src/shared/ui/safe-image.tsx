import NextImage from "next/image";

interface SafeImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  priority?: boolean;
}

export function SafeImage({
  src,
  alt = "",
  className,
  width,
  height,
  fill,
  priority,
}: SafeImageProps) {
  if (!src) return null;

  const validSrc = src.startsWith("data:") ? src : src;

  if (fill) {
    return (
      <NextImage
        src={validSrc}
        alt={alt}
        fill
        className={className}
        priority={priority}
        unoptimized
      />
    );
  }

  return (
    <NextImage
      src={validSrc}
      alt={alt}
      width={width || 100}
      height={height || 100}
      className={className}
      priority={priority}
      unoptimized
    />
  );
}
