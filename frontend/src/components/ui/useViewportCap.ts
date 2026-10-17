import { useCallback, useRef } from 'react';

// Sizes a sticky side panel on large screens: height = min(90% of the viewport, space from its
// current top to `gap` px above the bottom), so it is always tall but never crosses the screen edge,
// even before it sticks. Below 1024px the inline height is cleared and CSS takes over.
export const useViewportCap = (gap = 16, ratio = 0.9) => {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback(
    (node: HTMLElement | null) => {
      cleanup.current?.();
      cleanup.current = null;
      if (!node) return;
      const wide = window.matchMedia('(min-width: 1024px)');
      let frame = 0;
      const update = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (!wide.matches) {
            node.style.height = '';
            return;
          }
          const top = Math.max(node.getBoundingClientRect().top, gap);
          const available = window.innerHeight - top - gap;
          node.style.height = `${Math.max(240, Math.min(window.innerHeight * ratio, available))}px`;
        });
      };
      update();
      window.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      wide.addEventListener('change', update);
      cleanup.current = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('scroll', update);
        window.removeEventListener('resize', update);
        wide.removeEventListener('change', update);
      };
    },
    [gap, ratio],
  );
};
