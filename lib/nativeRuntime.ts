export type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
};

export function isNativeAppRuntime(capacitor: CapacitorRuntime | undefined, userAgent: string) {
  return capacitor?.isNativePlatform?.() === true || userAgent.includes("LoopineNative/");
}

export function shouldStartFeedMuted({
  native,
  userInteracted,
  userMuted,
}: {
  native: boolean;
  userInteracted: boolean;
  userMuted: boolean;
}) {
  return userMuted || (!native && !userInteracted);
}
