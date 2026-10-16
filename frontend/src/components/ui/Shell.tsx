import type { ReactNode } from 'react';
import { AddDocsPopup } from '../AddDocsPopup.tsx';
import { useUpload } from '../../study/uploadState.tsx';
import { Header } from './Header.tsx';

export function Shell({ children }: { children: ReactNode }) {
  const { open, closeUpload } = useUpload();

  return (
    <div className="min-h-full px-4 py-4 sm:px-6 sm:py-5">
      <div className="page-wrap">
        <Header />
        {children}
      </div>
      {open && <AddDocsPopup onClose={closeUpload} />}
    </div>
  );
}
