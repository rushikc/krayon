import type { ReactNode } from 'react';
import { Header } from './Header.tsx';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full px-4 py-4 sm:px-6 sm:py-5">
      <div className="page-wrap">
        <Header />
        {children}
      </div>
    </div>
  );
}
