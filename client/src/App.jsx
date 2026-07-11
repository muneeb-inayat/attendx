import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import InstallPrompt from './components/InstallPrompt';

// Pages
import Login from './pages/Login'; // Student Login (main page)
import PendingApproval from './pages/PendingApproval';

// Admin Pages
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/Dashboard';
import AdminCourses from './pages/admin/Courses';
import AdminStudents from './pages/admin/Students';
import AdminCourseDetail from './pages/admin/CourseDetail';
import AdminSessionDetail from './pages/admin/SessionDetail';
import SuspiciousAttendance from './pages/admin/SuspiciousAttendance';
import StudentAudit from './pages/admin/StudentAudit';

// Student Pages
import StudentDashboard from './pages/student/StudentDashboard';
import StudentProfile from './pages/student/StudentProfile';
import Attend from './pages/Attend';
import Scan from './pages/Scan';

// Professor Pages
import ProfessorLogin from './pages/professor/ProfessorLogin';
import ProfessorDashboard from './pages/professor/ProfessorDashboard';
import ProfessorProfile from './pages/professor/ProfessorProfile';
import SessionLive from './pages/professor/SessionLive';
import CourseAttendance from './pages/professor/CourseAttendance';

import ChangePassword from "./pages/ChangePassword";

import './index.css';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={true}
            theme="colored"
          />
          <InstallPrompt />
          <Routes>
            {/* Public Login Pages */}
            <Route path="/" element={<Login />} />
            <Route path="/professor/login" element={<ProfessorLogin />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/pending-approval" element={<PendingApproval />} />

            {/* Student Routes */}
            <Route
               path="/student/change-password"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <ChangePassword />
                </ProtectedRoute>
              }
            />

            <Route path="/student/dashboard" element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentDashboard />
              </ProtectedRoute>
            } />

            <Route path="/student/scan" element={
              <ProtectedRoute allowedRoles={['student']}>
                <Attend />
              </ProtectedRoute>
            } />
            <Route path="/student/attend" element={
              <ProtectedRoute allowedRoles={['student']}>
                <Attend />
              </ProtectedRoute>
            } />
            <Route path="/student/scan-qr" element={
              <ProtectedRoute allowedRoles={['student']}>
                <Scan />
              </ProtectedRoute>
            } />
            <Route path="/student/profile" element={
              <ProtectedRoute allowedRoles={['student']}>
                <StudentProfile />
              </ProtectedRoute>
            } />

            {/* Professor Routes */}
            <Route path="/professor/dashboard" element={
              <ProtectedRoute allowedRoles={['professor']}>
                <ProfessorDashboard />
              </ProtectedRoute>
            } />
            <Route path="/professor/profile" element={
              <ProtectedRoute allowedRoles={['professor']}>
                <ProfessorProfile />
              </ProtectedRoute>
            } />
            <Route path="/professor/session/:id" element={
              <ProtectedRoute allowedRoles={['professor']}>
                <SessionLive />
              </ProtectedRoute>
            } />
            <Route path="/professor/course/:courseId/attendance" element={
              <ProtectedRoute allowedRoles={['professor']}>
                <CourseAttendance />
              </ProtectedRoute>
            } />

            {/* Admin Routes */}
            <Route path="/admin/dashboard" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
            <Route path="/admin/students" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminStudents />
              </ProtectedRoute>
            } />
            <Route path="/admin/courses" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminCourses />
              </ProtectedRoute>
            } />
            <Route path="/admin/course/:id" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminCourseDetail />
              </ProtectedRoute>
            } />
            <Route path="/admin/session/:id" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminSessionDetail />
              </ProtectedRoute>
            } />
            <Route path="/admin/suspicious" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <SuspiciousAttendance />
              </ProtectedRoute>
            } />
            <Route path="/admin/audit/:studentId" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <StudentAudit />
              </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
