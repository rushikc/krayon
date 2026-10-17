import { Link } from 'react-router-dom';
import { usePalette } from '../../paletteState.ts';
import { useUpload } from '../../study/uploadState.tsx';
import { apiFetch } from '../../lib/api.ts';
import { LogoMark } from './icons.tsx';

const itemClass = 'shrink-0 text-[14px] font-medium text-ink';

export function Header() {
  const { prefix } = usePalette();
  const { openUpload } = useUpload();
  const home = prefix || '/';

  // Local dev: wipe the backend and this browser's copies, so nothing re-seeds the backend.
  const clearResources = async () => {
    if (!window.confirm('Clear all lessons, uploads, notes and progress? This cannot be undone.')) return;
    try {
      await apiFetch('/api/admin/reset', { method: 'POST' });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not clear resources.');
      return;
    }
    for (const store of [localStorage, sessionStorage]) {
      Object.keys(store)
        .filter((key) => key.startsWith('krayon.'))
        .forEach((key) => store.removeItem(key));
    }
    window.location.reload();
  };

  return (
    <header className="flex items-center gap-x-3 py-1">
      <Link to={home} className="flex shrink-0 items-center gap-1.5 font-serif text-[1.35rem] leading-none text-ink">
        <LogoMark className="h-6 w-6" />
        Krayon
      </Link>
      <nav aria-label="Primary" className="flex min-w-0 flex-1 gap-4 overflow-x-auto sm:justify-center">
        <Link to={home} className={itemClass}>
          Library
        </Link>
        <Link to={{ pathname: home, search: 'filter=progress' }} className={itemClass}>
          My lessons
        </Link>
        <button type="button" onClick={() => openUpload()} className={itemClass}>
          Sources
        </button>
      </nav>
      <button
        type="button"
        onClick={() => void clearResources()}
        className="ml-auto text-[13px] font-medium text-muted sm:ml-0"
      >
        Clear resources
      </button>
      <span
        aria-hidden="true"
        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-yellow text-[13px] font-semibold text-ink"
      >
        R
      </span>
    </header>
  );
}
