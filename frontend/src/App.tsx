import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { FdrListPage } from './pages/FdrListPage';
import { FdrDetailPage } from './pages/FdrDetailPage';
import { NewFdrPage } from './pages/NewFdrPage';
import { OfficerQueuePage } from './pages/OfficerQueuePage';
import { AdminPage } from './pages/AdminPage';
import { getCurrentUser } from './api';

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const user = getCurrentUser();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="fdrs" element={<FdrListPage />} />
          <Route path="fdrs/new" element={<NewFdrPage />} />
          <Route path="fdrs/:id" element={<FdrDetailPage />} />
          <Route path="scrutiny" element={<OfficerQueuePage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
