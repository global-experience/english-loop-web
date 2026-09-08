/**
 * YouTube 썸네일 해상도 조정.
 *
 * 수집기는 `maxres`(1280×720, 장당 100~300KB)를 우선 저장한다. 상세 화면에는
 * 맞지만 목록 카드는 폭이 200px 남짓이라, 카드 8장이면 최대 2MB 이상을
 * 화면에 보이지도 않을 해상도로 내려받게 된다.
 *
 * DB 값을 바꾸면 이미 쌓인 행은 그대로이고 큰 그림이 필요한 화면도 잃는다.
 * 그래서 저장은 원본 그대로 두고 그리는 시점에 규격만 바꾼다.
 */

/** i.ytimg.com 이 제공하는 규격. 뒤로 갈수록 크다. */
const SIZES = {
  /** 320×180. 가로 목록 카드. */
  small: "mqdefault",
  /** 480×360. 그리드 카드·고밀도 화면. */
  medium: "hqdefault",
  /** 1280×720. 원본. */
  large: "maxresdefault",
} as const;

export type ThumbnailSize = keyof typeof SIZES;

const YTIMG_PATH = /^(https?:\/\/i\.ytimg\.com\/vi(?:_webp)?\/[A-Za-z0-9_-]{11}\/)[a-z0-9]+(\.[a-z]+)$/;

/**
 * ytimg 주소면 요청한 규격으로 바꾸고, 그 외 주소는 그대로 돌려준다.
 * 알아보지 못한 주소를 임의로 손대면 깨진 이미지가 되므로 건드리지 않는다.
 */
export function thumbnailUrl(url: string | null | undefined, size: ThumbnailSize = "medium"): string {
  if (!url) return "";
  const match = YTIMG_PATH.exec(url);
  if (!match) return url;
  return `${match[1]}${SIZES[size]}${match[2]}`;
}

/** 영상 ID 만 있을 때. 저장된 썸네일이 없는 행을 위한 대체 경로. */
export function thumbnailFromVideoId(videoId: string | null | undefined, size: ThumbnailSize = "medium"): string {
  return videoId ? `https://i.ytimg.com/vi/${videoId}/${SIZES[size]}.jpg` : "";
}
