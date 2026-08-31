const HAPTICS_PREF_KEY = "loopine:haptics:enabled";

/**
 * Check if haptic feedback is enabled by user preference (default: true).
 */
export function isHapticsEnabled(): boolean {
  return true;
}

/**
 * Set user preference for haptic feedback.
 */
export function setHapticsEnabled(enabled: boolean): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(HAPTICS_PREF_KEY, enabled ? "true" : "false");
  }
}

/**
 * Safely load Capacitor Haptics plugin on client side if available.
 */
async function getCapacitorHaptics() {
  if (typeof window === "undefined") return null;
  try {
    const mod = await import("@capacitor/haptics");
    return mod;
  } catch {
    return null;
  }
}

/**
 * Trigger an impact haptic vibration (light, medium, heavy).
 * Impact style produces distinct tactile feedback on iOS & Android.
 */
export async function triggerHapticImpact(style: "light" | "medium" | "heavy" = "medium"): Promise<void> {
  if (!isHapticsEnabled()) return;

  const haptics = await getCapacitorHaptics();
  if (haptics?.Haptics) {
    try {
      const impactStyleMap = {
        light: haptics.ImpactStyle.Light,
        medium: haptics.ImpactStyle.Medium,
        heavy: haptics.ImpactStyle.Heavy,
      };
      await haptics.Haptics.impact({ style: impactStyleMap[style] || haptics.ImpactStyle.Medium });
      return;
    } catch {
      try {
        await haptics.Haptics.vibrate({ duration: style === "heavy" ? 60 : style === "medium" ? 35 : 20 });
        return;
      } catch {
        // ignore
      }
    }
  }

  // Fall back to Web Vibration API if native Haptics plugin is unavailable
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      const durationMap = { light: 20, medium: 35, heavy: 60 };
      navigator.vibrate(durationMap[style] || 35);
    } catch {
      // ignore
    }
  }
}

/**
 * Trigger tab selection haptic feedback.
 * Uses crisp medium impact for clear tactile response on device.
 */
export async function triggerHapticSelection(): Promise<void> {
  if (!isHapticsEnabled()) return;

  const haptics = await getCapacitorHaptics();
  if (haptics?.Haptics) {
    try {
      // ImpactStyle.Medium is noticeably clear on iOS Taptic Engine
      await haptics.Haptics.impact({ style: haptics.ImpactStyle.Medium });
      return;
    } catch {
      try {
        await haptics.Haptics.vibrate({ duration: 30 });
        return;
      } catch {
        // ignore
      }
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(30);
    } catch {
      // ignore
    }
  }
}

/**
 * Trigger a notification haptic feedback (success, warning, error).
 */
export async function triggerHapticNotification(type: "success" | "warning" | "error" = "success"): Promise<void> {
  if (!isHapticsEnabled()) return;

  const haptics = await getCapacitorHaptics();
  if (haptics?.Haptics) {
    try {
      const typeMap = {
        success: haptics.NotificationType.Success,
        warning: haptics.NotificationType.Warning,
        error: haptics.NotificationType.Error,
      };
      await haptics.Haptics.notification({ type: typeMap[type] || haptics.NotificationType.Success });
      return;
    } catch {
      try {
        const durationMap = { success: 40, warning: 60, error: 80 };
        await haptics.Haptics.vibrate({ duration: durationMap[type] || 40 });
        return;
      } catch {
        // ignore
      }
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      const patternMap: Record<string, number[]> = {
        success: [25, 40, 25],
        warning: [40, 50, 40],
        error: [60, 50, 60],
      };
      navigator.vibrate(patternMap[type] || [25, 40, 25]);
    } catch {
      // ignore
    }
  }
}
