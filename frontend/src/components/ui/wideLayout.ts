import { useEffect, useState } from 'react';

export const WIDE_LAYOUT_QUERY = '(min-width: 1200px)';

export function isWideLayout() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_LAYOUT_QUERY).matches;
}

export function useWideLayout() {
  const [wide, setWide] = useState(isWideLayout);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(WIDE_LAYOUT_QUERY);
    const onChange = () => setWide(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return wide;
}
