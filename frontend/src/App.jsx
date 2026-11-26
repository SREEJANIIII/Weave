import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SvgSprite } from './components/Icons';
import { HomePage } from './pages/HomePage';
import { DevelopersPage } from './pages/DevelopersPage';
import { WorkspacePage } from './pages/WorkspacePage';

function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, hash]);

  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <SvgSprite />
      <ScrollManager />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/developers" element={<DevelopersPage />} />
        <Route path="/developers.html" element={<DevelopersPage />} />
        <Route path="/app" element={<WorkspacePage />} />
        <Route path="/app.html" element={<WorkspacePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

