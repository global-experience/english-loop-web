/**
 * 피드 이웃 영상 프리워밍 정책.
 *
 * 현재 보고 있는 영상의 이전/다음 영상을 음소거 상태로 아주 잠깐 재생해 첫 세그먼트만
 * 받아 두면, 스냅이 그 영상으로 넘어올 때 버퍼링 대기가 사라진다. 다만 이 앱은 과거에
 * "스와이프로 지나가는 영상까지 임베드를 만들면 한 IP에서 재생 세션이 폭주해 YouTube
 * 봇 확인 화면에 걸린다"는 문제를 겪었다(FeedView의 PLAY_SETTLE_MS 주석 참고).
 *
 * 그래서 프리워밍은 아래 조건을 모두 만족할 때만 동작한다.
 *  - 네이티브 앱 런타임 (모바일 웹·PC 브라우저는 지금 동작 그대로 유지)
 *  - 데이터 절약 모드가 아니고, 느린 회선이 아니며, 저사양 기기가 아님
 *  - 스크롤이 멈추고 현재 영상이 자리를 잡은 뒤 PREWARM_DELAY_MS 가 더 지났을 것
 *
 * 살아 있는 iframe 은 항상 MAX_LIVE_PLAYERS 개를 넘지 않는다.
 */

/** 현재 영상이 자리를 잡은 뒤 이웃 프리워밍을 시작하기까지 기다리는 시간. */
export const PREWARM_DELAY_MS = 900;

/** 이웃 영상을 음소거로 흘려보내는 시간. 첫 세그먼트를 받을 만큼만. */
export const PREWARM_PLAY_MS = 120;

/** 동시에 살려 두는 플레이어 수: 현재 1 + 이웃 2. */
export const MAX_LIVE_PLAYERS = 3;

/** 빠른 스냅 판정 창. */
export const RAPID_SWIPE_WINDOW_MS = 1500;

/** 이 창 안에서 이만큼 넘기면 "빠르게 넘기는 중"으로 본다. */
export const RAPID_SWIPE_LIMIT = 3;

/** 빠르게 넘긴 뒤 프리워밍을 미뤄 두는 시간. */
export const RAPID_SWIPE_COOLDOWN_MS = 4000;

export type PrewarmHints = {
  native: boolean;
  connection?: { saveData?: boolean; effectiveType?: string };
  deviceMemory?: number;
};

const SLOW_NETWORKS = new Set(["slow-2g", "2g", "3g"]);

/**
 * 이웃 프리워밍을 켜도 되는 환경인지 판단한다.
 * 하나라도 걸리면 기존 동작(현재 영상 한 개만 임베드)으로 남는다.
 */
export function canPrewarmNeighbors({ native, connection, deviceMemory }: PrewarmHints): boolean {
  if (!native) return false;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && SLOW_NETWORKS.has(connection.effectiveType)) return false;
  if (typeof deviceMemory === "number" && deviceMemory > 0 && deviceMemory < 3) return false;
  return true;
}

/**
 * 데워 둘 이웃 인덱스. 다음 영상을 먼저 채운다 — 스와이프는 대부분 아래로 향한다.
 */
export function prewarmWindow(playIndex: number, length: number): number[] {
  return [playIndex + 1, playIndex - 1].filter((index) => index >= 0 && index < length);
}

/**
 * 최근 스냅 시각들을 보고 "빠르게 넘기는 중"인지 판단한다.
 * 빠르게 넘기는 동안에는 이웃 플레이어를 만들지 않고, 이미 만든 것도 회수한다.
 */
export function isRapidSwiping(stamps: number[], now: number): boolean {
  return stamps.filter((at) => now - at <= RAPID_SWIPE_WINDOW_MS).length >= RAPID_SWIPE_LIMIT;
}
