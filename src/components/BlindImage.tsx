// 블라인드 카드용 placeholder 이미지 (Phase 1: 외부 이미지 없이 그라디언트)
export default function BlindImage({
  theme,
  className = "",
}: {
  theme: { from: string; to: string; emoji: string };
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center ${className}`}
      style={{
        background: `linear-gradient(135deg, ${theme.from}, ${theme.to})`,
      }}
    >
      <span className="text-5xl drop-shadow-sm">{theme.emoji}</span>
    </div>
  );
}
