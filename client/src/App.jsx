import './style.css';
import './public.css';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useTheme from './hooks/useTheme';
import Header from './components/Header';
import Footer from './components/Footer';
import RequireAdmin from './components/RequireAdmin';
import RequireStudent from './components/RequireStudent';
import AdminLayout from './components/AdminLayout';
import { FeedbackProvider } from './components/Feedback';
import Home from './pages/Home';
import AdminLogin from './pages/AdminLogin';
import StudentLogin from './pages/StudentLogin';
import StudentRegister from './pages/StudentRegister';
import StudentDashboard from './pages/StudentDashboard';
import Join from './pages/Join';
import Test from './pages/Test';
import Result from './pages/Result';
import NotFound from './pages/NotFound';
import Dashboard from './pages/admin/Dashboard';
import Papers from './pages/admin/Papers';
import NewPaper from './pages/admin/NewPaper';
import EditPaper from './pages/admin/EditPaper';
import PaperDetail from './pages/admin/PaperDetail';
import Results from './pages/admin/Results';
import Rolls from './pages/admin/Rolls';
import Students from './pages/admin/Students';
import Schedule from './pages/admin/Schedule';
import Retakes from './pages/admin/Retakes';
import Settings from './pages/admin/Settings';

function Shell() {
  const [theme, toggleTheme] = useTheme();
  const { pathname } = useLocation();
  const admin = pathname === '/admin' || pathname.startsWith('/admin/'); // not /admin-login
  const width = admin || pathname === '/' ? 'full'
    : ['/dashboard', '/result', '/student-login', '/student-register', '/admin-login'].includes(pathname) ? 'wide'
    : pathname === '/test' ? 'exam' : 'narrow';
  return (<>
    {!admin && <Header theme={theme} onToggleTheme={toggleTheme} />}
    <main className={width + (admin ? '' : ' public')}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/student-login" element={<StudentLogin />} />
        <Route path="/student-register" element={<StudentRegister />} />
        <Route path="/dashboard" element={<RequireStudent><StudentDashboard /></RequireStudent>} />
        <Route path="/join/:code" element={<RequireStudent><Join /></RequireStudent>} />
        <Route path="/test" element={<Test />} />
        <Route path="/result" element={<Result />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout theme={theme} onToggleTheme={toggleTheme} /></RequireAdmin>}>
          <Route index element={<Dashboard />} />
          <Route path="papers" element={<Papers />} />
          <Route path="papers/new" element={<NewPaper />} />
          <Route path="papers/:id" element={<PaperDetail />} />
          <Route path="papers/:id/edit" element={<EditPaper />} />
          <Route path="results" element={<Results />} />
          <Route path="rolls" element={<Rolls />} />
          <Route path="students" element={<Students />} />
          <Route path="schedule" element={<Schedule />} />
          <Route path="retakes" element={<Retakes />} />
          <Route path="settings" element={<Settings />} />
          <Route path="admins" element={<Navigate to="/admin/settings" replace />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
    {!admin && pathname !== '/test' && <Footer />}
  </>);
}

export default function App() {
  return <BrowserRouter><FeedbackProvider><Shell /></FeedbackProvider></BrowserRouter>;
}
