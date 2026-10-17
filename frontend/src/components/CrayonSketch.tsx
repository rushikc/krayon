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
            <g className="crayon-turn">
              <path d="M0 0 L-6.5 -15 H6.5 Z" fill="#e4572e" />
              <rect x="-4.6" y="-31" width="9.2" height="16" rx="1.6" fill="#1f1b16" />
              <rect x="-4.6" y="-23.5" width="9.2" height="4" fill="#f2c14e" />
            </g>
          </g>
        </svg>
        <p className="mt-6 text-center font-serif text-[22px] text-ink">Drawing the lessons from your notes.</p>
      </div>
    </section>
  );
}
