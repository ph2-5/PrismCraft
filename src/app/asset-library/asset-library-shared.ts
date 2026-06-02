import type {
  Character,
  Scene,
  StoryboardAsset,
} from "@/domain/schemas";

export type AssetTab = "characters" | "scenes" | "storyboards" | "collections";

export type EditingItem =
  | (Character & { _type: "character" })
  | (Scene & { _type: "scene" })
  | (StoryboardAsset & { _type: "storyboard" });

export function toDateFromTimestamp(ts: unknown): Date {
  if (typeof ts === "number") return new Date(ts * 1000);
  if (typeof ts === "string") {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function fetchSecondaryData() {
  const { container } = await import("@/infrastructure/di");
  const [sb, col, colAssets] = await Promise.all([
    container.storyboardStorage.getStoryboardAssets(),
    container.collectionStorage.getCollections(),
    container.collectionStorage.getCollectionAssets(),
  ]);
  return { storyboards: sb, collections: col, collectionAssets: colAssets };
}
