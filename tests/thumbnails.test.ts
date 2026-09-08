/**
 * 목록 카드가 원본 해상도 썸네일을 받지 않도록.
 *
 * 수집기는 maxres(1280×720, 장당 100~300KB)를 저장한다. 96px 짜리 자리에
 * 그걸 그대로 쓰면 카드 8장에 2MB 가 넘는다.
 */

import { describe, expect, it } from "vitest";
import { thumbnailFromVideoId, thumbnailUrl } from "@/lib/thumbnails";

describe("thumbnailUrl", () => {
  it("저장된 maxres 주소를 요청한 규격으로 낮춘다", () => {
    expect(thumbnailUrl("https://i.ytimg.com/vi/rGQkLXIey4Y/maxresdefault.jpg", "small"))
      .toBe("https://i.ytimg.com/vi/rGQkLXIey4Y/mqdefault.jpg");
    expect(thumbnailUrl("https://i.ytimg.com/vi/rGQkLXIey4Y/maxresdefault.jpg", "medium"))
      .toBe("https://i.ytimg.com/vi/rGQkLXIey4Y/hqdefault.jpg");
  });

  it("webp 경로와 확장자를 보존한다", () => {
    expect(thumbnailUrl("https://i.ytimg.com/vi_webp/rGQkLXIey4Y/maxresdefault.webp", "small"))
      .toBe("https://i.ytimg.com/vi_webp/rGQkLXIey4Y/mqdefault.webp");
  });

  it("규격을 키우는 방향도 된다", () => {
    expect(thumbnailUrl("https://i.ytimg.com/vi/rGQkLXIey4Y/mqdefault.jpg", "large"))
      .toBe("https://i.ytimg.com/vi/rGQkLXIey4Y/maxresdefault.jpg");
  });

  it("ytimg 가 아닌 주소는 건드리지 않는다 — 임의로 고치면 깨진 이미지가 된다", () => {
    const external = "https://cdn.example.com/thumbs/abc.jpg";
    expect(thumbnailUrl(external, "small")).toBe(external);
    expect(thumbnailUrl("https://i.ytimg.com/vi/tooshort/maxresdefault.jpg")).toBe(
      "https://i.ytimg.com/vi/tooshort/maxresdefault.jpg",
    );
  });

  it("빈 값은 빈 문자열", () => {
    expect(thumbnailUrl(null)).toBe("");
    expect(thumbnailUrl(undefined)).toBe("");
    expect(thumbnailUrl("")).toBe("");
  });
});

describe("thumbnailFromVideoId", () => {
  it("영상 ID 로 주소를 만든다", () => {
    expect(thumbnailFromVideoId("rGQkLXIey4Y", "medium"))
      .toBe("https://i.ytimg.com/vi/rGQkLXIey4Y/hqdefault.jpg");
    expect(thumbnailFromVideoId(null)).toBe("");
  });
});
