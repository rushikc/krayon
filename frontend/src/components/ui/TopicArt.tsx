import type { ReactNode } from 'react';
import { cx } from './cx.ts';

const board = 'h-full w-full';

function InflationArt() {
  return (
    <svg viewBox="0 0 320 180" className={board} aria-hidden="true">
      <path d="M36 146h250" stroke="#f6f1e8" strokeWidth="3" strokeLinecap="round" />
      <path d="M48 146V36" stroke="#f6f1e8" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M58 128c28-8 36 18 62 8 24-10 30-36 58-28 22 6 34-22 62-48 16-14 28-18 40-16"
        fill="none"
        stroke="#f2c14e"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoneyArt() {
  return (
    <svg viewBox="0 0 320 180" className={board} aria-hidden="true">
      <circle cx="132" cy="90" r="42" fill="none" stroke="#f2c14e" strokeWidth="5" />
      <circle cx="188" cy="90" r="42" fill="none" stroke="#e4572e" strokeWidth="5" />
      <text x="150" y="100" textAnchor="middle" fill="#f2c14e" fontSize="32" fontFamily="Georgia, serif">
        $
      </text>
    </svg>
  );
}

function NetworkArt() {
  return (
    <svg viewBox="0 0 320 180" className={board} aria-hidden="true">
      <path d="M78 120l70-46 62 18 48-40" stroke="#f6f1e8" strokeWidth="2.5" strokeDasharray="5 6" fill="none" />
      <circle cx="78" cy="120" r="12" fill="#f2c14e" />
      <circle cx="148" cy="74" r="10" fill="#e4572e" />
      <circle cx="210" cy="92" r="9" fill="#3c9a55" />
      <circle cx="258" cy="52" r="8" fill="#f6f1e8" />
    </svg>
  );
}

function UnitArt() {
  return (
    <svg viewBox="0 0 320 180" className={board} aria-hidden="true">
      <path d="M48 138h230" stroke="#e4572e" strokeWidth="5" strokeLinecap="round" />
      <rect x="118" y="58" width="78" height="70" rx="6" fill="none" stroke="#f2c14e" strokeWidth="5" />
    </svg>
  );
}

function GenericArt() {
  return (
    <svg viewBox="0 0 320 180" className={board} aria-hidden="true">
      <path d="M48 132c40-48 72-20 104-52 28-28 52-8 88-36" fill="none" stroke="#f2c14e" strokeWidth="5" strokeLinecap="round" />
      <circle cx="232" cy="52" r="10" fill="#e4572e" />
    </svg>
  );
}

const arts: Record<string, () => ReactNode> = {
  'inflation-and-interest-rates': InflationArt,
  'how-a-company-makes-money': MoneyArt,
  'how-the-internet-works': NetworkArt,
  'unit-economics': UnitArt,
};

export function TopicArt({ topicId, className }: { topicId: string; className?: string }) {
  const Art = arts[topicId] ?? GenericArt;
  return (
    <div className={cx('relative overflow-hidden rounded-xl bg-chalk', className)}>
      <Art />
    </div>
  );
}
