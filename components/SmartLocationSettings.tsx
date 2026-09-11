"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { fetchRoutines } from "@/lib/routines";
import type { RoutinePayload } from "@/lib/types";
import {
  configureSmartLocationMonitoring,
  getSmartLocationDiagnostics,
  getSmartReminderSettings,
  openNativePermissionSettings,
  requestNativeNotificationPermission,
  removeSmartPlace,
  saveCurrentLocationAsPlace,
  savePlaceCoordinates,
  saveSmartReminderSettings,
  stopSmartLocationMonitoring,
  syncNativeRoutineReminders,
  updateSmartPlace,
  type SmartPlace,
  type SmartLocationDiagnostics,
  type SmartReminderSettings,
} from "@/lib/nativeReminders";
import { presentNativePlacePicker, type NativePlacePickerSelection as MapPlaceSelection } from "@/lib/nativePlacePicker";
import { useBodyScrollLock, useMobileUi, usePortalReady } from "@/lib/useMobileUi";
import { MapPlacePicker } from "./MapPlacePicker";

type Props = {
  payload?: RoutinePayload;
  variant?: "full" | "teaser";
};

type MapDraft = {
  id?: string;
  name: string;
  addressLabel?: string;
  radiusMeters: number;
  latitude?: number;
  longitude?: number;
};

type PermissionIssue = "notification" | "location" | null;

const NAME_PRESETS = ["집", "회사", "헬스장", "본가", "학교", "스터디룸"];
const RADIUS_PRESETS = [100, 300, 500, 1000, 2000];
const PERMISSION_ISSUE_KEY = "loopine:smart-reminder-permission-issue:v1";

function readPermissionIssue(): PermissionIssue {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(PERMISSION_ISSUE_KEY);
  return value === "notification" || value === "location" ? value : null;
}

function friendlyError(caught: unknown) {
  const raw = caught instanceof Error ? caught.message : String(caught || "");
  if (/permission|denied|권한/i.test(raw)) return "위치 권한이 필요합니다. 기기 설정에서 Loopine의 위치 권한을 ‘항상 허용’으로 바꿔주세요.";
  if (/timeout|시간|GPS|location/i.test(raw)) return "현재 위치를 확인하지 못했습니다. GPS를 켜고 잠시 후 다시 시도해주세요.";
  if (/then is not a function|addWatcher|removeWatcher|plugin\./i.test(raw)) return "위치 기능 연결을 다시 준비했습니다. 앱을 완전히 종료한 뒤 다시 실행해주세요.";
  return "현재 위치를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function diagnosticStateLabel(diagnostics: SmartLocationDiagnostics, enabled: boolean) {
  if (!enabled || diagnostics.state === "disabled") return "감지 꺼짐";
  if (diagnostics.state === "monitoring") return diagnostics.mode === "geofence" ? "위치 감지 정상" : "위치 감지 정상";
  if (diagnostics.state === "starting") return "위치 감지 시작 중";
  if (diagnostics.state === "denied") return "위치 권한 필요";
  if (diagnostics.state === "unavailable") return "위치 감지 사용 불가";
  if (diagnostics.state === "error") return "위치 감지 오류";
  return "위치 감지 대기 중";
}

function relativeDiagnosticTime(value?: string) {
  if (!value) return "아직 없음";
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (elapsed < 60_000) return "방금 전";
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}분 전`;
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))}시간 전`;
  return `${Math.floor(elapsed / (24 * 60 * 60_000))}일 전`;
}

export function SmartLocationSettings({ payload: initialPayload, variant = "full" }: Props) {
  const { native } = useMobileUi();
  const portalReady = usePortalReady();
  const [settings, setSettings] = useState<SmartReminderSettings>(() => getSmartReminderSettings());
  const [diagnostics, setDiagnostics] = useState<SmartLocationDiagnostics>(() => getSmartLocationDiagnostics());
  const [initiallyEnabled] = useState(() => getSmartReminderSettings().enabled && readPermissionIssue() !== "notification");
  const [payload, setPayload] = useState<RoutinePayload | undefined>(initialPayload);
  const [expanded, setExpanded] = useState(variant === "full");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [permissionIssue, setPermissionIssueState] = useState<PermissionIssue>(readPermissionIssue);
  const [permissionDialog, setPermissionDialog] = useState<PermissionIssue>(null);
  const [permissionSettingsOpened, setPermissionSettingsOpened] = useState(false);
  const [activationPending, setActivationPending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [mapDraft, setMapDraft] = useState<MapDraft | null>(null);
  const [editingPlace, setEditingPlace] = useState<SmartPlace | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SmartPlace | null>(null);
  const retryPermissionRef = useRef<() => void>(() => undefined);
  const leftForSystemSettingsRef = useRef(false);

  useBodyScrollLock(Boolean(adding || editingPlace || deleteTarget || permissionDialog));

  const places = useMemo(() => Object.values(settings.places).sort((a, b) => a.name.localeCompare(b.name, "ko")), [settings]);
  const isActive = settings.enabled && permissionIssue === null;

  useEffect(() => {
    if (!native) return;
    if (initialPayload) setPayload(initialPayload);
  }, [initialPayload, native]);

  useEffect(() => {
    if (!native) return;
    if (payload) return;
    void fetchRoutines().then(setPayload).catch(() => undefined);
  }, [native, payload]);

  useEffect(() => {
    if (!native) return;
    const refresh = () => setSettings(getSmartReminderSettings());
    window.addEventListener("loopine:smart-reminders-updated", refresh);
    return () => window.removeEventListener("loopine:smart-reminders-updated", refresh);
  }, [native]);

  useEffect(() => {
    if (!native) return;
    const refresh = () => setDiagnostics(getSmartLocationDiagnostics());
    window.addEventListener("loopine:smart-location-diagnostics-updated", refresh);
    return () => window.removeEventListener("loopine:smart-location-diagnostics-updated", refresh);
  }, [native]);

  useEffect(() => {
    if (!native) return;
    const handleLocationError = (event: Event) => {
      const detail = (event as CustomEvent<{ code?: string; message?: string }>).detail;
      if (!/NOT_AUTHORIZED|permission|denied/i.test(`${detail?.code || ""} ${detail?.message || ""}`)) return;
      setPermissionIssueState("location");
      window.localStorage.setItem(PERMISSION_ISSUE_KEY, "location");
      setPermissionSettingsOpened(false);
      setPermissionDialog("location");
      setStatus("위치 권한이 꺼져 있어 스마트 알림을 시작하지 못했습니다.");
    };
    window.addEventListener("loopine:smart-reminder-error", handleLocationError);
    return () => window.removeEventListener("loopine:smart-reminder-error", handleLocationError);
  }, [native]);

  useEffect(() => {
    if (!deleteTarget) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeleteTarget(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteTarget]);

  async function refreshMonitoring(next: SmartReminderSettings) {
    if (!next.enabled || !payload) return;
    await configureSmartLocationMonitoring(payload);
  }

  function setPermissionIssue(issue: PermissionIssue) {
    setPermissionIssueState(issue);
    if (issue) window.localStorage.setItem(PERMISSION_ISSUE_KEY, issue);
    else window.localStorage.removeItem(PERMISSION_ISSUE_KEY);
  }

  async function toggleEnabled() {
    if (!native) {
      setExpanded(true);
      setStatus("스마트 위치 알림은 Loopine iOS·Android 앱에서 사용할 수 있어요.");
      return;
    }
    setBusy("toggle");
    try {
      if (isActive) {
        setActivationPending(false);
        const next = { ...settings, enabled: false };
        setSettings(next);
        saveSmartReminderSettings(next);
        await stopSmartLocationMonitoring();
        setPermissionIssue(null);
        setStatus("스마트 위치 알림을 껐어요. 시간 알림은 그대로 유지됩니다.");
        return;
      }

      setExpanded(true);
      if (!payload) throw new Error("루틴 정보를 불러오는 중입니다.");

      const notificationState = await requestNativeNotificationPermission(true);
      if (notificationState !== "granted") {
        setActivationPending(false);
        const disabled = { ...settings, enabled: false };
        setSettings(disabled);
        saveSmartReminderSettings(disabled);
        setPermissionIssue("notification");
        setPermissionDialog("notification");
        setStatus(notificationState === "unavailable" ? "알림 기능을 사용할 수 없습니다." : "알림 권한이 필요합니다.");
        return;
      }

      if (places.length === 0) {
        const disabled = { ...settings, enabled: false };
        setSettings(disabled);
        saveSmartReminderSettings(disabled);
        setPermissionIssue(null);
        setPermissionSettingsOpened(false);
        setActivationPending(true);
        setAdding(true);
        setStatus("알림 권한을 확인했어요. 이제 알림에 사용할 장소를 추가해주세요.");
        return;
      }

      const next = { ...settings, enabled: true };
      setSettings(next);
      saveSmartReminderSettings(next);
      setPermissionIssue(null);
      const result = await syncNativeRoutineReminders(payload, { requestPermission: false });
      if (result === "scheduled") {
        setPermissionIssue(null);
        setPermissionSettingsOpened(false);
        setStatus("스마트 위치 알림을 켰어요. 좌표는 이 기기 안에서만 사용됩니다.");
      } else if (result === "location-denied") {
        setPermissionIssue("location");
        setPermissionDialog("location");
        setStatus("시간 알림은 준비됐지만 위치 권한이 필요합니다.");
      } else if (result === "denied") {
        const disabled = { ...next, enabled: false };
        setSettings(disabled);
        saveSmartReminderSettings(disabled);
        setPermissionIssue("notification");
        setPermissionDialog("notification");
        setStatus("알림 권한이 필요합니다.");
      } else {
        setStatus("모바일 앱을 최신 빌드로 업데이트한 뒤 다시 시도해주세요.");
      }
    } catch (caught) {
      setStatus(friendlyError(caught));
    } finally {
      setBusy("");
    }
  }

  async function retryPermissions() {
    if (!payload) {
      setStatus("루틴 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setBusy("permission");
    setStatus(`${permissionIssue === "location" ? "위치" : "알림"} 권한을 다시 확인하고 있어요…`);
    try {
      let nextSettings = settings;
      if (permissionIssue === "notification" || !settings.enabled) {
        const notificationState = await requestNativeNotificationPermission(false);
        if (notificationState !== "granted") {
          setActivationPending(false);
          const disabled = { ...settings, enabled: false };
          setSettings(disabled);
          saveSmartReminderSettings(disabled);
          setPermissionIssue("notification");
          setPermissionSettingsOpened(false);
          setPermissionDialog("notification");
          setStatus("알림 권한이 아직 허용되지 않았습니다.");
          return;
        }
        if (places.length === 0) {
          const disabled = { ...settings, enabled: false };
          setSettings(disabled);
          saveSmartReminderSettings(disabled);
          setPermissionIssue(null);
          setPermissionSettingsOpened(false);
          setPermissionDialog(null);
          setActivationPending(true);
          setAdding(true);
          setStatus("알림 권한을 확인했어요. 이제 알림에 사용할 장소를 추가해주세요.");
          return;
        }
        nextSettings = { ...settings, enabled: true };
        setSettings(nextSettings);
        saveSmartReminderSettings(nextSettings);
        setPermissionIssue(null);
      }

      const result = await syncNativeRoutineReminders(payload, { requestPermission: false });
      if (result === "scheduled") {
        setPermissionIssue(null);
        setPermissionSettingsOpened(false);
        setStatus("권한을 확인했고 스마트 위치 알림을 다시 준비했어요.");
        return;
      }

      const issue: PermissionIssue = result === "denied" ? "notification" : result === "location-denied" ? "location" : permissionIssue;
      if (issue === "notification") {
        const disabled = { ...nextSettings, enabled: false };
        setSettings(disabled);
        saveSmartReminderSettings(disabled);
      }
      setPermissionIssue(issue);
      setPermissionSettingsOpened(false);
      setPermissionDialog(issue);
      setStatus(`${issue === "location" ? "위치" : "알림"} 권한이 아직 허용되지 않았습니다.`);
    } catch (caught) {
      setStatus(friendlyError(caught));
    } finally {
      setBusy("");
    }
  }

  async function openPermissionSettings() {
    if (!permissionDialog) return;
    const issue = permissionDialog;
    setBusy("permission-settings");
    try {
      // Once denied, iOS does not allow an app to display the system permission prompt again.
      // The native shell routes notification settings directly where the OS supports it.
      setPermissionSettingsOpened(true);
      leftForSystemSettingsRef.current = false;
      const opened = await openNativePermissionSettings(issue);
      if (!opened) throw new Error("설정 화면을 열 수 없습니다.");
      setPermissionDialog(null);
      setStatus(`기기 설정에서 Loopine의 ${issue === "location" ? "위치" : "알림"} 권한을 허용한 뒤 돌아와 적용 여부를 확인해주세요.`);
    } catch {
      setPermissionSettingsOpened(false);
      setStatus("기기 설정을 열지 못했습니다. 설정 앱에서 Loopine 권한을 직접 변경해주세요.");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    retryPermissionRef.current = () => void retryPermissions();
  });

  useEffect(() => {
    if (!native || !permissionSettingsOpened) return;
    let timer = 0;
    let checking = false;
    const markLeftApp = () => {
      if (document.visibilityState === "hidden") leftForSystemSettingsRef.current = true;
    };
    const verifyOnReturn = () => {
      if (document.visibilityState === "hidden" || checking) return;
      // Native shells also emit this event. For browsers, require a real hidden -> visible
      // transition so opening the dialog itself does not immediately retry the permission.
      if (!leftForSystemSettingsRef.current) return;
      checking = true;
      leftForSystemSettingsRef.current = false;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        retryPermissionRef.current();
      }, 350);
    };
    const verifyAfterNativeResume = () => {
      leftForSystemSettingsRef.current = true;
      verifyOnReturn();
    };
    document.addEventListener("visibilitychange", markLeftApp);
    document.addEventListener("visibilitychange", verifyOnReturn);
    window.addEventListener("loopine:native-app-resumed", verifyAfterNativeResume);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", markLeftApp);
      document.removeEventListener("visibilitychange", verifyOnReturn);
      window.removeEventListener("loopine:native-app-resumed", verifyAfterNativeResume);
    };
  }, [native, permissionSettingsOpened]);

  async function finishPlaceSave(next: SmartReminderSettings, savedMessage: string) {
    setSettings(next);
    setAdding(false);

    if (!activationPending) {
      await refreshMonitoring(next);
      setStatus(savedMessage);
      return;
    }

    if (!payload) {
      setActivationPending(false);
      setStatus(`${savedMessage} 루틴 정보를 불러온 뒤 ‘사용하기’를 눌러주세요.`);
      return;
    }

    const enabled = { ...next, enabled: true };
    setSettings(enabled);
    saveSmartReminderSettings(enabled);
    setActivationPending(false);
    setPermissionIssue(null);

    const result = await syncNativeRoutineReminders(payload, { requestPermission: false });
    if (result === "scheduled") {
      setPermissionSettingsOpened(false);
      setStatus(`${savedMessage} 스마트 위치 알림도 바로 켰어요.`);
      window.dispatchEvent(new CustomEvent("loopine:open-routine-notification-guide"));
      return;
    }
    if (result === "location-denied") {
      setPermissionIssue("location");
      setPermissionDialog("location");
      setStatus(`${savedMessage} 위치 권한을 허용하면 스마트 알림이 시작됩니다.`);
      return;
    }

    const disabled = { ...enabled, enabled: false };
    setSettings(disabled);
    saveSmartReminderSettings(disabled);
    if (result === "denied") {
      setPermissionIssue("notification");
      setPermissionDialog("notification");
      setStatus(`${savedMessage} 알림 권한을 다시 확인해주세요.`);
    } else {
      setStatus(`${savedMessage} 모바일 앱을 최신 빌드로 업데이트한 뒤 다시 시도해주세요.`);
    }
  }

  async function capture(input: { id?: string; name: string; addressLabel?: string; radiusMeters: number }) {
    if (permissionIssue === "location" && !permissionSettingsOpened) {
      setPermissionDialog("location");
      return;
    }
    const key = input.id ? `capture:${input.id}` : "add";
    setBusy(key);
    setStatus("현재 위치를 확인하고 있어요…");
    try {
      const next = await saveCurrentLocationAsPlace(input);
      if (editingPlace && input.id && editingPlace.id === input.id) {
        setEditingPlace(next.places[input.id] ?? null);
      }
      await finishPlaceSave(next, `${input.name.trim() || "새 장소"}을(를) 반경 ${input.radiusMeters || 500}m로 저장했어요.`);
    } catch (caught) {
      if (/permission|denied|권한/i.test(caught instanceof Error ? caught.message : String(caught || ""))) {
        setPermissionIssue("location");
        setPermissionSettingsOpened(false);
        setPermissionDialog("location");
      }
      setStatus(friendlyError(caught));
    } finally {
      setBusy("");
    }
  }

  function updatePlace(id: string, patch: Pick<SmartPlace, "name" | "addressLabel" | "radiusMeters">) {
    const next = updateSmartPlace(id, patch);
    setSettings(next);
    if (editingPlace && editingPlace.id === id) {
      setEditingPlace(next.places[id] ?? null);
    }
    setStatus(`${patch.name} 장소 설정을 저장했어요.`);
    void refreshMonitoring(next);
  }

  function confirmDelete(place: SmartPlace) {
    setDeleteTarget(null);
    if (editingPlace?.id === place.id) {
      setEditingPlace(null);
    }
    const next = removeSmartPlace(place.id);
    setSettings(next);
    setStatus(`${place.name} 장소를 삭제했어요.`);
    void refreshMonitoring(next);
  }

  function selectMapLocation(selection: MapPlaceSelection) {
    if (!mapDraft) return;
    try {
      const next = savePlaceCoordinates({ ...mapDraft, ...selection });
      setMapDraft(null);
      if (editingPlace && mapDraft.id && editingPlace.id === mapDraft.id) {
        setEditingPlace(next.places[mapDraft.id] ?? null);
      }
      void finishPlaceSave(next, `${mapDraft.name.trim() || "새 장소"} 위치를 지도에서 저장했어요.`);
    } catch (caught) {
      setStatus(friendlyError(caught));
    }
  }

  async function openMapPicker(draft: MapDraft) {
    if (native) {
      const result = await presentNativePlacePicker(draft);
      if (result && result !== "unavailable") {
        selectMapLocationForDraft(draft, result);
        return;
      }
      if (result === null) return;
    }
    setMapDraft(draft);
  }

  function selectMapLocationForDraft(draft: MapDraft, selection: MapPlaceSelection) {
    try {
      const next = savePlaceCoordinates({ ...draft, ...selection });
      setMapDraft(null);
      if (editingPlace && draft.id && editingPlace.id === draft.id) {
        setEditingPlace(next.places[draft.id] ?? null);
      }
      void finishPlaceSave(next, `${draft.name.trim() || "새 장소"} 위치를 지도에서 저장했어요.`);
    } catch (caught) {
      setStatus(friendlyError(caught));
    }
  }

  // Geofencing is intentionally hidden outside the Capacitor iOS/Android shell.
  // Desktop/mobile browsers and installed PWAs do not run the native location monitor.
  if (!native) return null;
  if (variant === "teaser" && initiallyEnabled && isActive) return null;

  return (
    <section className={`smart-location-settings ${variant}`} aria-labelledby={`smart-location-title-${variant}`}>
      <button
        type="button"
        className="smart-location-summary"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        <span className="smart-location-summary-icon"><LocateFixed size={19} /></span>
        <span>
          <small>SMART REMINDER</small>
          <strong
            id={`smart-location-title-${variant}`}
            key={isActive ? "enabled" : "disabled"}
            className={`smart-location-title ${isActive ? "enabled" : "disabled"}`}
          >
            {isActive ? "스마트 위치 알림 사용 중" : "출퇴근 위치로 알림 받기"}
            {isActive && <span className="smart-location-active-badge" aria-hidden="true" />}
          </strong>
          <em>{places.length ? `${places.length}개 장소 · 기기에서만 위치 판정` : "집·회사 등 장소를 등록해보세요"}</em>
        </span>
        <span className="smart-location-summary-action"><ChevronDown size={18} /></span>
      </button>

      <div className={`smart-location-accordion-collapse ${expanded ? "expanded" : ""}`}>
        <div className="smart-location-accordion-inner">
          <div className="smart-location-details">
            <div className="smart-location-intro">
              <p>장소에 들어오거나 나가는 순간을 감지해 연결된 루틴을 알려드려요. 저장한 주소 메모와 정확한 좌표는 Loopine 서버에 전송하지 않습니다.</p>
              <button type="button" className={isActive ? "active" : ""} onClick={() => void toggleEnabled()} disabled={Boolean(busy)}>
                {busy === "toggle" && <LoaderCircle className="spin" size={15} />}
                {isActive ? "사용 중 · 끄기" : "사용하기"}
              </button>
            </div>

            <div className="smart-place-list">
              {places.map((place) => (
                <SmartPlaceCard
                  key={place.id}
                  place={place}
                  busy={busy}
                  onEdit={() => setEditingPlace(place)}
                  onRecapture={() => void capture({ id: place.id, name: place.name, addressLabel: place.addressLabel, radiusMeters: place.radiusMeters })}
                  onMapPick={() => void openMapPicker({ id: place.id, name: place.name, addressLabel: place.addressLabel, radiusMeters: place.radiusMeters, latitude: place.latitude, longitude: place.longitude })}
                  onDelete={() => setDeleteTarget(place)}
                />
              ))}
              {!places.length && <p className="smart-place-empty"><MapPin size={18} /> 아직 등록된 장소가 없어요.</p>}
            </div>

            <button type="button" className="smart-place-add" onClick={() => setAdding(true)}>
              <Plus size={16} /> 장소 추가
            </button>

            <p className="smart-location-privacy"><ShieldCheck size={15} /> 장소별 기본 반경은 500m이며 80~2,000m 사이에서 조정할 수 있습니다.</p>
            <details className="smart-location-diagnostics">
              <summary>
                <span className={`smart-location-diagnostic-dot ${diagnostics.state}`} aria-hidden="true" />
                <strong>{diagnosticStateLabel(diagnostics, isActive)}</strong>
                <small>
                  {diagnostics.mode === "geofence"
                    ? `마지막 경계 이벤트 ${relativeDiagnosticTime(diagnostics.lastEventAt)}`
                    : `마지막 유효 위치 ${relativeDiagnosticTime(diagnostics.lastAcceptedAt)}`}
                </small>
              </summary>
              <div>
                {diagnostics.mode === "geofence" ? (
                  <>
                    <p>등록된 감지 영역 {diagnostics.registeredCount ?? 0}개</p>
                    {diagnostics.lastTransition && (
                      <p>
                        마지막 이벤트: {places.find((place) => place.id === diagnostics.lastPlaceId)?.name || "등록 장소"}
                        {diagnostics.lastTransition === "enter" ? " 진입" : " 이탈"}
                      </p>
                    )}
                    {!diagnostics.lastTransition && diagnostics.initialState && (
                      <p>초기 장소 상태: {diagnostics.initialState === "inside" ? "반경 내부" : diagnostics.initialState === "outside" ? "반경 밖" : "확인 중"}</p>
                    )}
                    {diagnostics.lastIgnoredReason && <p>마지막 처리: {diagnostics.lastIgnoredReason}</p>}
                    {diagnostics.lastError && <p className="warning">{diagnostics.lastError}</p>}
                    <small>좌표를 계속 조회하지 않고, iOS·Android가 등록 장소의 진입·이탈만 알려줍니다.</small>
                  </>
                ) : (
                  <>
                    <p>
                      마지막 수신 {relativeDiagnosticTime(diagnostics.lastSampleAt)}
                      {diagnostics.lastAccuracyMeters != null ? ` · 정확도 약 ${Math.round(diagnostics.lastAccuracyMeters)}m` : ""}
                    </p>
                    {diagnostics.lastIgnoredReason && <p className="warning">{diagnostics.lastIgnoredReason}</p>}
                    {diagnostics.lastError && <p className="warning">{diagnostics.lastError}</p>}
                  </>
                )}
              </div>
            </details>
            {status && <p className="smart-location-status" role="status">{status}</p>}
            {/* {permissionIssue && (
              <button
                type="button"
                className="smart-permission-retry"
                onClick={() => permissionSettingsOpened ? void retryPermissions() : setPermissionDialog(permissionIssue)}
                disabled={Boolean(busy)}
              >
                {busy === "permission" ? <LoaderCircle className="spin" size={16} /> : <Settings2 size={16} />}
                {busy === "permission" ? "권한 확인 중…" : permissionSettingsOpened ? "권한 적용 확인" : "권한 다시 요청"}
              </button>
            )} */}
          </div>
        </div>
      </div>

      {mapDraft && <MapPlacePicker initial={mapDraft} onClose={() => setMapDraft(null)} onSelect={selectMapLocation} />}

      {adding && portalReady && createPortal(
        <SmartPlaceAddModal
          busy={busy}
          onClose={() => { setAdding(false); setActivationPending(false); }}
          onCapture={(draft) => void capture(draft)}
          onMapPick={(draft) => void openMapPicker(draft)}
        />,
        document.body
      )}

      {editingPlace && portalReady && createPortal(
        <SmartPlaceEditModal
          place={editingPlace}
          busy={busy}
          onClose={() => setEditingPlace(null)}
          onSave={(patch) => updatePlace(editingPlace.id, patch)}
          onRecapture={(patch) => void capture({ id: editingPlace.id, ...patch })}
          onMapPick={(draft) => void openMapPicker(draft)}
          onDelete={() => {
            const target = editingPlace;
            setEditingPlace(null);
            setDeleteTarget(target);
          }}
        />,
        document.body
      )}

      {deleteTarget && portalReady && createPortal(
        <div
          className="confirm-modal-layer place-delete-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setDeleteTarget(null)}
        >
          <section className="confirm-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="place-delete-title">
            <TriangleAlert size={24} />
            <h3 id="place-delete-title">‘{deleteTarget.name}’ 장소를 삭제할까요?</h3>
            <p>이 장소를 사용하는 루틴은 시간 알림으로만 동작할 수 있어요.</p>
            <div>
              <button
                type="button"
                className="secondary-button"
                style={{ border: "1px solid #ffffffb3" }}
                onClick={() => setDeleteTarget(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="primary-button danger-action"
                onClick={() => confirmDelete(deleteTarget)}
              >
                <Trash2 size={17} /> 삭제
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}

      {permissionDialog && portalReady && createPortal(
        <div
          className="confirm-modal-layer permission-recovery-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setPermissionDialog(null)}
        >
          <section className="permission-recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="permission-recovery-title">
            <span className="permission-recovery-icon">
              {permissionDialog === "location" ? <LocateFixed size={25} /> : <Settings2 size={25} />}
            </span>
            <p className="eyebrow">PERMISSION REQUIRED</p>
            <h3 id="permission-recovery-title">
              {permissionDialog === "location" ? "위치 권한이 필요해요" : "알림 권한이 필요해요"}
            </h3>
            <p>
              {permissionDialog === "location"
                ? "등록한 장소의 도착·이탈을 기기에서 감지하려면 Loopine 위치 권한을 ‘항상 허용’으로 변경해주세요."
                : "정해둔 시간과 장소에서 학습 루틴을 알려드리려면 Loopine 알림 권한을 허용해주세요."}
            </p>
            <small>처음 거부한 권한은 앱에서 같은 시스템 팝업을 다시 띄울 수 없어 기기 설정에서 변경해야 합니다.</small>
            <small className="permission-recovery-path">
              {permissionDialog === "location"
                ? "설정 화면에서 ‘위치’ → ‘항상’을 선택한 뒤 Loopine으로 돌아오세요."
                : "알림 설정 화면에서 ‘알림 허용’을 켠 뒤 Loopine으로 돌아오세요."}
            </small>
            <div className="permission-recovery-actions">
              <button type="button" className="secondary-button" onClick={() => setPermissionDialog(null)}>취소</button>
              <button type="button" className="primary-button" onClick={() => void openPermissionSettings()} disabled={Boolean(busy)}>
                {busy === "permission-settings" ? <LoaderCircle className="spin" size={16} /> : <Settings2 size={16} />}
                권한 요청
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}
    </section>
  );
}

function SmartPlaceCard({
  place,
  busy,
  onEdit,
  onRecapture,
  onMapPick,
  onDelete,
}: {
  place: SmartPlace;
  busy: string;
  onEdit: () => void;
  onRecapture: () => void;
  onMapPick: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="smart-place-card">
      <span className="smart-place-icon"><MapPin size={18} /></span>
      <div className="smart-place-copy">
        <strong>{place.name}</strong>
        <small>{place.addressLabel || "현재 위치 좌표로 등록됨"}</small>
        <em>반경 {place.radiusMeters}m</em>
      </div>
      <div className="smart-place-actions">
        <button type="button" onClick={onEdit} aria-label={`${place.name} 수정`}>
          <Pencil size={14} /> 수정
        </button>
        <button type="button" onClick={onMapPick}>
          <MapPin size={14} /> 지도
        </button>
        <button type="button" disabled={Boolean(busy)} onClick={onRecapture}>
          {busy === `capture:${place.id}` ? <LoaderCircle className="spin" size={14} /> : "현재 위치로"}
        </button>
        <button type="button" className="danger" onClick={onDelete} aria-label={`${place.name} 삭제`}>
          <Trash2 size={15} />
        </button>
      </div>
    </article>
  );
}

function SmartPlaceEditModal({
  place,
  busy,
  onClose,
  onSave,
  onRecapture,
  onMapPick,
  onDelete,
}: {
  place: SmartPlace;
  busy: string;
  onClose: () => void;
  onSave: (patch: Pick<SmartPlace, "name" | "addressLabel" | "radiusMeters">) => void;
  onRecapture: (patch: Pick<SmartPlace, "name" | "addressLabel" | "radiusMeters">) => void;
  onMapPick: (draft: MapDraft) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(place.name);
  const [addressLabel, setAddressLabel] = useState(place.addressLabel || "");
  const [radiusMeters, setRadiusMeters] = useState(place.radiusMeters || 500);

  useEffect(() => {
    setName(place.name);
    setAddressLabel(place.addressLabel || "");
    setRadiusMeters(place.radiusMeters || 500);
  }, [place]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const patch = {
    name: name.trim(),
    addressLabel: addressLabel.trim() || undefined,
    radiusMeters: Number(radiusMeters) || 500,
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(patch);
    onClose();
  };

  return (
    <div
      className="smart-place-modal-layer"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="smart-place-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-place-modal-title"
      >
        <header className="smart-place-modal-header">
          <div>
            <p>SMART LOCATION</p>
            <h2 id="smart-place-modal-title">‘{place.name}’ 장소 수정</h2>
          </div>
          <button
            type="button"
            className="smart-place-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </header>

        <div className="smart-place-modal-body">
          <div className="smart-place-modal-field">
            <label htmlFor="edit-place-name">장소 이름</label>
            <input
              id="edit-place-name"
              className="smart-place-modal-input"
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 집, 회사, 헬스장"
            />
            <div className="smart-place-chips" aria-label="추천 장소 이름">
              {NAME_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`smart-place-chip ${name === preset ? "active" : ""}`}
                  onClick={() => setName(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="smart-place-modal-field">
            <label htmlFor="edit-place-address">주소 또는 메모 (선택)</label>
            <input
              id="edit-place-address"
              className="smart-place-modal-input"
              value={addressLabel}
              maxLength={100}
              onChange={(e) => setAddressLabel(e.target.value)}
              placeholder="예: 성수동 사무실, 101동"
            />
          </div>

          <div className="smart-place-modal-field">
            <label htmlFor="edit-place-radius">감지 반경 (m)</label>
            <div className="smart-place-radius-row">
              <input
                id="edit-place-radius"
                type="number"
                min={80}
                max={2000}
                step={50}
                className="smart-place-modal-input"
                value={radiusMeters}
                onChange={(e) => setRadiusMeters(Number(e.target.value))}
              />
              <span className="smart-place-radius-unit">m</span>
            </div>
            <div className="smart-place-chips" aria-label="추천 반경">
              {RADIUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`smart-place-chip ${radiusMeters === preset ? "active" : ""}`}
                  onClick={() => setRadiusMeters(preset)}
                >
                  {preset}m{preset === 500 ? " (기본)" : ""}
                </button>
              ))}
            </div>
            <p className="smart-place-modal-help">
              반경 안으로 들어가거나 나올 때 알림이 동작합니다. 기본 500m를 권장해요.
            </p>
          </div>

          <div className="smart-place-coords-box">
            <div className="smart-place-coords-info">
              <span>현재 설정 좌표</span>
              <code>
                {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
              </code>
            </div>
            <div className="smart-place-coords-actions">
              <button
                type="button"
                onClick={() =>
                  onMapPick({
                    id: place.id,
                    name: patch.name || place.name,
                    addressLabel: patch.addressLabel,
                    radiusMeters: patch.radiusMeters,
                    latitude: place.latitude,
                    longitude: place.longitude,
                  })
                }
              >
                <MapPin size={15} /> 지도에서 위치 변경
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => onRecapture(patch)}
              >
                {busy === `capture:${place.id}` ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <LocateFixed size={15} />
                )}
                현재 위치로 재설정
              </button>
            </div>
          </div>
        </div>

        <footer className="smart-place-modal-footer">
          <button
            type="button"
            className="smart-place-delete-trigger"
            onClick={onDelete}
          >
            <Trash2 size={15} /> 장소 삭제
          </button>
          <div className="smart-place-modal-btn-group">
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!name.trim()}
              onClick={handleSave}
            >
              저장
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function SmartPlaceAddModal({
  busy,
  onClose,
  onCapture,
  onMapPick,
}: {
  busy: string;
  onClose: () => void;
  onCapture: (draft: { name: string; addressLabel?: string; radiusMeters: number }) => void;
  onMapPick: (draft: { name: string; addressLabel?: string; radiusMeters: number }) => void;
}) {
  const [name, setName] = useState("집");
  const [addressLabel, setAddressLabel] = useState("");
  const [radiusMeters, setRadiusMeters] = useState(500);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const draft = {
    name: name.trim(),
    addressLabel: addressLabel.trim() || undefined,
    radiusMeters: Number(radiusMeters) || 500,
  };

  return (
    <div
      className="smart-place-modal-layer"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="smart-place-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-place-add-title"
      >
        <header className="smart-place-modal-header">
          <div>
            <p>SMART LOCATION</p>
            <h2 id="smart-place-add-title">새 장소 추가</h2>
          </div>
          <button
            type="button"
            className="smart-place-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </header>

        <div className="smart-place-modal-body">
          <div className="smart-place-modal-field">
            <label htmlFor="add-place-name">장소 이름</label>
            <input
              id="add-place-name"
              className="smart-place-modal-input"
              value={name}
              maxLength={30}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 집, 회사, 헬스장"
            />
            <div className="smart-place-chips" aria-label="추천 장소 이름">
              {NAME_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`smart-place-chip ${name === preset ? "active" : ""}`}
                  onClick={() => setName(preset)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="smart-place-modal-field">
            <label htmlFor="add-place-address">주소 또는 메모 (선택)</label>
            <input
              id="add-place-address"
              className="smart-place-modal-input"
              value={addressLabel}
              maxLength={100}
              onChange={(e) => setAddressLabel(e.target.value)}
              placeholder="예: 성수동 사무실, 101동"
            />
          </div>

          <div className="smart-place-modal-field">
            <label htmlFor="add-place-radius">감지 반경 (m)</label>
            <div className="smart-place-radius-row">
              <input
                id="add-place-radius"
                type="number"
                min={80}
                max={2000}
                step={50}
                className="smart-place-modal-input"
                value={radiusMeters}
                onChange={(e) => setRadiusMeters(Number(e.target.value))}
              />
              <span className="smart-place-radius-unit">m</span>
            </div>
            <div className="smart-place-chips" aria-label="추천 반경">
              {RADIUS_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`smart-place-chip ${radiusMeters === preset ? "active" : ""}`}
                  onClick={() => setRadiusMeters(preset)}
                >
                  {preset}m{preset === 500 ? " (기본)" : ""}
                </button>
              ))}
            </div>
            <p className="smart-place-modal-help">
              반경 안으로 들어가거나 나올 때 알림이 동작합니다. 기본 500m를 권장해요.
            </p>
          </div>
        </div>

        <footer className="smart-place-modal-footer">
          <button
            type="button"
            className="secondary-button smart-place-modal-cancel"
            onClick={onClose}
          >
            취소
          </button>
          <div className="smart-place-modal-btn-group">
            <button
              type="button"
              className="secondary-button"
              disabled={!name.trim()}
              onClick={() => onMapPick(draft)}
            >
              <MapPin size={15} /> 지도에서 선택
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={Boolean(busy) || !name.trim()}
              onClick={() => onCapture(draft)}
            >
              {busy === "add" ? (
                <LoaderCircle className="spin" size={15} />
              ) : (
                <LocateFixed size={15} />
              )}
              현재 위치로 추가
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
