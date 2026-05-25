import BeatDetailClient from "./BeatDetailClient";

export function generateStaticParams() {
  return [{ beatId: "_" }];
}

export default function BeatDetailPage() {
  return <BeatDetailClient />;
}
