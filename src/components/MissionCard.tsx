"use client";

import { useRef } from "react";
import { fileToThumbDataUrl } from "@/lib/image";
import { validateMission } from "@/lib/mission-validator";
import { useMorgo } from "@/lib/store";
import { MISSION_CATEGORY_LABELS, type TripMission } from "@/lib/types";

/**
 * 여행 미션 카드. 사진으로 인증하면 Phase 5 시뮬레이션 판정을 거쳐
 * 성공/재도전이 결정된다(명세서 18장). 판정은 store 액션으로 처리.
 */
export default function MissionCard({
  tripId,
  tm,
  locked = false,
}: {
  tripId: string;
  tm: TripMission;
  /** 여행이 끝나(실패) 더는 도전할 수 없는 상태 — 제출 버튼 숨김 */
  locked?: boolean;
}) {
  const submitMission = useMorgo((s) => s.submitMission);
  const resolveMission = useMorgo((s) => s.resolveMission);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const { mission, status } = tm;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const url = await fileToThumbDataUrl(file, 900);
    submitMission(tripId, mission.id, url);
    // AI 판정 (키 있으면 Claude 비전, 없으면 시뮬레이션 폴백 — 명세서 18장)
    const verdict = await validateMission(url, mission);
    resolveMission(tripId, mission.id, verdict.status, verdict.confidence);
  };

  const passed = status === "PASSED";
  const analyzing = status === "ANALYZING";

  return (
    <div
      className={`rounded-2xl p-4 shadow-sm transition ${
        passed ? "bg-morgo-mint-soft" : "bg-morgo-card"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-morgo-yellow-soft text-2xl">
          {mission.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-morgo-navy/5 px-1.5 py-0.5 text-[10px] font-semibold text-morgo-navy/55">
              {MISSION_CATEGORY_LABELS[mission.category]}
            </span>
            <span className="text-[11px] font-bold text-morgo-pink">
              +{tm.earnedPoints ?? mission.points}P
            </span>
          </div>
          <div className="mt-1 font-bold">{mission.title}</div>
          <p className="mt-0.5 text-xs text-morgo-navy/55">
            {mission.description}
          </p>
        </div>
        {tm.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tm.imageUrl}
            alt="제출 사진"
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        )}
      </div>

      <div className="mt-3">
        {passed ? (
          <div className="flex items-center justify-between text-sm font-bold text-morgo-navy">
            <span>✅ 미션 성공!</span>
            {tm.confidence != null && (
              <span className="text-[11px] font-normal text-morgo-navy/50">
                신뢰도 {(tm.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        ) : analyzing ? (
          <div className="flex items-center gap-2 text-sm font-semibold text-morgo-navy/60">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-morgo-navy/20 border-t-morgo-navy" />
            AI가 사진을 판정하고 있어요…
          </div>
        ) : locked ? (
          <p className="text-xs font-semibold text-morgo-navy/45">
            ⏰ 여행이 끝나 더는 도전할 수 없어요
          </p>
        ) : (
          <>
            {status === "FAILED" && (
              <p className="mb-2 text-xs font-semibold text-morgo-pink">
                판정 신뢰도가 낮아요. 다시 도전해볼까요?
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="min-h-[44px] flex-1 rounded-xl bg-morgo-navy text-sm font-bold text-white"
              >
                📷 {status === "FAILED" ? "다시 촬영" : "바로 촬영"}
              </button>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="min-h-[44px] flex-1 rounded-xl border border-morgo-navy/20 text-sm font-bold text-morgo-navy/70"
              >
                🖼️ 앨범에서 선택
              </button>
            </div>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onPick}
            />
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPick}
            />
          </>
        )}
      </div>
    </div>
  );
}
