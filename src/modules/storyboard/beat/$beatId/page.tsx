import { StoryProvider } from "@/modules/storyboard/StoryProvider";
import BeatDetailClient from "./BeatDetailClient";

export default function BeatDetailPage() {
  return (
    <StoryProvider>
      <BeatDetailClient />
    </StoryProvider>
  );
}
