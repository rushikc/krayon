import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage.tsx';
import { PalettePreview } from './pages/PalettePreview.tsx';
import { RoadmapPage } from './pages/RoadmapPage.tsx';
import { StudySessionProvider } from './study/StudySession.tsx';
import { UploadProvider } from './study/uploadState.tsx';

export default function App() {
  return (
    <BrowserRouter>
      <StudySessionProvider>
        <UploadProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/study" element={<RoadmapPage />} />
            <Route path="/topics/:topicId" element={<RoadmapPage />} />
            <Route path="/preview/:paletteId" element={<PalettePreview />}>
              <Route index element={<HomePage />} />
              <Route path="topics/:topicId" element={<RoadmapPage />} />
            </Route>
          </Routes>
        </UploadProvider>
      </StudySessionProvider>
    </BrowserRouter>
  );
}
