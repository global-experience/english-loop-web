"use client";

import { apiFetch } from "@/lib/api";

export type YouTubeValidationResult = {
  ok: boolean;
  reason?: string;
  videoId?: string;
  title?: string;
  channelTitle?: string;
  durationSeconds?: number;
};

export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(?:v=|youtu\.be\/|shorts\/|embed\/|^)([A-Za-z0-9_-]{11})(?:[&?]|$)/);
  if (match && match[1]) return match[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return null;
}

export function ensureYouTubeIframeApi(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.YT?.Player) return Promise.resolve(true);

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const previousReadyHandler = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReadyHandler?.();
      finish(true);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => finish(false);
      document.body.appendChild(script);
    }

    window.setTimeout(() => {
      finish(Boolean(window.YT?.Player));
    }, 2500);
  });
}

/**
 * Checks in-browser whether the YouTube video can actually be embedded / played.
 * Detects error 101/150 (owner restricted embedding), 100 (not found/private), 2 (invalid), 5 (HTML5 error).
 */
export async function checkYouTubePlayability(videoId: string): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined" || !document.body) {
    return { ok: true };
  }

  const apiReady = await ensureYouTubeIframeApi();
  if (!apiReady || !window.YT?.Player) {
    return { ok: true };
  }

  return new Promise((resolve) => {
    let resolved = false;
    let player: any = null;

    const testContainer = document.createElement("div");
    testContainer.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:200px;height:200px;opacity:0;pointer-events:none;z-index:-1000;";
    document.body.appendChild(testContainer);

    const cleanup = () => {
      try {
        player?.destroy?.();
      } catch {
        // ignore cleanup errors
      }
      try {
        testContainer.remove();
      } catch {
        // ignore removal errors
      }
    };

    const finish = (result: { ok: boolean; reason?: string }) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      cleanup();
      resolve(result);
    };

    const timeoutId = window.setTimeout(() => {
      finish({ ok: true });
    }, 1800);

    const YT = (window as unknown as { YT?: { Player?: new (...args: any[]) => any } }).YT;
    if (!YT?.Player) {
      finish({ ok: true });
      return;
    }

    try {
      player = new YT.Player(testContainer, {
        videoId,
        playerVars: {
          controls: 0,
          playsinline: 1,
          modestbranding: 1,
          iv_load_policy: 3,
        },
        events: {
          onReady: () => {
            window.setTimeout(() => {
              finish({ ok: true });
            }, 600);
          },
          onError: (event: { data: number }) => {
            const code = event.data;
            if (code === 101 || code === 150) {
              finish({
                ok: false,
                reason: "이 영상은 소유자의 설정으로 인해 다른 웹사이트에서 재생할 수 없습니다. 다른 영상을 선택해 주세요.",
              });
            } else if (code === 100) {
              finish({
                ok: false,
                reason: "영상을 찾을 수 없거나 비공개된 영상입니다.",
              });
            } else if (code === 2) {
              finish({
                ok: false,
                reason: "유효하지 않은 YouTube 영상 링크입니다.",
              });
            } else if (code === 5) {
              finish({
                ok: false,
                reason: "HTML5 플레이어에서 재생할 수 없는 영상입니다.",
              });
            } else {
              finish({
                ok: false,
                reason: "영상을 재생할 수 없습니다.",
              });
            }
          },
        },
      });
    } catch {
      finish({ ok: true });
    }
  });
}

/**
 * Validates a YouTube video upfront:
 * 1. Checks video URL format & extracts 11-char video ID.
 * 2. Queries backend /api/youtube/validate (checks Data API status.embeddable, privacyStatus, video existence).
 * 3. In the browser, checks client-side YouTube player embeddability (catches Content ID / syndication restrictions).
 */
export async function validateYouTubeVideo(urlOrId: string): Promise<YouTubeValidationResult> {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) {
    return {
      ok: false,
      reason: "올바른 YouTube 영상 링크를 입력해 주세요.",
    };
  }

  try {
    const data = await apiFetch<{
      video_id: string;
      title: string;
      channel_title?: string;
      duration_seconds?: number;
      embeddable: boolean;
    }>("/api/youtube/validate", {
      method: "POST",
      body: JSON.stringify({ video: videoId }),
    });

    if (data.embeddable === false) {
      return {
        ok: false,
        videoId,
        reason: "이 영상은 소유자의 설정으로 인해 다른 웹사이트에서 재생할 수 없습니다. 다른 영상을 선택해 주세요.",
      };
    }

    const playability = await checkYouTubePlayability(videoId);
    if (!playability.ok) {
      return {
        ok: false,
        videoId,
        reason: playability.reason || "이 영상은 소유자의 설정으로 인해 다른 웹사이트에서 재생할 수 없습니다. 다른 영상을 선택해 주세요.",
      };
    }

    return {
      ok: true,
      videoId,
      title: data.title,
      channelTitle: data.channel_title || undefined,
      durationSeconds: data.duration_seconds || undefined,
    };
  } catch (caught) {
    const errorMsg = caught instanceof Error ? caught.message : "";
    if (errorMsg.includes("소유자의 설정") || errorMsg.includes("비공개")) {
      return {
        ok: false,
        videoId,
        reason: errorMsg,
      };
    }
    const playability = await checkYouTubePlayability(videoId);
    if (!playability.ok) {
      return {
        ok: false,
        videoId,
        reason: playability.reason || "이 영상은 소유자의 설정으로 인해 다른 웹사이트에서 재생할 수 없습니다. 다른 영상을 선택해 주세요.",
      };
    }

    return {
      ok: true,
      videoId,
    };
  }
}
