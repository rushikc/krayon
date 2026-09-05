import { Route, Routes } from "react-router-dom";

import { Toaster } from "@/components/ui/toaster";
import { useAppInit } from "@/hooks/useFolderLoader";
import { DashboardPage } from "@/pages/DashboardPage";
import { EditorPage } from "@/pages/EditorPage";

function AppRoutes() {
  useAppInit();

  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/editor/:mediaId" element={<EditorPage />} />
    </Routes>
  );
}

export default function App() {
  return (
    <>
      <AppRoutes />
      <Toaster />
    </>
  );
}
