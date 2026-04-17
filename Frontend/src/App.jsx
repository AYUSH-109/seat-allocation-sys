// frontend/src/App.jsx
import React, { Suspense, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SessionProvider, useSession } from './contexts/SessionContext';

// --- Components ---
import Toast from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
const Navbar = React.lazy(() => import('./components/Navbar'));
const Footer = React.lazy(() => import('./components/Footer'));
const SessionRecoveryModal = React.lazy(() => import('./components/SessionRecoveryModal'));

// --- Pages (lazy-loaded for better initial performance) ---
const LandingPage = React.lazy(() => import('./pages/LandingPage'));
const LoginPage = React.lazy(() => import('./pages/LoginPage'));
const SignupPage = React.lazy(() => import('./pages/SignupPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const UploadPage = React.lazy(() => import('./pages/UploadPage'));
const Allocation = React.lazy(() => import('./pages/Allocation'));
const CreatePlan = React.lazy(() => import('./pages/CreatePlan'));
const FeedbackPage = React.lazy(() => import('./pages/FeedbackPage'));
const AdminFeedbackPage = React.lazy(() => import('./pages/AdminFeedbackPage'));
const AboutusPage = React.lazy(() => import('./pages/AboutusPage'));
const TemplateEditor = React.lazy(() => import('./pages/TemplateEditor'));
const AttendancePage = React.lazy(() => import('./pages/AttendencePage'));
const MoreOptionsPage = React.lazy(() => import('./pages/MoreOptionsPage'));
const ClassroomPage = React.lazy(() => import('./pages/ClassroomPage'));
const DatabaseManager = React.lazy(() =>
  import('./components/database').then((module) => ({ default: module.DatabaseManager }))
);
const ManualAllocation = React.lazy(() => import('./pages/ManualAllocation'));

// -------------------------------------------------------------------
// ROUTE OUTLET LAYOUT
// -------------------------------------------------------------------
const RouteOutletLayout = ({ showToast }) => {
  return <Outlet context={{ showToast }} />;
};

// -------------------------------------------------------------------
// PROTECTED ROUTE (Clean, no nesting issues)
// -------------------------------------------------------------------
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#050505] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 dark:border-gray-700 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return user ? children : <Navigate to="/login" replace />;
};

// -------------------------------------------------------------------
// SESSION RECOVERY HANDLER
// -------------------------------------------------------------------
const SessionRecoveryHandler = () => {
  const sessionCtx = useSession();
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  const sessions = React.useMemo(() => {
    return Array.isArray(sessionCtx?.recoverableSessions) ? sessionCtx.recoverableSessions : [];
  }, [sessionCtx?.recoverableSessions]);

  React.useEffect(() => {
    if (sessions.length > 0) {
      setShowRecoveryModal(true);
    }
  }, [sessions]);

  if (!showRecoveryModal || sessions.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <SessionRecoveryModal onClose={() => setShowRecoveryModal(false)} />
    </Suspense>
  );
};

// -------------------------------------------------------------------
// ROOT LAYOUT (Navbar + Animated Content + Footer)
// -------------------------------------------------------------------
const RootLayout = ({ showToast }) => {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#050505] transition-colors duration-200">
      <SessionRecoveryHandler />
      <Suspense
        fallback={<div className="sticky top-0 z-40 h-[96px]" aria-hidden="true" />}
      >
        <Navbar />
      </Suspense>
      <main className="flex-1">
        <Suspense
          fallback={
            <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-live="polite">
              <div className="w-8 h-8 border-2 border-gray-200 dark:border-gray-700 border-t-orange-500 rounded-full animate-spin" />
            </div>
          }
        >
          <RouteOutletLayout showToast={showToast} />
        </Suspense>
      </main>
      <Suspense fallback={<div className="h-[170px]" aria-hidden="true" />}>
        <Footer />
      </Suspense>
    </div>
  );
};

const AuthLayout = ({ showToast }) => {
  return (
    <div className="min-h-screen bg-white dark:bg-[#050505] transition-colors duration-200">
      <main>
        <Suspense
          fallback={
            <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-live="polite">
              <div className="w-8 h-8 border-2 border-gray-200 dark:border-gray-700 border-t-orange-500 rounded-full animate-spin" />
            </div>
          }
        >
          <RouteOutletLayout showToast={showToast} />
        </Suspense>
      </main>
    </div>
  );
};

// -------------------------------------------------------------------
// APP ROUTES (Clean, no wrapper on each route)
// -------------------------------------------------------------------
const AppRoutes = () => {
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <>
      <Routes>
        {/* Root Layout wraps all routes - handles animation once */}
        <Route element={<RootLayout showToast={showToast} />}>

          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/aboutus" element={<AboutusPage showToast={showToast} />} />

          {/* Protected Routes - Clean syntax */}
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage showToast={showToast} /></ProtectedRoute>} />
          <Route path="/manual-allocation" element={<ProtectedRoute><ManualAllocation showToast={showToast} /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage showToast={showToast} /></ProtectedRoute>} />
          <Route path="/allocation" element={<ProtectedRoute><Allocation showToast={showToast} /></ProtectedRoute>} />
          <Route path="/create-plan" element={<ProtectedRoute><CreatePlan /></ProtectedRoute>} />
          <Route path="/classroom" element={<ProtectedRoute><ClassroomPage /></ProtectedRoute>} />
          <Route path="/feedback" element={<ProtectedRoute><FeedbackPage showToast={showToast} /></ProtectedRoute>} />
          <Route path="/admin-feedback" element={<ProtectedRoute><AdminFeedbackPage showToast={showToast} /></ProtectedRoute>} />
          <Route path="/template-editor" element={<ProtectedRoute><TemplateEditor showToast={showToast} /></ProtectedRoute>} />
          <Route path="/attendance/:planId" element={<ProtectedRoute><AttendancePage showToast={showToast} /></ProtectedRoute>} />
          <Route path="/more-options/:planId" element={<ProtectedRoute><MoreOptionsPage showToast={showToast} /></ProtectedRoute>} />
          <Route path="/database" element={<ProtectedRoute><DatabaseManager showToast={showToast} /></ProtectedRoute>} />

        </Route>

        {/* Auth routes without shell to improve login/signup performance */}
        <Route element={<AuthLayout showToast={showToast} />}>
          <Route path="/login" element={<LoginPage showToast={showToast} />} />
          <Route path="/signup" element={<SignupPage showToast={showToast} />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Toast - Outside routes */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
};

// -------------------------------------------------------------------
// APP CONTENT (Handles loading states)
// -------------------------------------------------------------------
const AppContent = () => {
  useAuth();
  useSession();

  return <AppRoutes />;
};

// -------------------------------------------------------------------
// ROOT APP
// -------------------------------------------------------------------
const App = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <SessionProvider>
            <Router>
              <AppContent />
            </Router>
          </SessionProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;