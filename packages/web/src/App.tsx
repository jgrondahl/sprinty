import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectPage } from './pages/ProjectPage';
import { SprintViewerPage } from './pages/SprintViewerPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { ProductGoalsPage } from './pages/ProductGoalsPage';
import { BacklogPage } from './pages/BacklogPage';
import { IncrementPage } from './pages/IncrementPage';
import { SprintReviewPage } from './pages/SprintReviewPage';
import { RetrospectivePage } from './pages/RetrospectivePage';
import { DeliveryRecordsPage } from './pages/DeliveryRecordsPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/projects/:projectId/sprint" element={<SprintViewerPage />} />
          <Route path="/projects/:projectId/product-goals" element={<ProductGoalsPage />} />
          <Route path="/projects/:projectId/backlog" element={<BacklogPage />} />
          <Route path="/projects/:projectId/sprints/:sprintId/increment" element={<IncrementPage />} />
          <Route path="/projects/:projectId/sprints/:sprintId/review" element={<SprintReviewPage />} />
          <Route path="/projects/:projectId/sprints/:sprintId/retrospective" element={<RetrospectivePage />} />
          <Route path="/projects/:projectId/delivery-records" element={<DeliveryRecordsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
