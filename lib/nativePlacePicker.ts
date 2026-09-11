"use client";

import { isNativeAppRuntime } from "@/lib/nativeRuntime";

export type NativePlacePickerInput = {
  latitude?: number;
  longitude?: number;
  addressLabel?: string;
};

export type NativePlacePickerSelection = {
  latitude: number;
  longitude: number;
  addressLabel?: string;
};

type PickerEvent = {
  status: "selected" | "cancelled" | "unavailable" | "error";
  latitude?: number;
  longitude?: number;
  addressLabel?: string;
  message?: string;
};

type PickerBridge = { present?: (payload: NativePlacePickerInput) => void };
type AndroidPickerHost = { present?: (payload: string) => void };
type PickerWindow = Window & {
  Capacitor?: { isNativePlatform?: () => boolean };
  LoopineNativePlacePicker?: PickerBridge;
  LoopineNativePlacePickerHost?: AndroidPickerHost;
};

function bridge(): PickerBridge | null {
  if (typeof window === "undefined") return null;
  const target = window as PickerWindow;
  if (!isNativeAppRuntime(target.Capacitor, navigator.userAgent)) return null;
  if (target.LoopineNativePlacePicker?.present) return target.LoopineNativePlacePicker;
  if (target.LoopineNativePlacePickerHost?.present) {
    return { present: (payload) => target.LoopineNativePlacePickerHost?.present?.(JSON.stringify(payload)) };
  }
  return null;
}

export function presentNativePlacePicker(input: NativePlacePickerInput): Promise<NativePlacePickerSelection | null | "unavailable"> {
  const nativeBridge = bridge();
  const present = nativeBridge?.present;
  if (!present) return Promise.resolve("unavailable");

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: NativePlacePickerSelection | null | "unavailable") => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      window.removeEventListener("loopine:native-place-picker-result", handleResult);
      resolve(result);
    };
    const handleResult = (event: Event) => {
      const detail = (event as CustomEvent<PickerEvent>).detail;
      if (!detail) return;
      if (detail.status === "cancelled") return finish(null);
      if (detail.status !== "selected") return finish("unavailable");
      const latitude = Number(detail.latitude);
      const longitude = Number(detail.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return finish("unavailable");
      finish({ latitude, longitude, addressLabel: detail.addressLabel || undefined });
    };
    const timeout = window.setTimeout(() => finish("unavailable"), 10 * 60 * 1_000);
    window.addEventListener("loopine:native-place-picker-result", handleResult);
    try {
      present(input);
    } catch {
      finish("unavailable");
    }
  });
}
