import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
export default function NotFound() {
  return (
    <div className="card center-card fade-up">
      <span className="ic purple big-ic"><Icon name="search" size={26} /></span>
      <h1>Page not found</h1>
      <p className="muted">The page you're looking for doesn't exist or has moved.</p>
      <Link className="btn" to="/"><Icon name="home" size={16} />Back to home</Link>
    </div>
  );
}
