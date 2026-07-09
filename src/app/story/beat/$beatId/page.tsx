import { StoryProvider } from "@/app/story/StoryProvider";
import BeatDetailClient from "./BeatDetailClient";

export default function BeatDetailPage() {
  return (
    <StoryProvider>
      <BeatDetailClient />
    </StoryProvider>
  );
}
