export type CapacitorRuntime = {
  isNativePlatform?: () => boolean;
  Plugins?: {
    SplashScreen?: {
      hide?: (options?: { fadeOutDuration?: number }) => Promise<void>;
      show?: (options?: { autoHide?: boolean; fadeInDuration?: number; fadeOutDuration?: number; showDuration?: number }) => Promise<void>;
    };
    [key: string]: unknown;
  };
};

export function isNativeAppRuntime(capacitor: CapacitorRuntime | undefined, userAgent: string) {
  return capacitor?.isNativePlatform?.() === true || userAgent.includes("LoopineNative/");
}

export async function hideNativeSplashScreen(fadeOutDuration = 300): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const capacitor = (window as Window & { Capacitor?: CapacitorRuntime }).Capacitor;
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (!isNativeAppRuntime(capacitor, userAgent)) return false;

  try {
    const splashPlugin = capacitor?.Plugins?.SplashScreen;
    if (typeof splashPlugin?.hide === "function") {
      await splashPlugin.hide({ fadeOutDuration });
      return true;
    }
  } catch (err) {
    console.warn("Failed to hide native splash screen:", err);
  }
  return false;
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

export function isMobileDeviceRuntime(userAgent: string, maxTouchPoints: number = 0, capacitor?: CapacitorRuntime): boolean {
  if (isNativeAppRuntime(capacitor, userAgent)) return true;
  const isTouchMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const isIPadOs = userAgent.includes("Macintosh") && maxTouchPoints > 1;
  return isTouchMobile || isIPadOs;
}

