import { redirect } from "next/navigation";

/** 제목을 URL-safe 슬러그로 변환한다 */
function toSlug(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // 발음 기호 제거
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")          // 특수문자 제거
    .replace(/\s+/g, "-")              // 공백 → 하이픈
    .replace(/-+/g, "-")               // 연속 하이픈 정리
    .trim()
    .slice(0, 60);
}

export default async function FeedCategoryVideoPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;

  // YouTube oEmbed로 제목 가져와 슬러그 생성 (공개 API, 인증 불필요)
  // ⚠️ redirect()는 내부적으로 throw하므로 try-catch 밖에서 호출해야 한다.
  let slug = "video";
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`;
    const res = await fetch(oembedUrl, { next: { revalidate: 86400 } });
    if (res.ok) {
      const data = await res.json();
      slug = toSlug(data.title || "video");
    }
  } catch {
    // oEmbed 실패 시 기본 슬러그("video") 사용
  }

  redirect(`/feed/categories/${videoId}/${slug}`);
}
