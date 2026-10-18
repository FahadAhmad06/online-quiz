import { Navigate, useLocation } from 'react-router-dom';
import load from '../utils/load';
// Redirects to student login if not logged in, preserving where to come back to afterwards.
export default function RequireStudent({ children }) {
  const location = useLocation();
  const s = load('qr_student', null, sessionStorage);
  if (!s) return <Navigate to={'/student-login?next=' + encodeURIComponent(location.pathname)} replace />;
  return children;
}
