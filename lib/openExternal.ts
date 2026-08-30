import { isNativeAppRuntime } from "./nativeRuntime";

/**
 * Opens an external URL (such as YouTube, ChatGPT, or source link).
 * In Capacitor Native App (iOS/Android), opens using In-App Browser (@capacitor/browser)
 * so the user never exits the mobile app.
 * In standard Web/PWA, opens in a new tab.
 */
export async function openExternalUrl(url: string | null | undefined): Promise<void> {
  if (!url) return;

  const capacitor =
    typeof window !== "undefined"
      ? (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
      : undefined;
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isNative = isNativeAppRuntime(capacitor, userAgent);

  if (isNative) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({
        url,
        presentationStyle: "popover",
      });
      return;
    } catch (err) {
      console.warn("Capacitor Browser open failed, using fallback:", err);
    }
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
