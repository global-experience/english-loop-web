"use client";

import { apiFetch } from "@/lib/api";
import { isNativeAppRuntime } from "@/lib/nativeRuntime";
import type { RoutineItem, RoutinePayload } from "@/lib/types";

const ACTION_TYPE_ID = "LOOPINE_ROUTINE_REMINDER";
const ACTION_START = "START_NOW";
const ACTION_SNOOZE = "SNOOZE_10";
const ACTION_SKIP = "SKIP_TODAY";
const SETTINGS_KEY = "loopine:smart-location-reminders:v1";
const WATCHER_KEY = "loopine:smart-location-watcher:v1";
const MAX_PENDING_REMINDERS = 48;
const DEFAULT_HORIZON_DAYS = 14;

type ListenerHandle = { remove: () => Promise<void> };

type NativeNotification = {
  id: number;
  title: string;
  body: string;
  schedule?: { at: Date; allowWhileIdle?: boolean };
  actionTypeId?: string;
  extra?: Record<string, unknown>;
};

type NativeLocalNotifications = {
  checkPermissions?: () => Promise<{ display?: string }>;
  requestPermissions?: () => Promise<{ display?: string }>;
  registerActionTypes?: (options: {
    types: Array<{
      id: string;
      actions: Array<{ id: string; title: string; foreground?: boolean }>;
    }>;
  }) => Promise<void>;
  getPending?: () => Promise<{ notifications: NativeNotification[] }>;
  cancel?: (options: { notifications: Array<{ id: number }> }) => Promise<void>;
  schedule?: (options: { notifications: NativeNotification[] }) => Promise<void>;
  addListener?: (
    eventName: "localNotificationActionPerformed",
    listener: (event: { actionId?: string; notification: NativeNotification }) => void,
  ) => Promise<ListenerHandle>;
};

type NativeLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  time?: number;
};

type NativeLocationError = { code?: string; message?: string };

type NativeBackgroundGeolocation = {
  addWatcher?: (
    options: {
      backgroundMessage?: string;
      backgroundTitle?: string;
      requestPermissions?: boolean;
      stale?: boolean;
      distanceFilter?: number;
    },
    callback: (location?: NativeLocation, error?: NativeLocationError) => void,
  ) => Promise<string> | string;
  removeWatcher?: (options: { id: string }) => Promise<void> | void;
  openSettings?: () => Promise<void>;
};

type CapacitorWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    Plugins?: Record<string, unknown>;
  };
};

export type SmartPlace = {
  id: string;
  name: string;
  addressLabel?: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  updatedAt: string;
};

export type SmartReminderSettings = {
  enabled: boolean;
  places: Record<string, SmartPlace>;
  inside: Record<string, boolean>;
  triggered: Record<string, number>;
};

export type RoutineReminderOccurrence = {
  key: string;
  id: number;
  item: RoutineItem;
  localDate: string;
  scheduledAt: Date;
};

const DEFAULT_SMART_SETTINGS: SmartReminderSettings = {
  enabled: false,
  places: {},
  inside: {},
  triggered: {},
};

let actionListener: ListenerHandle | null = null;
let activeWatcherId: string | null = null;
let latestPayload: RoutinePayload | null = null;

function nativePlugins() {
  if (typeof window === "undefined") return null;
  const capacitor = (window as CapacitorWindow).Capacitor;
  if (!isNativeAppRuntime(capacitor, navigator.userAgent)) return null;
  return capacitor?.Plugins || null;
}

function localNotifications(): NativeLocalNotifications | null {
  return (nativePlugins()?.LocalNotifications as NativeLocalNotifications | undefined) || null;
}

function backgroundGeolocation(): NativeBackgroundGeolocation | null {
  return (nativePlugins()?.BackgroundGeolocation as NativeBackgroundGeolocation | undefined) || null;
}

function hash32(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0x7fffffff;
}

function notificationId(itemId: string, localDate: string, kind: string) {
  return Math.max(1, hash32(`loopine:${itemId}:${localDate}:${kind}`));
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loopineWeekday(value: Date) {
  return (value.getDay() + 6) % 7;
}

function parseTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return {
    hour: Number.isFinite(hour) ? hour : 9,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function normalizedNotification(item: RoutineItem) {
  return {
    enabled: item.notification?.enabled === true,
    offsetMinutes: Number(item.notification?.offsetMinutes || 0),
    trigger: item.notification?.trigger || "time",
    fallbackToTime: item.notification?.fallbackToTime !== false,
    locationWindowMinutes: Number(item.notification?.locationWindowMinutes || 180),
    locationId: item.notification?.locationId || null,
    title: item.notification?.title || `Loopine · ${item.name}`,
    body: item.notification?.body || "오늘 루틴을 이어갈 시간이에요.",
  };
}

function completedTodayItemIds(payload: RoutinePayload) {
  if (!payload.study_date || !payload.today_items) return new Set<string>();
  return new Set(
    payload.today_items
      .filter((item) => item.status === "COMPLETED" || item.status === "SKIPPED")
      .map((item) => item.id),
  );
}

export function buildRoutineReminderOccurrences(
  payload: RoutinePayload,
  now = new Date(),
  horizonDays = DEFAULT_HORIZON_DAYS,
  triggeredKeys: ReadonlySet<string> = new Set(),
): RoutineReminderOccurrence[] {
  const items = payload.plans.flatMap((plan) => plan.is_active ? plan.items : []);
  const completed = completedTodayItemIds(payload);
  const result: RoutineReminderOccurrence[] = [];

  for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset += 1) {
    const routineDate = new Date(now);
    routineDate.setHours(12, 0, 0, 0);
    routineDate.setDate(routineDate.getDate() + dayOffset);
    const localDate = localDateKey(routineDate);
    const weekday = loopineWeekday(routineDate);

    for (const item of items) {
      const notification = normalizedNotification(item);
      if (!item.is_active || !notification.enabled || !item.days_of_week.includes(weekday)) continue;
      if (localDate === payload.study_date && completed.has(item.id)) continue;
      if (notification.trigger !== "time" && !notification.fallbackToTime) continue;
      if (triggeredKeys.has(`${item.id}:${localDate}:${notification.trigger}`)) continue;

      const { hour, minute } = parseTime(item.start_time);
      const scheduledAt = new Date(routineDate);
      scheduledAt.setHours(hour, minute, 0, 0);
      scheduledAt.setMinutes(scheduledAt.getMinutes() + notification.offsetMinutes);
      if (scheduledAt.getTime() <= now.getTime() + 5_000) continue;

      result.push({
        key: `${item.id}:${localDate}:time`,
        id: notificationId(item.id, localDate, "time"),
        item,
        localDate,
        scheduledAt,
      });
    }
  }

  return result
    .sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime())
    .slice(0, MAX_PENDING_REMINDERS);
}

function occurrenceNotification(occurrence: RoutineReminderOccurrence): NativeNotification {
  const notification = normalizedNotification(occurrence.item);
  return {
    id: occurrence.id,
    title: notification.title,
    body: notification.body,
    schedule: { at: occurrence.scheduledAt },
    actionTypeId: ACTION_TYPE_ID,
    extra: {
      loopineKind: "routine",
      schemaVersion: 1,
      routineId: occurrence.item.routine_id,
      routineItemId: occurrence.item.id,
      localDate: occurrence.localDate,
      entrySource: "notification",
    },
  };
}

function cleanTriggered(settings: SmartReminderSettings) {
  const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1_000;
  settings.triggered = Object.fromEntries(
    Object.entries(settings.triggered).filter(([, timestamp]) => timestamp >= cutoff),
  );
  return settings;
}

export function getSmartReminderSettings(): SmartReminderSettings {
  if (typeof window === "undefined") return structuredClone(DEFAULT_SMART_SETTINGS);
  try {
    const value = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) || "null") as Partial<SmartReminderSettings> | null;
    if (!value) return structuredClone(DEFAULT_SMART_SETTINGS);
    const places = Object.fromEntries(
      Object.entries(value.places || {}).flatMap(([key, raw]) => {
        const place = raw as Partial<SmartPlace>;
        if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) return [];
        const id = String(place.id || key);
        return [[id, {
          id,
          name: String(place.name || (key === "home" ? "집" : key === "work" ? "회사" : "장소")),
          addressLabel: place.addressLabel ? String(place.addressLabel) : undefined,
          latitude: Number(place.latitude),
          longitude: Number(place.longitude),
          radiusMeters: Math.max(80, Math.min(2_000, Number(place.radiusMeters) || 500)),
          updatedAt: String(place.updatedAt || new Date().toISOString()),
        } satisfies SmartPlace]];
      }),
    );
    return cleanTriggered({
      enabled: value.enabled === true,
      places,
      inside: value.inside || {},
      triggered: value.triggered || {},
    });
  } catch {
    return structuredClone(DEFAULT_SMART_SETTINGS);
  }
}

export function saveSmartReminderSettings(settings: SmartReminderSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(cleanTriggered(settings)));
  window.dispatchEvent(new CustomEvent("loopine:smart-reminders-updated", { detail: settings }));
}

async function notificationPermission(plugin: NativeLocalNotifications, requestPermission: boolean) {
  const current = await plugin.checkPermissions?.();
  if (current?.display === "granted") return "granted";
  if (!requestPermission) return current?.display || "prompt";
  const requested = await plugin.requestPermissions?.();
  return requested?.display || current?.display || "denied";
}

function openRoutineFromNotification(extra: Record<string, unknown> | undefined) {
  if (typeof window === "undefined" || !extra?.routineItemId) return;
  const url = new URL("/learn/", window.location.origin);
  url.searchParams.set("routineId", String(extra.routineId || ""));
  url.searchParams.set("routineItemId", String(extra.routineItemId));
  url.searchParams.set("entrySource", "notification");
  window.location.assign(url.toString());
}

async function handleNotificationAction(event: { actionId?: string; notification: NativeNotification }) {
  const plugin = localNotifications();
  if (!plugin) return;
  const actionId = event.actionId || ACTION_START;
  const extra = event.notification.extra;
  const routineItemId = String(extra?.routineItemId || "");
  const localDate = String(extra?.localDate || localDateKey(new Date()));

  if (actionId === ACTION_SNOOZE && routineItemId) {
    const at = new Date(Date.now() + 10 * 60 * 1_000);
    await plugin.schedule?.({
      notifications: [{
        ...event.notification,
        id: notificationId(routineItemId, localDate, `snooze:${at.getTime()}`),
        schedule: { at },
        extra: { ...extra, loopineKind: "routine-snooze" },
      }],
    });
    return;
  }

  if (actionId === ACTION_SKIP && routineItemId) {
    await cancelRoutineReminderOccurrence(routineItemId, localDate);
    await apiFetch(`/api/routines/items/${routineItemId}/skip`, {
      method: "POST",
      body: JSON.stringify({ study_date: localDate }),
    });
    window.dispatchEvent(new CustomEvent("loopine:routines-updated"));
    return;
  }

  openRoutineFromNotification(extra);
}

export async function initializeNativeReminderRuntime() {
  const plugin = localNotifications();
  if (!plugin) return false;
  await plugin.registerActionTypes?.({
    types: [{
      id: ACTION_TYPE_ID,
      actions: [
        { id: ACTION_START, title: "지금 시작", foreground: true },
        { id: ACTION_SNOOZE, title: "10분 뒤", foreground: true },
        { id: ACTION_SKIP, title: "오늘 건너뛰기", foreground: true },
      ],
    }],
  });
  if (!actionListener && plugin.addListener) {
    actionListener = await plugin.addListener("localNotificationActionPerformed", (event) => {
      void handleNotificationAction(event).catch(() => undefined);
    });
  }
  return true;
}

export async function syncNativeRoutineReminders(
  payload: RoutinePayload,
  options: { requestPermission?: boolean } = { requestPermission: true },
): Promise<"scheduled" | "denied" | "location-denied" | "unavailable"> {
  latestPayload = payload;
  const plugin = localNotifications();
  if (!plugin?.schedule || !plugin.cancel || !plugin.getPending) return "unavailable";
  await initializeNativeReminderRuntime();
  const permission = await notificationPermission(plugin, options.requestPermission !== false);
  if (permission !== "granted") return "denied";

  const smartSettings = getSmartReminderSettings();
  const triggered = new Set(Object.keys(smartSettings.triggered));
  const desired = buildRoutineReminderOccurrences(payload, new Date(), DEFAULT_HORIZON_DAYS, triggered);
  const pending = await plugin.getPending();
  const ownedPending = pending.notifications.filter((item) => item.extra?.loopineKind === "routine");
  const desiredIds = new Set(desired.map((item) => item.id));
  const pendingIds = new Set(ownedPending.map((item) => item.id));
  const stale = ownedPending.filter((item) => !desiredIds.has(item.id)).map((item) => ({ id: item.id }));
  if (stale.length) await plugin.cancel({ notifications: stale });

  const missing = desired
    .filter((item) => !pendingIds.has(item.id))
    .map(occurrenceNotification);
  if (missing.length) await plugin.schedule({ notifications: missing });

  const locationState = await configureSmartLocationMonitoring(payload);
  if (locationState === "denied") return "location-denied";
  return "scheduled";
}

export async function cancelRoutineReminderOccurrence(itemId: string, localDate = localDateKey(new Date())) {
  const plugin = localNotifications();
  if (!plugin?.getPending || !plugin.cancel) return;
  const pending = await plugin.getPending();
  const matches = pending.notifications
    .filter((notification) => (
      String(notification.extra?.routineItemId || "") === itemId
      && String(notification.extra?.localDate || "") === localDate
    ))
    .map((notification) => ({ id: notification.id }));
  if (matches.length) await plugin.cancel({ notifications: matches });
}

function haversineMeters(left: SmartPlace, right: NativeLocation) {
  const earthRadius = 6_371_000;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude))
    * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function evaluateSmartPlace(
  place: SmartPlace,
  location: NativeLocation,
  previous?: boolean,
) {
  const distanceMeters = haversineMeters(place, location);
  const enterBoundary = Math.max(35, place.radiusMeters - 20);
  const exitBoundary = place.radiusMeters + 50;
  const inside = previous === true ? distanceMeters <= exitBoundary : distanceMeters <= enterBoundary;
  const transition = previous === undefined || previous === inside
    ? undefined
    : inside ? "enter" as const : "exit" as const;
  return { inside, transition, distanceMeters };
}

function minutesFromRoutineTime(item: RoutineItem, now: Date) {
  const { hour, minute } = parseTime(item.start_time);
  const target = hour * 60 + minute;
  const current = now.getHours() * 60 + now.getMinutes();
  const absolute = Math.abs(target - current);
  return Math.min(absolute, 24 * 60 - absolute);
}

async function fireLocationTransition(transition: "enter" | "exit", placeId: string, now: Date) {
  const payload = latestPayload;
  const plugin = localNotifications();
  if (!payload || !plugin?.schedule) return;
  const settings = getSmartReminderSettings();
  const localDate = localDateKey(now);
  const weekday = loopineWeekday(now);
  const items = payload.plans.flatMap((plan) => plan.is_active ? plan.items : []);
  const place = settings.places[placeId];
  if (!place) return;

  for (const item of items) {
    const notification = normalizedNotification(item);
    const legacyMatch = notification.trigger === "home_exit" && placeId === "home" && transition === "exit"
      || notification.trigger === "work_enter" && placeId === "work" && transition === "enter"
      || notification.trigger === "work_exit" && placeId === "work" && transition === "exit";
    const placeMatch = notification.trigger === `place_${transition}` && notification.locationId === placeId;
    const triggerKey = `${item.id}:${localDate}:${notification.trigger}`;
    if (
      !item.is_active
      || !notification.enabled
      || (!legacyMatch && !placeMatch)
      || !item.days_of_week.includes(weekday)
      || settings.triggered[triggerKey]
      || minutesFromRoutineTime(item, now) > notification.locationWindowMinutes
    ) continue;

    await cancelRoutineReminderOccurrence(item.id, localDate);
    const locationBody = transition === "enter"
      ? `${place.name}에 도착했어요. 잠깐 오늘 표현을 확인해볼까요?`
      : `${place.name}에서 나온 지금, 오늘 학습 루프를 이어가볼까요?`;
    await plugin.schedule({
      notifications: [{
        id: notificationId(item.id, localDate, `location:${placeId}:${transition}`),
        title: notification.title,
        body: !item.notification.body || item.notification.body === "오늘 루틴을 이어갈 시간이에요."
          ? locationBody
          : item.notification.body,
        schedule: { at: new Date(Date.now() + 750) },
        actionTypeId: ACTION_TYPE_ID,
        extra: {
          loopineKind: "routine-location",
          schemaVersion: 1,
          routineId: item.routine_id,
          routineItemId: item.id,
          localDate,
          entrySource: "notification",
          locationTrigger: `place_${transition}`,
          locationId: place.id,
        },
      }],
    });
    settings.triggered[triggerKey] = Date.now();
  }
  saveSmartReminderSettings(settings);
}

async function processLocation(location: NativeLocation) {
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) return;
  if (location.accuracy != null && location.accuracy > 250) return;
  const settings = getSmartReminderSettings();
  if (!settings.enabled) return;
  const transitions: Array<{ transition: "enter" | "exit"; placeId: string }> = [];

  for (const [placeId, place] of Object.entries(settings.places)) {
    const previous = settings.inside[placeId];
    const result = evaluateSmartPlace(place, location, previous);
    settings.inside[placeId] = result.inside;
    if (result.transition) transitions.push({ transition: result.transition, placeId });
  }

  saveSmartReminderSettings(settings);
  for (const event of transitions) await fireLocationTransition(event.transition, event.placeId, new Date());
}

async function removeStoredWatcher(plugin: NativeBackgroundGeolocation) {
  const stored = activeWatcherId || (typeof window !== "undefined" ? window.localStorage.getItem(WATCHER_KEY) : null);
  if (!stored || !plugin.removeWatcher) return;
  try {
    await Promise.resolve(plugin.removeWatcher({ id: stored }));
  } catch {
    // A stale watcher id is harmless. Clear it and recreate the watcher below.
  }
  activeWatcherId = null;
  window.localStorage.removeItem(WATCHER_KEY);
}

export async function configureSmartLocationMonitoring(payload?: RoutinePayload) {
  if (payload) latestPayload = payload;
  const settings = getSmartReminderSettings();
  const plugin = backgroundGeolocation();
  if (!plugin?.addWatcher || !plugin.removeWatcher) return "unavailable" as const;
  if (!settings.enabled || Object.keys(settings.places).length === 0) {
    await removeStoredWatcher(plugin);
    return "disabled" as const;
  }
  if (activeWatcherId) return "monitoring" as const;

  await removeStoredWatcher(plugin);
  try {
    const watcherId = await Promise.resolve(plugin.addWatcher({
      backgroundTitle: "Loopine 스마트 루틴",
      backgroundMessage: "출퇴근 루틴을 감지하기 위해 위치를 확인하고 있어요.",
      requestPermissions: true,
      stale: false,
      distanceFilter: 75,
    }, (location, error) => {
      if (error) {
        window.dispatchEvent(new CustomEvent("loopine:smart-reminder-error", { detail: error }));
        return;
      }
      if (location) void processLocation(location);
    }));
    if (!watcherId) throw new Error("위치 감시를 시작하지 못했습니다. 앱을 다시 실행해주세요.");
    activeWatcherId = watcherId;
    window.localStorage.setItem(WATCHER_KEY, activeWatcherId);
    return "monitoring" as const;
  } catch (caught) {
    window.dispatchEvent(new CustomEvent("loopine:smart-reminder-error", { detail: caught }));
    return "denied" as const;
  }
}

export async function stopSmartLocationMonitoring() {
  const plugin = backgroundGeolocation();
  if (plugin) await removeStoredWatcher(plugin);
}

function currentLocation(): Promise<NativeLocation> {
  const plugin = backgroundGeolocation();
  if (!plugin?.addWatcher || !plugin.removeWatcher) {
    return Promise.reject(new Error("위치 기능은 Loopine 모바일 앱에서 사용할 수 있습니다."));
  }
  return new Promise((resolve, reject) => {
    let watcherId = "";
    let settled = false;
    const removeWatcher = () => {
      if (!watcherId) return;
      try {
        void Promise.resolve(plugin.removeWatcher?.({ id: watcherId })).catch(() => undefined);
      } catch {
        // The native bridge can throw synchronously while the WebView is closing.
      }
    };
    const timeout = window.setTimeout(() => {
      settled = true;
      removeWatcher();
      reject(new Error("현재 위치를 확인하지 못했습니다. 위치 권한과 GPS를 확인해주세요."));
    }, 15_000);

    let watcherResult: Promise<string> | string | undefined;
    try {
      watcherResult = plugin.addWatcher?.({ requestPermissions: true, stale: false, distanceFilter: 0 }, (location, error) => {
        if (settled) return;
        if (error) {
          settled = true;
          window.clearTimeout(timeout);
          removeWatcher();
          reject(new Error(error.message || "위치 권한을 확인해주세요."));
          return;
        }
        if (!location || (location.accuracy != null && location.accuracy > 200)) return;
        settled = true;
        window.clearTimeout(timeout);
        removeWatcher();
        resolve(location);
      });
    } catch (error) {
      window.clearTimeout(timeout);
      reject(error);
      return;
    }
    Promise.resolve(watcherResult).then((id) => {
      if (id) {
        watcherId = id;
        if (settled) removeWatcher();
      }
    }).catch((error) => {
      window.clearTimeout(timeout);
      reject(error);
    });
  });
}

function newPlaceId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `place-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function savePlaceCoordinates(input: {
  id?: string;
  name: string;
  addressLabel?: string;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
}) {
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw new Error("선택한 위치 좌표가 올바르지 않습니다.");
  }
  const settings = getSmartReminderSettings();
  const id = input.id || newPlaceId();
  settings.places[id] = {
    id,
    name: input.name.trim() || "새 장소",
    addressLabel: input.addressLabel?.trim() || undefined,
    latitude: Math.max(-90, Math.min(90, input.latitude)),
    longitude: Math.max(-180, Math.min(180, input.longitude)),
    radiusMeters: Math.max(80, Math.min(2_000, Number(input.radiusMeters) || 500)),
    updatedAt: new Date().toISOString(),
  };
  delete settings.inside[id];
  saveSmartReminderSettings(settings);
  return settings;
}

export async function saveCurrentLocationAsPlace(input: {
  id?: string;
  name: string;
  addressLabel?: string;
  radiusMeters?: number;
}) {
  const location = await currentLocation();
  const id = input.id || newPlaceId();
  const settings = savePlaceCoordinates({ ...input, id, latitude: location.latitude, longitude: location.longitude });
  settings.inside[id] = true;
  saveSmartReminderSettings(settings);
  return settings;
}

export function updateSmartPlace(id: string, patch: Pick<SmartPlace, "name" | "addressLabel" | "radiusMeters">) {
  const settings = getSmartReminderSettings();
  const place = settings.places[id];
  if (!place) return settings;
  settings.places[id] = {
    ...place,
    name: patch.name.trim() || place.name,
    addressLabel: patch.addressLabel?.trim() || undefined,
    radiusMeters: Math.max(80, Math.min(2_000, Number(patch.radiusMeters) || 500)),
    updatedAt: new Date().toISOString(),
  };
  saveSmartReminderSettings(settings);
  return settings;
}

export function removeSmartPlace(id: string) {
  const settings = getSmartReminderSettings();
  delete settings.places[id];
  delete settings.inside[id];
  saveSmartReminderSettings(settings);
  return settings;
}

export async function openNativeLocationSettings() {
  await backgroundGeolocation()?.openSettings?.();
}
