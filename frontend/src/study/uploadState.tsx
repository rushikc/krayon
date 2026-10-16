import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

type UploadContextValue = {
  open: boolean;
  topicId: string | null;
  openUpload: (topicId?: string) => void;
  closeUpload: () => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [topicId, setTopicId] = useState<string | null>(null);

  const value = useMemo<UploadContextValue>(
    () => ({
      open,
      topicId,
      openUpload: (next) => {
        setTopicId(next ?? null);
        setOpen(true);
      },
      closeUpload: () => setOpen(false),
    }),
    [open, topicId],
  );

  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}

export const useUpload = () => {
  const value = useContext(UploadContext);
  if (!value) throw new Error('Upload provider is missing.');
  return value;
};
