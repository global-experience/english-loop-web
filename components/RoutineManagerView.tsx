"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowUp, Bell, Check, Copy, GripVertical, LoaderCircle, Pencil, Plus, RotateCcw, Save, Trash2, TriangleAlert, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { triggerHapticImpact } from "@/lib/haptics";
import type { ContentStrategy, RoutineActivityType, RoutineItem, RoutineItemConfig, RoutinePayload } from "@/lib/types";
import { ACTIVITY_LABELS, DAY_LABELS, RoutineIcon, daySummary, defaultRoutineItem, fetchRoutines, syncRoutineNotifications } from "@/lib/routines";
import { useMobileUi, usePortalReady } from "@/lib/useMobileUi";

const activityOptions: RoutineActivityType[] = ["listen", "shadowing", "recall", "record", "review", "ai_conversation", "free_study"];
const strategyOptions: ContentStrategy[] = ["recommended", "continue_recent", "fixed", "saved", "manual", "none"];
const strategyLabels: Record<ContentStrategy, string> = {
  recommended: "오늘의 추천 콘텐츠",
  continue_recent: "최근 학습 이어하기",
  fixed: "지정한 콘텐츠",
  saved: "저장한 콘텐츠 중 선택",
  manual: "실행할 때 직접 선택",
  none: "콘텐츠 없이 실행",
};

const ICON_OPTIONS = [
  { id: "sun", label: "아침 / 출근" },
  { id: "coffee", label: "점심 / 휴식" },
  { id: "moon", label: "저녁 / 밤" },
  { id: "headphones", label: "듣기 / 오디오" },
  { id: "mic-2", label: "말하기 / 녹음" },
  { id: "captions", label: "자막 학습" },
  { id: "captions-off", label: "자막 숨김" },
  { id: "book-open", label: "교재 학습" },
  { id: "review", label: "복습" },
  { id: "pencil", label: "연습 / 쓰기" },
  { id: "ai", label: "AI 대화" },
  { id: "sparkles", label: "추천 / AI" },
];

type Props = {
  onBack: () => void;
};

type DragPreview = {
  item: RoutineItem;
  sourceIndex: number;
  overIndex: number;
  top: number;
  left: number;
  width: number;
  height: number;
};

type DragSession = DragPreview & {
  pointerId: number;
  startClientY: number;
  startScrollY: number;
  cardCenters: number[];
};

export function RoutineManagerView({ onBack }: Props) {
  const portalReady = usePortalReady();
  const [routines, setRoutines] = useState<RoutinePayload | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RoutineItem | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [orderSaving, setOrderSaving] = useState(false);
  const routineListRef = useRef<HTMLDivElement | null>(null);
  const dragOverlayRef = useRef<HTMLElement | null>(null);
  const dragSessionRef = useRef<DragSession | null>(null);
  const reorderRevisionRef = useRef(0);
  const reorderQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!routines?.plans.length || selectedPlanId) return;
    setSelectedPlanId(routines.plans[0].id);
  }, [routines, selectedPlanId]);

  const selectedPlan = useMemo(
    () => routines?.plans.find((plan) => plan.id === selectedPlanId) || routines?.plans[0] || null,
    [routines, selectedPlanId]
  );

  const editingItem = useMemo(
    () => selectedPlan?.items.find((item) => item.id === editingItemId) || null,
    [selectedPlan, editingItemId]
  );

  async function load() {
    setMessage("");
    try {
      const payload = await fetchRoutines();
      setRoutines(payload);
      setSelectedPlanId((current) => current || payload.plans[0]?.id || null);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "루틴을 불러오지 못했습니다.");
    }
  }

  async function persist(url: string, options: RequestInit, success: string) {
    setBusy(url);
    setMessage("");
    try {
      const payload = await apiFetch<RoutinePayload>(url, options);
      setRoutines(payload);
      setSelectedPlanId((current) => current && payload.plans.some((plan) => plan.id === current) ? current : payload.plans[0]?.id || null);
      const notificationState = await syncRoutineNotifications(payload);
      if (notificationState === "denied") setMessage(`${success} 알림 권한이 거부되어 예약은 건너뛰었습니다.`);
      else if (notificationState === "unavailable") setMessage(`${success} 앱 알림 플러그인이 연결되면 같은 설정으로 예약됩니다.`);
      else setMessage(success);
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "루틴을 저장하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function addItem() {
    if (!selectedPlan) return;
    const draft = {
      ...defaultRoutineItem(selectedPlan.id, selectedPlan.items.length),
      days_of_week: selectedPlan.days_of_week,
    };
    await persist("/api/routines/items", { method: "POST", body: JSON.stringify(draft) }, "새 루틴 항목을 추가했어요.");
  }

  async function duplicate(item: RoutineItem) {
    await persist(`/api/routines/items/${item.id}/duplicate`, { method: "POST" }, "루틴 항목을 복제했어요.");
  }

  async function remove(item: RoutineItem) {
    setBusy(`delete-${item.id}`);
    setMessage("");
    try {
      await apiFetch(`/api/routines/items/${item.id}`, { method: "DELETE" });
      const payload = await fetchRoutines();
      setRoutines(payload);
      setEditingItemId((current) => current === item.id ? null : current);
      setDeleteTarget(null);
      await syncRoutineNotifications(payload);
      setMessage("루틴 항목을 삭제했어요. 과거 학습 기록은 그대로 남습니다.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "루틴을 삭제하지 못했습니다.");
    } finally {
      setBusy("");
    }
  }

  async function resetDefaults() {
    if (!confirm("기본 루틴으로 되돌릴까요? 현재 루틴 항목은 숨김 처리되고 기존 학습 기록은 유지됩니다.")) return;
    await persist("/api/routines/reset-defaults", { method: "POST" }, "기본 루틴으로 초기화했어요.");
  }

  function reorderItems(sourceIndex: number, destinationIndex: number) {
    if (!selectedPlan || !routines || sourceIndex === destinationIndex) return;
    if (sourceIndex < 0 || destinationIndex < 0 || sourceIndex >= selectedPlan.items.length || destinationIndex >= selectedPlan.items.length) return;

    const items = Array.from(selectedPlan.items);
    const [reorderedItem] = items.splice(sourceIndex, 1);
    items.splice(destinationIndex, 0, reorderedItem);

    const updatedItems = items.map((item, index) => ({ ...item, sort_order: index }));
    const changedItems = updatedItems.filter((item, index) => selectedPlan.items[index]?.id !== item.id || selectedPlan.items[index]?.sort_order !== index);
    const revision = ++reorderRevisionRef.current;

    setRoutines((prev) => {
      if (!prev || !selectedPlan) return prev;
      return {
        ...prev,
        plans: prev.plans.map((plan) =>
          plan.id === selectedPlan.id ? { ...plan, items: updatedItems } : plan
        ),
      };
    });
    setMessage(`${reorderedItem.name}을(를) ${destinationIndex + 1}번째로 옮겼어요. 저장 중…`);
    setOrderSaving(true);
    void triggerHapticImpact("light");

    reorderQueueRef.current = reorderQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await Promise.all(
          changedItems.map((item) =>
            apiFetch(`/api/routines/items/${item.id}`, {
              method: "PATCH",
              body: JSON.stringify({ sort_order: item.sort_order }),
            })
          )
        );
        if (revision !== reorderRevisionRef.current) return;
        const payload = await fetchRoutines();
        setRoutines(payload);
        await syncRoutineNotifications(payload);
        setMessage("루틴 순서를 저장했어요.");
      })
      .catch((caught) => {
        if (revision !== reorderRevisionRef.current) return;
        setMessage(caught instanceof Error ? caught.message : "순서를 저장하지 못했습니다.");
        void load();
      })
      .finally(() => {
        if (revision === reorderRevisionRef.current) setOrderSaving(false);
      });
  }

  function finishPointerDrag(cancelled = false) {
    const session = dragSessionRef.current;
    dragSessionRef.current = null;
    setDraggingItemId(null);
    setDragPreview(null);
    if (!session || cancelled || session.sourceIndex === session.overIndex) return;
    reorderItems(session.sourceIndex, session.overIndex);
  }

  function startPointerDrag(event: ReactPointerEvent<HTMLButtonElement>, item: RoutineItem, index: number) {
    if (orderSaving || (event.pointerType === "mouse" && event.button !== 0)) return;
    const card = event.currentTarget.closest<HTMLElement>("[data-routine-card]");
    if (!card || !routineListRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = card.getBoundingClientRect();
    const cardCenters = Array.from(routineListRef.current.querySelectorAll<HTMLElement>("[data-routine-card]"))
      .map((node) => {
        const nodeRect = node.getBoundingClientRect();
        return nodeRect.top + nodeRect.height / 2;
      });
    const next: DragSession = {
      item,
      sourceIndex: index,
      overIndex: index,
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startScrollY: window.scrollY,
      cardCenters,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
    dragSessionRef.current = next;
    setDraggingItemId(item.id);
    setDragPreview(next);
    setMessage("");
    void triggerHapticImpact("medium");
  }

  function movePointerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();

    const deltaY = event.clientY - session.startClientY;
    if (dragOverlayRef.current) {
      dragOverlayRef.current.style.transform = `translate3d(0, ${deltaY}px, 0)`;
    }

    const edgeSize = Math.min(88, window.innerHeight * 0.16);
    if (event.clientY < edgeSize) window.scrollBy({ top: -12, behavior: "auto" });
    else if (event.clientY > window.innerHeight - edgeSize) window.scrollBy({ top: 12, behavior: "auto" });

    let closestIndex = session.overIndex;
    let closestDistance = Number.POSITIVE_INFINITY;
    const scrollDelta = window.scrollY - session.startScrollY;
    session.cardCenters.forEach((center, index) => {
      const distance = Math.abs(event.clientY - (center - scrollDelta));
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });
    if (closestIndex === session.overIndex) return;

    session.overIndex = closestIndex;
    setDragPreview((current) => current ? { ...current, overIndex: closestIndex } : current);
    void triggerHapticImpact("light");
  }

  function cardShift(index: number) {
    if (!dragPreview || index === dragPreview.sourceIndex) return 0;
    const distance = dragPreview.height + 10;
    if (dragPreview.sourceIndex < dragPreview.overIndex && index > dragPreview.sourceIndex && index <= dragPreview.overIndex) return -distance;
    if (dragPreview.sourceIndex > dragPreview.overIndex && index >= dragPreview.overIndex && index < dragPreview.sourceIndex) return distance;
    return 0;
  }

  const completedSetup = Boolean(routines?.plans.length);

  return (
    <section className="routine-board" aria-label="학습 루틴 관리">
      <header className="routine-board-hero">
        <button type="button" className="routine-back-button" onClick={onBack}><ArrowLeft size={18} /> 학습으로</button>
        <div>
          <p className="eyebrow">ROUTINE BUILDER</p>
          <h2>내 하루에 맞게<br />학습 루프 만들기.</h2>
          <p>Today는 여기서 켜둔 루틴 항목만 시간순으로 보여줘요. 삭제해도 이전 학습 기록은 사라지지 않습니다.</p>
        </div>
      </header>

      {message && <p className="routine-board-message" role="status">{message}</p>}

      {!routines && !message && <p className="routine-board-empty">루틴을 불러오는 중입니다…</p>}

      {completedSetup && routines && (
        <>
          <div className="routine-plan-switcher" role="tablist" aria-label="학습 계획 선택">
            {routines.plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                role="tab"
                aria-selected={selectedPlan?.id === plan.id}
                className={selectedPlan?.id === plan.id ? "active" : ""}
                onClick={() => setSelectedPlanId(plan.id)}
              >
                <strong>{plan.name}</strong>
                <small>{daySummary(plan.days_of_week)} · {plan.items.length}개</small>
              </button>
            ))}
          </div>

          {selectedPlan && (
            <div className="routine-plan-workspace">
              <div className="routine-plan-toolbar">
                <div>
                  <strong>{selectedPlan.name}</strong>
                  <small>{daySummary(selectedPlan.days_of_week)}에 적용됩니다. 시간이 겹쳐도 저장은 가능하고 Today에서 경고 대신 시간순으로 보여줘요.</small>
                  <small className="routine-reorder-help">이동 핸들을 바로 끌어 순서를 바꾸세요. 모바일에서는 오른쪽 화살표로 한 칸씩 옮길 수도 있어요.</small>
                </div>
                <button type="button" className="primary-button compact" onClick={() => void addItem()} disabled={Boolean(busy)}>
                  <Plus size={17} /> 항목 추가
                </button>
              </div>

              <div className="routine-card-list" ref={routineListRef}>
                {selectedPlan.items.map((item, index) => {
                  const shift = cardShift(index);
                  const isDragged = draggingItemId === item.id;
                  return (
                    <article
                      key={item.id}
                      data-routine-card
                      className={`routine-card ${editingItemId === item.id ? "active" : ""} ${!item.is_active ? "disabled" : ""} ${isDragged ? "is-drag-placeholder" : ""} ${shift ? "is-drag-peer" : ""}`}
                      style={shift ? { transform: `translate3d(0, ${shift}px, 0)` } : undefined}
                    >
                      <div className="routine-card-main">
                        <button
                          type="button"
                          className="routine-drag-icon"
                          aria-label={`${item.name} 순서 변경`}
                          title="잡아서 순서 변경"
                          onPointerDown={(event) => startPointerDrag(event, item, index)}
                          onPointerMove={movePointerDrag}
                          onPointerUp={() => finishPointerDrag()}
                          onPointerCancel={() => finishPointerDrag(true)}
                          onKeyDown={(event) => {
                            if (orderSaving) return;
                            if (event.key === "ArrowUp") {
                              event.preventDefault();
                              reorderItems(index, index - 1);
                            } else if (event.key === "ArrowDown") {
                              event.preventDefault();
                              reorderItems(index, index + 1);
                            }
                          }}
                        >
                          <GripVertical size={18} />
                          <span>이동</span>
                        </button>
                        <button type="button" className="routine-card-body-btn" onClick={() => setEditingItemId(item.id)}>
                          <span className="routine-card-icon"><RoutineIcon name={item.icon} size={22} /></span>
                          <span className="routine-card-copy">
                            <strong>{item.name}</strong>
                            <small>{item.start_time}{item.end_time ? `–${item.end_time}` : ""} · {ACTIVITY_LABELS[item.activity_type]} · {strategyLabels[item.content_strategy]}</small>
                          </span>
                          <span className="routine-card-right">
                            <span className="routine-card-status">{item.is_active ? "활성" : "꺼짐"}</span>
                            <span className="routine-card-edit-btn" title="수정"><Pencil size={14} /> 수정</span>
                          </span>
                        </button>
                        <div className="routine-mobile-order-actions" aria-label={`${item.name} 빠른 순서 변경`}>
                          <button type="button" aria-label={`${item.name} 위로 이동`} disabled={index === 0 || orderSaving} onClick={() => reorderItems(index, index - 1)}>
                            <ArrowUp size={17} />
                          </button>
                          <button type="button" aria-label={`${item.name} 아래로 이동`} disabled={index === selectedPlan.items.length - 1 || orderSaving} onClick={() => reorderItems(index, index + 1)}>
                            <ArrowDown size={17} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {!selectedPlan.items.length && <p className="routine-board-empty">아직 루틴 항목이 없습니다. 항목을 하나 추가해볼까요?</p>}
              </div>
            </div>
          )}

          <button type="button" className="routine-reset-button" onClick={() => void resetDefaults()}><RotateCcw size={17} /> 기본 루틴으로 초기화</button>
        </>
      )}

      {editingItem && (
        <RoutineItemEditorModal
          item={editingItem}
          onClose={() => setEditingItemId(null)}
          onSave={async (patch) => {
            await persist(`/api/routines/items/${editingItem.id}`, { method: "PATCH", body: JSON.stringify(patch) }, "루틴 항목을 저장했어요.");
            setEditingItemId(null);
          }}
          onDuplicate={() => {
            const target = editingItem;
            setEditingItemId(null);
            void duplicate(target);
          }}
          onDelete={() => {
            const target = editingItem;
            setEditingItemId(null);
            setDeleteTarget(target);
          }}
          busy={busy === `/api/routines/items/${editingItem.id}`}
        />
      )}

      {deleteTarget && portalReady && createPortal(
        <div className="routine-delete-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteTarget(null)}>
          <section className="routine-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="routine-delete-title">
            <TriangleAlert size={24} />
            <h3 id="routine-delete-title">{deleteTarget.name} 루틴을 삭제할까요?</h3>
            <p>오늘 화면과 루틴 관리에서는 사라지지만, 이미 저장된 학습 기록과 리포트의 당시 루틴 스냅샷은 유지됩니다.</p>
            <div>
              <button type="button" className="secondary-button" onClick={() => setDeleteTarget(null)}>취소</button>
              <button type="button" className="primary-button danger-action" onClick={() => void remove(deleteTarget)} disabled={busy === `delete-${deleteTarget.id}`}>
                {busy === `delete-${deleteTarget.id}` ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />} 삭제
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}

      {dragPreview && portalReady && createPortal(
        <article
          ref={dragOverlayRef}
          className={`routine-card routine-drag-overlay ${!dragPreview.item.is_active ? "disabled" : ""}`}
          style={{
            top: dragPreview.top,
            left: dragPreview.left,
            width: dragPreview.width,
            height: dragPreview.height,
          }}
          aria-hidden="true"
        >
          <div className="routine-card-main">
            <div className="routine-drag-icon"><GripVertical size={18} /><span>이동</span></div>
            <div className="routine-card-body-btn">
              <span className="routine-card-icon"><RoutineIcon name={dragPreview.item.icon} size={22} /></span>
              <span className="routine-card-copy">
                <strong>{dragPreview.item.name}</strong>
                <small>{dragPreview.item.start_time}{dragPreview.item.end_time ? `–${dragPreview.item.end_time}` : ""} · {ACTIVITY_LABELS[dragPreview.item.activity_type]} · {strategyLabels[dragPreview.item.content_strategy]}</small>
              </span>
              <span className="routine-card-right"><span className="routine-card-status">이동 중</span></span>
            </div>
          </div>
        </article>,
        document.body
      )}
    </section>
  );
}

function RoutineItemEditorModal({
  item,
  onClose,
  onSave,
  onDuplicate,
  onDelete,
  busy,
}: {
  item: RoutineItem;
  onClose: () => void;
  onSave: (patch: Partial<RoutineItem>) => Promise<void> | void;
  onDuplicate: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const portalReady = usePortalReady();
  const { mobile } = useMobileUi();

  const [name, setName] = useState(item.name);
  const [selectedIcon, setSelectedIcon] = useState(item.icon);
  const [startTime, setStartTime] = useState(item.start_time);
  const [endTime, setEndTime] = useState(item.end_time || "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(item.estimated_minutes);
  const [activityType, setActivityType] = useState<RoutineActivityType>(item.activity_type);
  const [contentStrategy, setContentStrategy] = useState<ContentStrategy>(item.content_strategy);
  const [fixedContentId, setFixedContentId] = useState(item.fixed_content_id || "");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(item.days_of_week);
  const [isActive, setIsActive] = useState(item.is_active);
  const [showTranslation, setShowTranslation] = useState(item.config.showTranslation);
  const [recordingEnabled, setRecordingEnabled] = useState(item.config.recordingEnabled);
  const [sttEnabled, setSttEnabled] = useState(item.config.sttEnabled);
  const [notificationEnabled, setNotificationEnabled] = useState(item.notification.enabled);
  const [repeatOptions, setRepeatOptions] = useState<number[]>(item.config.repeatOptions);
  const [speedOptions, setSpeedOptions] = useState<number[]>(item.config.speedOptions);
  const [defaultRepeat, setDefaultRepeat] = useState(item.config.defaultRepeat);
  const [defaultSpeed, setDefaultSpeed] = useState(item.config.defaultSpeed);
  const [subtitleMode, setSubtitleMode] = useState(item.config.subtitleMode);
  const [targetCount, setTargetCount] = useState(item.config.targetCount || 0);

  if (!portalReady) return null;

  const toggleDay = (dayIndex: number) => {
    setDaysOfWeek((current) =>
      current.includes(dayIndex)
        ? current.filter((d) => d !== dayIndex)
        : [...current, dayIndex].sort((a, b) => a - b)
    );
  };

  async function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    await onSave({
      name: name.trim() || item.name,
      icon: selectedIcon,
      start_time: startTime || "09:00",
      end_time: endTime.trim() || null,
      estimated_minutes: Number(estimatedMinutes) || 20,
      activity_type: activityType,
      content_strategy: contentStrategy,
      fixed_content_id: fixedContentId.trim() || null,
      is_active: isActive,
      days_of_week: daysOfWeek,
      config: {
        ...item.config,
        repeatOptions,
        speedOptions,
        defaultRepeat,
        defaultSpeed,
        subtitleMode,
        showTranslation,
        recordingEnabled,
        sttEnabled,
        targetCount: Number(targetCount) || null,
        durationMinutes: Number(estimatedMinutes) || 20,
      },
      notification: {
        ...item.notification,
        enabled: notificationEnabled,
      },
    });
  }

  return createPortal(
    <div
      className={`routine-modal-layer ${mobile ? "mobile" : "desktop"}`}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="routine-modal-card" role="dialog" aria-modal="true" aria-labelledby="routine-modal-title">
        {mobile && <div className="routine-modal-handle" aria-hidden="true" />}

        <header className="routine-modal-header">
          <div>
            <p className="eyebrow">ROUTINE EDITOR</p>
            <h2 id="routine-modal-title">{item.name} 루틴 수정</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="루틴 수정 닫기">
            <X size={19} />
          </button>
        </header>

        <form className="routine-modal-form" onSubmit={(e) => void handleFormSubmit(e)}>
          {/* Section 1: Basic Information */}
          <div className="routine-form-section">
            <h3>기본 정보</h3>
            <div className="routine-field-group">
              <label htmlFor="routine-name-input">루틴 이름</label>
              <input
                id="routine-name-input"
                className="routine-field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 출근 섀도잉 루프"
                required
              />
            </div>

            {/* Visual Icon Picker */}
            <div className="routine-field-group">
              <label>루틴 아이콘 선택</label>
              <div className="routine-icon-picker-grid">
                {ICON_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`routine-icon-option-btn ${selectedIcon === opt.id ? "selected" : ""}`}
                    onClick={() => setSelectedIcon(opt.id)}
                  >
                    <RoutineIcon name={opt.id} size={22} />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="routine-field-row grid-3">
              <div className="routine-field-group">
                <label htmlFor="routine-start-time">시작 시간</label>
                <input
                  id="routine-start-time"
                  type="time"
                  className="routine-field-input"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="routine-field-group">
                <label htmlFor="routine-end-time">종료 시간</label>
                <input
                  id="routine-end-time"
                  type="time"
                  className="routine-field-input"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  placeholder="선택 사항"
                />
              </div>
              <div className="routine-field-group">
                <label htmlFor="routine-est-min">예상 시간 (분)</label>
                <input
                  id="routine-est-min"
                  type="number"
                  min="1"
                  max="240"
                  className="routine-field-input"
                  value={estimatedMinutes}
                  onChange={(e) => setEstimatedMinutes(Number(e.target.value))}
                />
              </div>
            </div>

            <div className="routine-field-row grid-2">
              <div className="routine-field-group">
                <label htmlFor="routine-activity-type">학습 방식</label>
                <select
                  id="routine-activity-type"
                  className="routine-field-select"
                  value={activityType}
                  onChange={(e) => setActivityType(e.target.value as RoutineActivityType)}
                >
                  {activityOptions.map((opt) => (
                    <option key={opt} value={opt}>{ACTIVITY_LABELS[opt]}</option>
                  ))}
                </select>
              </div>

              <div className="routine-field-group">
                <label htmlFor="routine-content-strategy">콘텐츠 선택 방식</label>
                <select
                  id="routine-content-strategy"
                  className="routine-field-select"
                  value={contentStrategy}
                  onChange={(e) => setContentStrategy(e.target.value as ContentStrategy)}
                >
                  {strategyOptions.map((opt) => (
                    <option key={opt} value={opt}>{strategyLabels[opt]}</option>
                  ))}
                </select>
              </div>
            </div>

            {contentStrategy === "fixed" && (
              <div className="routine-field-group">
                <label htmlFor="routine-fixed-id">고정 콘텐츠 ID</label>
                <input
                  id="routine-fixed-id"
                  className="routine-field-input"
                  value={fixedContentId}
                  onChange={(e) => setFixedContentId(e.target.value)}
                  placeholder="콘텐츠 ID 입력"
                />
              </div>
            )}
          </div>

          {/* Section 2: Days & Toggles */}
          <div className="routine-form-section">
            <div className="routine-section-header-row">
              <h3>반복 요일 및 기능 설정</h3>
              <div className="routine-day-presets">
                <button type="button" className="routine-day-preset-btn" onClick={() => setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])}>매일</button>
                <button type="button" className="routine-day-preset-btn" onClick={() => setDaysOfWeek([0, 1, 2, 3, 4])}>평일</button>
                <button type="button" className="routine-day-preset-btn" onClick={() => setDaysOfWeek([5, 6])}>주말</button>
              </div>
            </div>

            <div className="routine-days-grid">
              {DAY_LABELS.map((dayLabel, idx) => {
                const isSelected = daysOfWeek.includes(idx);
                return (
                  <button
                    key={dayLabel}
                    type="button"
                    className={`routine-day-btn ${isSelected ? "selected" : ""}`}
                    onClick={() => toggleDay(idx)}
                  >
                    {dayLabel}
                  </button>
                );
              })}
            </div>

            <div className="routine-toggle-grid">
              <button
                type="button"
                className={`routine-toggle-btn ${isActive ? "selected" : ""}`}
                onClick={() => setIsActive(!isActive)}
              >
                {isActive ? <Check size={14} /> : null} 루틴 활성
              </button>
              <button
                type="button"
                className={`routine-toggle-btn ${showTranslation ? "selected" : ""}`}
                onClick={() => setShowTranslation(!showTranslation)}
              >
                {showTranslation ? <Check size={14} /> : null} 번역 보기
              </button>
              <button
                type="button"
                className={`routine-toggle-btn ${recordingEnabled ? "selected" : ""}`}
                onClick={() => setRecordingEnabled(!recordingEnabled)}
              >
                {recordingEnabled ? <Check size={14} /> : null} 녹음 사용
              </button>
              <button
                type="button"
                className={`routine-toggle-btn ${sttEnabled ? "selected" : ""}`}
                onClick={() => setSttEnabled(!sttEnabled)}
              >
                {sttEnabled ? <Check size={14} /> : null} STT 비교
              </button>
              <button
                type="button"
                className={`routine-toggle-btn ${notificationEnabled ? "selected" : ""}`}
                onClick={() => setNotificationEnabled(!notificationEnabled)}
              >
                {notificationEnabled ? <Check size={14} /> : null} 알림
              </button>
            </div>
          </div>

          {/* Section 3: Detailed Learning Options */}
          <div className="routine-form-section">
            <h3>세부 학습 옵션</h3>
            <div className="routine-field-row grid-3">
              <div className="routine-field-group">
                <label htmlFor="routine-default-repeat">기본 반복 (회)</label>
                <input
                  id="routine-default-repeat"
                  type="number"
                  min="1"
                  max="20"
                  className="routine-field-input"
                  value={defaultRepeat}
                  onChange={(e) => setDefaultRepeat(Number(e.target.value))}
                />
              </div>
              <div className="routine-field-group">
                <label htmlFor="routine-default-speed">기본 배속 (x)</label>
                <input
                  id="routine-default-speed"
                  type="number"
                  min="0.5"
                  max="2"
                  step="0.05"
                  className="routine-field-input"
                  value={defaultSpeed}
                  onChange={(e) => setDefaultSpeed(Number(e.target.value))}
                />
              </div>
              <div className="routine-field-group">
                <label htmlFor="routine-subtitle-mode">자막 모드</label>
                <select
                  id="routine-subtitle-mode"
                  className="routine-field-select"
                  value={subtitleMode}
                  onChange={(e) => setSubtitleMode(e.target.value as RoutineItemConfig["subtitleMode"])}
                >
                  <option value="user_choice">사용자 선택</option>
                  <option value="shown">항상 표시</option>
                  <option value="hidden">숨김 (블러)</option>
                </select>
              </div>
            </div>

            <div className="routine-field-row grid-2">
              <div className="routine-field-group">
                <label htmlFor="routine-target-count">목표 문장 개수</label>
                <input
                  id="routine-target-count"
                  type="number"
                  min="0"
                  max="100"
                  className="routine-field-input"
                  value={targetCount}
                  onChange={(e) => setTargetCount(Number(e.target.value))}
                />
              </div>
              <div className="routine-field-group">
                <label>구간 반복 선택지</label>
                <div className="routine-multi-inputs">
                  {[0, 1, 2].map((idx) => (
                    <input
                      key={`repeat-${idx}`}
                      type="number"
                      min="1"
                      max="20"
                      className="routine-field-input compact"
                      value={repeatOptions[idx] ?? idx + 1}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setRepeatOptions((prev) => {
                          const next = [...prev];
                          next[idx] = val;
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <footer className="routine-modal-footer">
            <div className="routine-modal-footer-info">
              <Bell size={14} /> 모바일 앱 알림이 켜져있으면 설정한 시간에 알림을 보내드려요.
            </div>
            <div className="routine-modal-footer-actions">
              <button type="button" className="secondary-button" onClick={onDuplicate} disabled={busy}>
                <Copy size={16} /> 복제
              </button>
              <button type="button" className="secondary-button danger-inline" onClick={onDelete} disabled={busy}>
                <Trash2 size={16} /> 삭제
              </button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? <LoaderCircle className="spin" size={17} /> : <Save size={16} />} 저장
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>,
    document.body
  );
}
