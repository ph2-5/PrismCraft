export function resolveImageUrl(
  imageUrl: string | undefined | null,
): string | undefined {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith("data:")) return imageUrl;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"))
    return imageUrl;
  if (imageUrl.startsWith("file://")) return imageUrl;
  if (imageUrl.startsWith("vcache://")) return imageUrl;
  if (imageUrl.startsWith("icache://")) return imageUrl;
  if (imageUrl.startsWith("/api/")) return imageUrl;
  if (imageUrl.includes(":\\") || imageUrl.startsWith("/")) {
    const normalized = imageUrl.replace(/\\/g, "/");
    return `file://${normalized}`;
  }
  return imageUrl;
}

export function resolveMediaUrl(
  localPath: string | undefined | null,
  remoteUrl: string | undefined | null,
): string | undefined {
  if (localPath) {
    const resolved = resolveImageUrl(localPath);
    if (resolved) return resolved;
  }
  return resolveImageUrl(remoteUrl);
}

export function isLocalAssetUrl(url: string): boolean {
  if (!url) return false;
  return url.startsWith("file://") || url.startsWith("vcache://") || url.startsWith("icache://") || url.startsWith("data:");
}

export function isRemoteUrl(url: string): boolean {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://");
}
