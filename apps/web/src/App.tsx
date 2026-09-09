import { Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';

/**
 * «Узкий» банковский UI: центрированная колонка (max-w-app).
 */
export function App() {
  return (
    <div className="min-h-screen bg-gray-50 flex justify-center">
      <div className="w-full max-w-app px-4 py-6">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </div>
    </div>
  );
}