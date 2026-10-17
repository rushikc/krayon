import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { apiFetch, useBackendPipeline } from './lib/api.ts';
import { HomePage } from './pages/HomePage.tsx';
import { LessonPage } from './pages/LessonPage.tsx';
import { PalettePreview } from './pages/PalettePreview.tsx';
import { RoadmapPage } from './pages/RoadmapPage.tsx';
import { LocalStudyProvider } from './study/localStudy.tsx';
import { StudySessionProvider } from './study/StudySession.tsx';
import { UploadProvider } from './study/uploadState.tsx';

type Health = { ok: boolean; adc?: { ok: boolean; error?: string }; renderer?: { ok: boolean; error?: string } };

function HealthBanner() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!useBackendPipeline) return;
    const pending = (health: Health) =>
      health.adc?.error?.startsWith('Checking') || health.renderer?.error === 'Starting the renderer.';
    void (async () => {
      try {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const health = await apiFetch<Health>('/api/health');
          if (health.ok) return;
          if (!pending(health) || attempt === 4) {
            setMessage(health.adc?.error ?? health.renderer?.error ?? 'Krayon is not ready.');
            return;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 400));
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Could not reach the Krayon backend.');
      }
    })();
  }, []);
  if (!message) return null;
  return <div className="bg-amber-100 px-6 py-2 text-sm text-amber-950">{message}</div>;
}

export default function App() {
  return (
    <BrowserRouter>
      <StudySessionProvider>
        <LocalStudyProvider>
          <UploadProvider>
            <HealthBanner />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/study" element={<RoadmapPage />} />
              <Route path="/study/:topicId" element={<LessonPage />} />
              <Route path="/topics/:topicId" element={<RoadmapPage />} />
              <Route path="/topics/:topicId/:subtopicId" element={<LessonPage />} />
              <Route path="/preview/:paletteId" element={<PalettePreview />}>
                <Route index element={<HomePage />} />
                <Route path="topics/:topicId" element={<RoadmapPage />} />
                <Route path="topics/:topicId/:subtopicId" element={<LessonPage />} />
              </Route>
            </Routes>
          </UploadProvider>
        </LocalStudyProvider>
      </StudySessionProvider>
    </BrowserRouter>
  );
}
