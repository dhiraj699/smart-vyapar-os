const TONES = {
  green: { cls: 'bg-leaf-light text-leaf border-leaf/30', dot: 'bg-leaf', label: 'Safe for credit' },
  yellow: { cls: 'bg-haldi-light text-[#7A5600] border-haldi/50', dot: 'bg-haldi', label: 'Limit warning' },
  red: { cls: 'bg-chilli-light text-chilli-dark border-chilli/30', dot: 'bg-chilli', label: 'Restricted' },
};

export const trustTone = (score) => {
  const num = Number(score);
  if (isNaN(num)) return 'yellow';
  return num >= 4 ? 'green' : num >= 3 ? 'yellow' : 'red';
};

export default function TrustBadge({ score, className = '' }) {
  const safeScore = score !== undefined && score !== null && !isNaN(Number(score)) ? Number(score) : 5;
  const tone = TONES[trustTone(safeScore)] || TONES.yellow;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tone.cls} ${className}`}
      title={`Trust score ${safeScore.toFixed(1)} / 5`}
    >
      <span className={`h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
      {tone.label} · {safeScore.toFixed(1)}★
    </span>
  );
}
