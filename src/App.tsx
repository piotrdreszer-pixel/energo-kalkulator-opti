import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AdminRoute } from "@/components/auth/AdminRoute";

// Pages
import Auth from "./pages/Auth";
import VerifyEmail from "./pages/VerifyEmail";
import ResetPassword from "./pages/ResetPassword";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import AnalysisForm from "./pages/AnalysisForm";
import AnalysisReport from "./pages/AnalysisReport";
import RatesManagement from "./pages/admin/RatesManagement";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Auth routes */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected routes */}
            <Route
              path="/projects"
              element={
                <ProtectedRoute>
                  <Projects />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId"
              element={
                <ProtectedRoute>
                  <ProjectDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/analysis/:analysisId"
              element={
                <ProtectedRoute>
                  <AnalysisForm />
                </ProtectedRoute>
              }
            />
            <Route
              path="/projects/:projectId/analysis/:analysisId/report"
              element={
                <ProtectedRoute>
                  <AnalysisReport />
                </ProtectedRoute>
              }
            />

            {/* Admin routes */}
            <Route
              path="/admin/rates"
              element={
                <AdminRoute>
                  <RatesManagement />
                </AdminRoute>
              }
            />

            {/* Redirect root to projects */}
            <Route path="/" element={<Navigate to="/projects" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
