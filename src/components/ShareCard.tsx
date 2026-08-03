"use client";

import { useState } from "react";
import CharacterImage from "@/components/CharacterImage";
import { RARITY_LABELS } from "@/lib/rarity";
import { cityLabel } from "@/lib/seed";
import { renderShareImage } from "@/lib/shareImage";
import type { City, Rarity, TripMission } from "@/lib/types";

/**
 * 릴스/SNS 공유용 결과 카드. 도시 + 완료한 룰렛 챌린지 + 점수를 예쁜 카드로.
 * 결과를 인스타 스토리 비율 PNG로 렌더링해 네이티브 공유 시트(파일 공유)로 넘기고,
 * 지원 안 되면 다운로드 → 텍스트 공유 순으로 폴백한다.
 */
export default function ShareCard({
  city,
  missions,
  points,
  rarity,
  onClose,
}: {
  city: City;
  missions: TripMission[];
  points: number;
  rarity?: Rarity;
  onClose: () => void;
}) {
  const done = missions.filter((m) => m.status === "PASSED");
  const cover = done.find((m) => m.imageUrl)?.imageUrl;
  const [busy, setBusy] = useState(false);

  const shareText =
    `🎲 모르고 떠난 ${city.name} 여행!\n` +
    `룰렛이 시킨 미션 ${done.length}개 클리어, ${points}P 획득 😆\n` +
    done.map((m) => `${m.mission.emoji} ${m.mission.title}`).join("\n") +
    `\n#모르고 #랜덤여행 #${city.name}`;

  const share = async () => {
    setBusy(true);
    try {
      const blob = await renderShareImage({
        cityName: cityLabel(city),
        rarityLabel: rarity && rarity !== "common" ? RARITY_LABELS[rarity] : undefined,
        points,
        missionTitles: done.map((m) => m.mission.title),
        coverImageUrl: cover,
      });
      const file = new File([blob], "morgo-result.png", { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "모르고 여행 결과", text: shareText });
        return;
      }
      // 파일 공유 미지원 브라우저 → 이미지 다운로드 (스토리에 직접 올리기)
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "morgo-result.png";
      a.click();
      URL.revokeObjectURL(url);
      alert("이미지를 저장했어요! 인스타 스토리에 올려보세요 📸");
    } catch {
      // canvas 실패 등 → 텍스트 공유로 최종 폴백
      try {
        if (navigator.share) {
          await navigator.share({ title: "모르고 여행 결과", text: shareText });
        } else {
          await navigator.clipboard.writeText(shareText);
          alert("공유 문구를 복사했어요! 붙여넣기 해보세요.");
        }
      } catch {
        /* 사용자가 공유 취소 */
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-morgo-navy/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs overflow-hidden rounded-3xl bg-morgo-cream shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 커버 */}
        <div className="relative h-40 bg-gradient-to-br from-morgo-navy to-morgo-navy-deep">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-full w-full object-cover opacity-80" />
          ) : (
            <div className="grid h-full place-items-center">
              <CharacterImage
                src="/character/luggage.png"
                alt=""
                width={90}
                height={92}
                className="rounded-2xl"
              />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-morgo-navy/80 to-transparent p-4">
            {rarity && rarity !== "common" && (
              <div className="mb-1 inline-block rounded-full bg-morgo-yellow px-2 py-0.5 text-[11px] font-extrabold text-morgo-navy">
                {RARITY_LABELS[rarity]} 당첨!
              </div>
            )}
            <div className="text-xs font-bold text-morgo-yellow">
              모르고 떠난 랜덤 여행
            </div>
            <div className="text-2xl font-extrabold text-white">
              {cityLabel(city)}
            </div>
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-morgo-navy">
              🎲 룰렛 클리어 {done.length}개
            </span>
            <span className="rounded-full bg-morgo-yellow px-3 py-1 text-sm font-extrabold text-morgo-navy">
              {points}P
            </span>
          </div>

          <ul className="mt-3 space-y-1.5">
            {done.length > 0 ? (
              done.map((m) => (
                <li
                  key={m.mission.id}
                  className="flex items-center gap-2 rounded-lg bg-morgo-card px-3 py-2 text-sm shadow-sm"
                >
                  <span>{m.mission.emoji}</span>
                  <span className="truncate font-semibold">{m.mission.title}</span>
                </li>
              ))
            ) : (
              <li className="rounded-lg bg-morgo-card px-3 py-3 text-center text-sm text-morgo-navy/50 shadow-sm">
                아직 클리어한 룰렛이 없어요. 하나 도전해볼까요?
              </li>
            )}
          </ul>

          <button
            type="button"
            onClick={share}
            disabled={busy}
            className="mt-4 min-h-[48px] w-full rounded-xl bg-morgo-navy font-extrabold text-white disabled:opacity-60"
          >
            {busy ? "이미지 만드는 중…" : "📸 인스타 스토리로 공유"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 w-full py-2 text-sm text-morgo-navy/50"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
