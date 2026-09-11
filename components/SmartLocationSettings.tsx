"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { fetchRoutines } from "@/lib/routines";
import type { RoutinePayload } from "@/lib/types";
import {
  configureSmartLocationMonitoring,
  getSmartReminderSettings,
  removeSmartPlace,
  saveCurrentLocationAsPlace,
  savePlaceCoordinates,
  saveSmartReminderSettings,
  stopSmartLocationMonitoring,
  syncNativeRoutineReminders,
  updateSmartPlace,
  type SmartPlace,
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

const NAME_PRESETS = ["집", "회사", "헬스장", "본가", "학교", "스터디룸"];
const RADIUS_PRESETS = [100, 300, 500, 1000, 2000];

function friendlyError(caught: unknown) {
  const raw = caught instanceof Error ? caught.message : String(caught || "");
  if (/permission|denied|권한/i.test(raw)) return "위치 권한이 필요합니다. 기기 설정에서 Loopine의 위치 권한을 ‘항상 허용’으로 바꿔주세요.";
  if (/timeout|시간|GPS|location/i.test(raw)) return "현재 위치를 확인하지 못했습니다. GPS를 켜고 잠시 후 다시 시도해주세요.";
  if (/then is not a function|addWatcher|removeWatcher|plugin\./i.test(raw)) return "위치 기능 연결을 다시 준비했습니다. 앱을 완전히 종료한 뒤 다시 실행해주세요.";
  return "현재 위치를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

export function SmartLocationSettings({ payload: initialPayload, variant = "full" }: Props) {
  const { native } = useMobileUi();
  const portalReady = usePortalReady();
  const [settings, setSettings] = useState<SmartReminderSettings>(() => getSmartReminderSettings());
  const [initiallyEnabled] = useState(() => getSmartReminderSettings().enabled);
  const [payload, setPayload] = useState<RoutinePayload | undefined>(initialPayload);
  const [expanded, setExpanded] = useState(variant === "full");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("집");
  const [newAddress, setNewAddress] = useState("");
  const [newRadius, setNewRadius] = useState(500);
  const [mapDraft, setMapDraft] = useState<MapDraft | null>(null);
  const [editingPlace, setEditingPlace] = useState<SmartPlace | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SmartPlace | null>(null);

  useBodyScrollLock(Boolean(editingPlace || deleteTarget));

  const places = useMemo(() => Object.values(settings.places).sort((a, b) => a.name.localeCompare(b.name, "ko")), [settings]);

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

  async function toggleEnabled() {
    if (!native) {
      setExpanded(true);
      setStatus("스마트 위치 알림은 Loopine iOS·Android 앱에서 사용할 수 있어요.");
      return;
    }
    if (!settings.enabled && places.length === 0) {
      setExpanded(true);
      setAdding(true);
      setStatus("알림에 사용할 장소를 먼저 추가해주세요.");
      return;
    }
    const next = { ...settings, enabled: !settings.enabled };
    if (next.enabled) {
      setExpanded(true);
    }
    setSettings(next);
    saveSmartReminderSettings(next);
    setBusy("toggle");
    try {
      if (!next.enabled) {
        await stopSmartLocationMonitoring();
        setStatus("스마트 위치 알림을 껐어요. 시간 알림은 그대로 유지됩니다.");
        return;
      }
      if (!payload) throw new Error("루틴 정보를 불러오는 중입니다.");
      const result = await syncNativeRoutineReminders(payload, { requestPermission: true });
      if (result === "scheduled") {
        setStatus("스마트 위치 알림을 켰어요. 좌표는 이 기기 안에서만 사용됩니다.");
      } else if (result === "location-denied") {
        setStatus("시간 알림은 준비됐지만 위치 권한이 필요합니다. 기기 설정에서 ‘항상 허용’을 선택해주세요.");
      } else if (result === "denied") {
        setStatus("알림 권한이 필요합니다. 기기 설정에서 Loopine 알림을 허용해주세요.");
      } else {
        setStatus("모바일 앱을 최신 빌드로 업데이트한 뒤 다시 시도해주세요.");
      }
    } catch (caught) {
      setStatus(friendlyError(caught));
    } finally {
      setBusy("");
    }
  }

  async function capture(input: { id?: string; name: string; addressLabel?: string; radiusMeters: number }) {
    const key = input.id ? `capture:${input.id}` : "add";
    setBusy(key);
    setStatus("현재 위치를 확인하고 있어요…");
    try {
      const next = await saveCurrentLocationAsPlace(input);
      setSettings(next);
      setAdding(false);
      if (editingPlace && input.id && editingPlace.id === input.id) {
        setEditingPlace(next.places[input.id] ?? null);
      }
      await refreshMonitoring(next);
      setStatus(`${input.name.trim() || "새 장소"}을(를) 반경 ${input.radiusMeters || 500}m로 저장했어요.`);
    } catch (caught) {
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
      setSettings(next);
      setAdding(false);
      setMapDraft(null);
      if (editingPlace && mapDraft.id && editingPlace.id === mapDraft.id) {
        setEditingPlace(next.places[mapDraft.id] ?? null);
      }
      setStatus(`${mapDraft.name.trim() || "새 장소"} 위치를 지도에서 저장했어요.`);
      void refreshMonitoring(next);
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
      setSettings(next);
      setAdding(false);
      setMapDraft(null);
      if (editingPlace && draft.id && editingPlace.id === draft.id) {
        setEditingPlace(next.places[draft.id] ?? null);
      }
      setStatus(`${draft.name.trim() || "새 장소"} 위치를 지도에서 저장했어요.`);
      void refreshMonitoring(next);
    } catch (caught) {
      setStatus(friendlyError(caught));
    }
  }

  // Geofencing is intentionally hidden outside the Capacitor iOS/Android shell.
  // Desktop/mobile browsers and installed PWAs do not run the native location monitor.
  if (!native) return null;
  if (variant === "teaser" && initiallyEnabled && settings.enabled) return null;

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
            key={settings.enabled ? "enabled" : "disabled"}
            className={`smart-location-title ${settings.enabled ? "enabled" : "disabled"}`}
          >
            {settings.enabled ? "스마트 위치 알림 사용 중" : "출퇴근 위치로 알림 받기"}
            {settings.enabled && <span className="smart-location-active-badge" aria-hidden="true" />}
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
              <button type="button" className={settings.enabled ? "active" : ""} onClick={() => void toggleEnabled()} disabled={Boolean(busy)}>
                {busy === "toggle" ? <LoaderCircle className="spin" size={15} /> : settings.enabled ? "사용 중 · 끄기" : "사용하기"}
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

            {adding ? (
              <div className="smart-place-new">
                <label>장소 이름<input value={newName} maxLength={30} onChange={(event) => setNewName(event.target.value)} placeholder="예: 집, 회사, 헬스장" /></label>
                <label>주소 또는 메모 (선택)<input value={newAddress} maxLength={100} onChange={(event) => setNewAddress(event.target.value)} placeholder="예: 성수동 사무실" /></label>
                <label>감지 반경<input type="number" min="80" max="2000" step="50" value={newRadius} onChange={(event) => setNewRadius(Number(event.target.value))} /><span>m</span></label>
                <div className="smart-place-new-actions">
                  <button type="button" onClick={() => setAdding(false)}>취소</button>
                  <button type="button" disabled={!newName.trim()} onClick={() => void openMapPicker({ name: newName, addressLabel: newAddress || undefined, radiusMeters: newRadius })}><MapPin size={15} /> 지도에서 선택</button>
                  <button type="button" className="primary" disabled={Boolean(busy) || !newName.trim()} onClick={() => void capture({ name: newName, addressLabel: newAddress, radiusMeters: newRadius })}>
                    {busy === "add" ? <LoaderCircle className="spin" size={15} /> : <LocateFixed size={15} />} 현재 위치로 추가
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="smart-place-add" onClick={() => setAdding(true)}><Plus size={16} /> 장소 추가</button>
            )}

            <p className="smart-location-privacy"><ShieldCheck size={15} /> 장소별 기본 반경은 500m이며 80~2,000m 사이에서 조정할 수 있습니다.</p>
            {status && <p className="smart-location-status" role="status">{status}</p>}
          </div>
        </div>
      </div>

      {mapDraft && <MapPlacePicker initial={mapDraft} onClose={() => setMapDraft(null)} onSelect={selectMapLocation} />}

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
