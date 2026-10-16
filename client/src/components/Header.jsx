import { Link } from 'react-router-dom';
export default function Header({ theme, onToggleTheme }) {
  return (
    <header>
      <Link className="logo" to="/">QuizRoom</Link>
      <div className="row">
        <Link className="btn ghost small" to="/">Home</Link>
        <button className="ghost small" onClick={onToggleTheme}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</button>
      </div>
    </header>
  );
}
