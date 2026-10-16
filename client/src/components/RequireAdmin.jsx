import { Navigate } from 'react-router-dom';
import load from '../utils/load';
// Redirects to login if not logged in; with `owner`, redirects non-owner admins to the dashboard.
export default function RequireAdmin({ owner, children }) {
  const s = load('qr_admin', null, sessionStorage);
  if (!s) return <Navigate to="/admin-login" replace />;
  if (owner && !s.isSuper) return <Navigate to="/admin" replace />;
  return children;
}
