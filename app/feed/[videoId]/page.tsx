import { redirect } from "next/navigation";

export default async function PublicFeedVideoRedirect({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  redirect(`/feed/${encodeURIComponent(videoId)}/video/`);
}
