import type { ReactNode } from 'react';
import { AddDocsPopup } from '../AddDocsPopup.tsx';
import { useUpload } from '../../study/uploadState.tsx';
import { Header } from './Header.tsx';

export function Shell({
  children,
  fill = false,
  bare = false,
}: {
  children: ReactNode;
  fill?: boolean;
  bare?: boolean;
}) {
  const { open, closeUpload } = useUpload();

  if (fill && bare) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden bg-chalk">
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        {open && <AddDocsPopup onClose={closeUpload} />}
      </div>
    );
  }

  if (fill) {
    return (
      <div className="flex h-dvh flex-col">
        <div className="mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden px-6 pt-2 pb-[4vh] min-[1600px]:w-[90%] min-[1600px]:px-0">
          <Header />
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
        {open && <AddDocsPopup onClose={closeUpload} />}
      </div>
    );
  }

  return (
    <div className="min-h-full px-4 py-2 sm:px-6 sm:py-3 min-[1600px]:px-0">
      <div className="page-wrap min-[1600px]:w-[70vw]">
        <Header />
        {children}
      </div>
      {open && <AddDocsPopup onClose={closeUpload} />}
    </div>
  );
}
