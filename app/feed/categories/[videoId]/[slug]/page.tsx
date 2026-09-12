import type { Metadata } from "next";
import Home from "../../../../page";

/** 제목을 URL-safe 슬러그로 변환한다 */
function toSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 60);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ videoId: string; slug: string }>;
}): Promise<Metadata> {
  const { videoId } = await params;

  const fallback: Metadata = {
    title: "Loopine — 영어 회화 학습",
    description: "실제 영상으로 배우는 진짜 영어 회화 · Loopine",
  };

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`;
    const res = await fetch(oembedUrl, { next: { revalidate: 86400 } });
    if (!res.ok) return fallback;

    const data = await res.json();
    const title: string = data.title || "Loopine 영상";
    const channel: string = data.author_name || "YouTube";
    const thumbnail: string =
      data.thumbnail_url ||
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    const slug = toSlug(title);
    const canonical = `https://loopine.life/feed/categories/${videoId}/${slug}`;

    return {
      title: `${title} · Loopine`,
      description: `${channel}의 영상으로 영어 회화를 배워보세요 · Loopine`,
      alternates: { canonical },
      openGraph: {
        title,
        description: `${channel} · Loopine으로 영어 회화 학습`,
        type: "video.other",
        url: canonical,
        images: [{ url: thumbnail, width: 480, height: 360, alt: title }],
        videos: [
          { url: `https://www.youtube.com/watch?v=${videoId}`, type: "text/html" },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: `${title} · Loopine`,
        description: `${channel} · 영어 회화 학습`,
        images: [thumbnail],
      },
    };
  } catch {
    return fallback;
  }
}

export default function FeedCategoryVideoSlugPage() {
  return <Home />;
}
