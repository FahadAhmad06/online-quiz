import './style.css';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import useTheme from './hooks/useTheme';
import Header from './components/Header';
import RequireAdmin from './components/RequireAdmin';
import RequireStudent from './components/RequireStudent';
import AdminLayout from './components/AdminLayout';
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
import PaperDetail from './pages/admin/PaperDetail';
import Results from './pages/admin/Results';
import Admins from './pages/admin/Admins';
import Rolls from './pages/admin/Rolls';

function Shell() {
  const [theme, toggleTheme] = useTheme();
  const wide = useLocation().pathname.startsWith('/admin');
  return (<>
    <Header theme={theme} onToggleTheme={toggleTheme} />
    <main className={wide ? '' : 'narrow'}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/student-login" element={<StudentLogin />} />
        <Route path="/student-register" element={<StudentRegister />} />
        <Route path="/dashboard" element={<RequireStudent><StudentDashboard /></RequireStudent>} />
        <Route path="/join/:code" element={<RequireStudent><Join /></RequireStudent>} />
        <Route path="/test" element={<Test />} />
        <Route path="/result" element={<Result />} />
        <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
          <Route index element={<Dashboard />} />
          <Route path="papers" element={<Papers />} />
          <Route path="papers/new" element={<NewPaper />} />
          <Route path="papers/:id" element={<PaperDetail />} />
          <Route path="results" element={<Results />} />
          <Route path="rolls" element={<Rolls />} />
          <Route path="admins" element={<RequireAdmin owner><Admins /></RequireAdmin>} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </main>
  </>);
}

export default function App() {
  return <BrowserRouter><Shell /></BrowserRouter>;
}
