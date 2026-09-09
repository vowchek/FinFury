import { Navigate, Route, Routes } from 'react-router-dom';
import { useEffect } from 'react';
import { scheduleProactiveRefresh } from './api/session';
import { DashboardPage } from './pages/DashboardPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { useAuthStore } from './store/auth';

export function App() {
  const token = useAuthStore((s) => s.accessToken);

  // Проактивный refresh: планируем обновление до истечения access-токена.
  useEffect(() => {
    scheduleProactiveRefresh();
  }, [token]);

  return (
    <Routes>
      <Route
        path="/"
        element={token ? <Navigate to="/dashboard" replace /> : <LandingPage />}
      />
      <Route
        path="/dashboard"
        element={token ? <DashboardPage /> : <Navigate to="/login" replace />}
      />
      <Route path="/login" element={<LoginPage />} />
    </Routes>
  );
}