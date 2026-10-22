import { Link } from 'react-router-dom';
import Icon from './Icon';
export default function Footer() {
  return (
    <footer className="pfoot">
      <div className="pfoot-in">
        <div className="brand" style={{ padding: 0 }}>
          <span className="mark"><Icon name="cap" size={18} /></span>
          <span><b>QuizRoom</b><small>Fair online MCQ exams</small></span>
        </div>
        <nav className="pfoot-links" aria-label="Footer">
          <Link to="/">Home</Link>
          <Link to="/student-login">Student login</Link>
          <Link to="/student-register">Register</Link>
          <Link to="/admin-login">Admin</Link>
        </nav>
        <div className="pfoot-meta">
          <p className="credit">Developed with <span className="heart" aria-label="love">♥</span> by <b>Fahad Ahmad</b></p>
          <p className="muted small-text" style={{ margin: 0 }}>© {new Date().getFullYear()} QuizRoom</p>
        </div>
      </div>
    </footer>
  );
}
