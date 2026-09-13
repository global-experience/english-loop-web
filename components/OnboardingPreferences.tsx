"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { FeedCategory } from "@/lib/types";

type PreferencesResponse = {
  categories: FeedCategory[];
  selected_ids: string[];
  completed: boolean;
};

/**
 * 관심 카테고리 고르기.
 *
 * 가입 직후에는 행동 기록이 없어 추천이 인기순과 다를 게 없다. 여기서 고른
 * 값이 그 빈자리를 메운다. 다만 이건 출발점일 뿐이라, 실제로 무엇을 찜하고
 * 학습하는지가 쌓이면 그쪽 신호가 앞선다.
 *
 * `mode`
 * - `onboarding`: 첫 진입에서 전체 화면. 건너뛸 수 있다
 * - `settings`: 설정 안에서 언제든 다시 고르기
 */
export function OnboardingPreferences({
  mode,
  onDone,
}: {
  mode: "onboarding" | "settings";
  onDone?: () => void;
}) {
  const [data, setData] = useState<PreferencesResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch<PreferencesResponse>("/api/me/preferences");
      setData(response);
      setSelected(response.selected_ids);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "관심 주제를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function toggle(id: string) {
    setSaved(false);
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  async function save(categoryIds: string[]) {
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/me/preferences", {
        method: "PUT",
        body: JSON.stringify({ category_ids: categoryIds }),
      });
      setSaved(true);
      onDone?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const categories = data?.categories ?? [];

  // 관리자가 카테고리를 아직 안 만들었다면 고를 게 없다.
  // 온보딩에서 빈 화면을 보여주느니 조용히 넘긴다.
  useEffect(() => {
    if (mode === "onboarding" && data && !categories.length) {
      void save([]);
    }
  }, [mode, data, categories.length]);

  if (!data) {
    return (
      <div className="onboarding-loading">
        <LoaderCircle className="spin" size={22} />
      </div>
    );
  }

  if (mode === "onboarding" && !categories.length) {
    return <div className="onboarding-loading"><LoaderCircle className="spin" size={22} /></div>;
  }

  const body = (
    <>
      <div className="onboarding-grid">
        {categories.map((category) => {
          const active = selected.includes(category.id);
          return (
            <button
              type="button"
              key={category.id}
              className={active ? "onboarding-chip active" : "onboarding-chip"}
              onClick={() => toggle(category.id)}
              aria-pressed={active}
            >
              <span>{category.label}</span>
              {category.description && <small>{category.description}</small>}
              {active && <i aria-hidden="true"><Check size={14} /></i>}
            </button>
          );
        })}
      </div>
      {!categories.length && (
        <p className="onboarding-empty">아직 고를 수 있는 주제가 없습니다. 나중에 설정에서 다시 골라 주세요.</p>
      )}
      {error && <p className="onboarding-error" role="alert">{error}</p>}
    </>
  );

  if (mode === "settings") {
    return (
      <div className="onboarding-settings">
        {body}
        <div className="onboarding-actions">
          <button className="primary-button" onClick={() => void save(selected)} disabled={saving}>
            {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
            {saved ? "저장됨" : "관심 주제 저장"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="onboarding-screen">
      <section className="onboarding-card">
        <p className="eyebrow"><Sparkles size={13} /> 시작하기 전에</p>
        <h1>어떤 영상으로<br />영어를 배우고 싶으세요?</h1>
        <p className="onboarding-lead">
          고른 주제를 먼저 보여드립니다. 나중에 설정에서 언제든 바꿀 수 있고,
          학습을 이어갈수록 실제로 보신 영상에 맞춰 추천이 달라집니다.
        </p>
        {body}
        <div className="onboarding-actions">
          <button
            className="primary-button"
            onClick={() => void save(selected)}
            disabled={saving || !selected.length}
          >
            {saving ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}
            {selected.length ? `${selected.length}개 선택하고 시작하기` : "주제를 골라주세요"}
          </button>
          {/* 건너뛸 자유가 있어야 한다. 고르지 않아도 온보딩은 끝난 것으로 본다. */}
          {/* <button className="text-button" onClick={() => void save([])} disabled={saving}>
            나중에 고를게요
          </button> */}
        </div>
      </section>
    </main>
  );
}
