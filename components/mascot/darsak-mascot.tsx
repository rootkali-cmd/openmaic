/**
 * The Darsak mascot — a small graduating study companion.
 *
 * Hand-drawn as SVG (no paid or third-party art, no extra runtime): the
 * purple body carries the brand, the tasseled cap says "student", and the
 * eyes blink through the `darsak-mascot-eyes` keyframes in globals.css. The
 * gold sparkle is a nod to the star it replaced in the sidebar brand.
 */
export function DarsakMascot({
  className = 'size-8',
  animated = true,
}: {
  className?: string;
  /** Blink; keep false for static marks (favicons, docs). */
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 96 96"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="دارس"
    >
      {/* graduation cap — board, band and gold tassel */}
      <path d="M14 24 48 10l34 14-34 14Z" fill="#2E2166" />
      <path d="M30 29.2V37c0 5.6 8 10 18 10s18-4.4 18-10v-7.8L48 36.4Z" fill="#3B2A85" />
      <circle cx="82" cy="23.5" r="2.6" fill="#FFD84D" />
      <path d="M82 26c4 5 4 11 2.5 16" stroke="#FFD84D" strokeWidth="2" strokeLinecap="round" />
      <circle cx="84.5" cy="44" r="2.2" fill="#FFD84D" />

      {/* head + soft top light */}
      <rect x="14" y="32" width="68" height="58" rx="26" fill="#8F76E8" />
      <ellipse cx="38" cy="44" rx="16" ry="8" fill="#A995F2" opacity=".55" />

      {/* face plate */}
      <rect x="22" y="43" width="52" height="39" rx="18" fill="#F6F3FF" />

      {/* eyes (the blink group) */}
      <g className={animated ? 'darsak-mascot-eyes' : undefined}>
        <ellipse cx="38" cy="58" rx="4.4" ry="6" fill="#241A4D" />
        <ellipse cx="58" cy="58" rx="4.4" ry="6" fill="#241A4D" />
        <circle cx="39.6" cy="56" r="1.6" fill="#FFFFFF" />
        <circle cx="59.6" cy="56" r="1.6" fill="#FFFFFF" />
      </g>

      {/* cheeks + smile */}
      <ellipse cx="29" cy="68" rx="4" ry="2.4" fill="#FF9DBB" opacity=".55" />
      <ellipse cx="67" cy="68" rx="4" ry="2.4" fill="#FF9DBB" opacity=".55" />
      <path d="M42 67.5q6 6 12 0" stroke="#241A4D" strokeWidth="2.4" strokeLinecap="round" />

      {/* gold sparkle — the star it replaced */}
      <path
        d="M88 8c.5 2.6 1.9 4 4.5 4.5-2.6.5-4 1.9-4.5 4.5-.5-2.6-1.9-4-4.5-4.5 2.6-.5 4-1.9 4.5-4.5Z"
        fill="#FFE9A3"
      />
    </svg>
  );
}
