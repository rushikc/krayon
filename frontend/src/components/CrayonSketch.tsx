export function CrayonSketch() {
  return (
    <section
      className="rounded-[28px] border-2 border-ink/15 bg-paper px-8 py-14"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-lg flex-col items-center">
        <svg viewBox="0 0 420 220" className="w-full max-w-md" aria-hidden="true">
          <g className="crayon-draw" fill="none" stroke="#1f1b16" strokeWidth="2.5" strokeLinejoin="round">
            <rect x="78" y="28" width="300" height="46" rx="14" strokeOpacity="0.35" />
            <rect x="78" y="86" width="300" height="46" rx="14" strokeOpacity="0.28" />
            <rect x="78" y="144" width="300" height="46" rx="14" strokeDasharray="6 7" strokeOpacity="0.22" />
          </g>
          <g className="crayon-walk">
            <path d="M6 28c10-16 22-16 30-2 6 10-2 16-10 18" fill="#e4572e" />
            <path d="M18 42l8 22" stroke="#1f1b16" strokeWidth="3" strokeLinecap="round" />
            <path d="M14 64h16" stroke="#f2c14e" strokeWidth="4" strokeLinecap="round" />
          </g>
        </svg>
        <p className="mt-6 text-center font-serif text-[22px] text-ink">Drawing the lessons from your notes.</p>
      </div>
    </section>
  );
}
