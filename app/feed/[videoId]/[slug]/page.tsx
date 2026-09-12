import type { Metadata } from "next";
import Home from "../../../page";

function toSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 60) || "video";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ videoId: string; slug: string }>;
}): Promise<Metadata> {
  const { videoId } = await params;
  const fallback: Metadata = {
    title: "Loopine 영어 영상 피드",
    description: "짧은 실제 영상으로 영어를 보고 듣고 학습해 보세요.",
  };

  try {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
      { next: { revalidate: 86400 } },
    );
    if (!response.ok) return fallback;
    const data = await response.json();
    const title = String(data.title || "Loopine 영상");
    const channel = String(data.author_name || "YouTube");
    const thumbnail = String(
      data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    );
    const canonical = `https://loopine.life/feed/${videoId}/${toSlug(title)}/`;
    const description = `${channel}의 영상으로 실제 영어 표현을 보고 듣고 학습해 보세요.`;

    return {
      title: `${title} · Loopine`,
      description,
      alternates: { canonical },
      openGraph: {
        title,
        description,
        type: "video.other",
        url: canonical,
        siteName: "Loopine",
        images: [{ url: thumbnail, width: 480, height: 360, alt: title }],
        videos: [{ url: youtubeUrl, type: "text/html" }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} · Loopine`,
        description,
        images: [thumbnail],
      },
    };
  } catch {
    return fallback;
  }
}

export default function PublicFeedVideoPage() {
  return <Home initialTab="feed" />;
}
