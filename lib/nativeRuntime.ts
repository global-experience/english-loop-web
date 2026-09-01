export type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
};

export function isNativeAppRuntime(capacitor: CapacitorRuntime | undefined, userAgent: string) {
  return capacitor?.isNativePlatform?.() === true || userAgent.includes("LoopineNative/");
}

export function hasUserActivation(): boolean {
  if (typeof navigator !== "undefined" && navigator.userActivation?.hasBeenActive) {
    return true;
  }
  return false;
}

export function shouldStartFeedMuted({
  native,
  userInteracted,
  userMuted,
  hasBeenActive = hasUserActivation(),
}: {
  native: boolean;
  userInteracted: boolean;
  userMuted: boolean;
  hasBeenActive?: boolean;
}) {
  if (userMuted) return true;
  return !(native || userInteracted || hasBeenActive);
}

