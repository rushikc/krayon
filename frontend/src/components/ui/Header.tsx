import { Link } from 'react-router-dom';
import { usePalette } from '../../paletteState.ts';
import { useUpload } from '../../study/uploadState.tsx';
import { LogoMark } from './icons.tsx';

const itemClass = 'shrink-0 text-[15px] font-medium text-ink';

export function Header() {
  const { prefix } = usePalette();
  const { openUpload } = useUpload();
  const home = prefix || '/';

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 py-2">
      <Link to={home} className="flex items-center gap-2 font-serif text-[1.65rem] leading-none text-ink">
        <LogoMark />
        Krayon
      </Link>
      <nav
        aria-label="Primary"
        className="order-3 flex w-full gap-5 overflow-x-auto sm:order-none sm:w-auto sm:flex-1 sm:justify-center"
      >
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
      <span
        aria-hidden="true"
        className="ml-auto flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] border-ink bg-yellow text-[15px] font-semibold text-ink shadow-[2px_2px_0_var(--color-ink)] sm:ml-0"
      >
        R
      </span>
    </header>
  );
}
