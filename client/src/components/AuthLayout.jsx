import Icon from './Icon';
// Split card for login / registration: brand panel on the left (hidden on phones), form on the right.
export default function AuthLayout({ icon = 'user', title, subtitle, points, children, footer }) {
  return (
    <div className="auth fade-up">
      <aside className="auth-side" aria-hidden="true">
        <span className="mark lg"><Icon name="cap" size={28} /></span>
        <h2>QuizRoom</h2>
        <p>Fair, focused online exams.</p>
        <ul>{points.map(p => <li key={p}><Icon name="checkCircle" size={18} />{p}</li>)}</ul>
      </aside>
      <div className="auth-main">
        <span className="ic purple auth-ic"><Icon name={icon} size={22} /></span>
        <h1>{title}</h1>
        {subtitle && <p className="muted" style={{ marginTop: 0 }}>{subtitle}</p>}
        {children}
        {footer && <div className="auth-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Alert({ kind = 'bad', children }) {
  if (!children) return null;
  return (
    <div className={'alert ' + kind} role={kind === 'bad' ? 'alert' : 'status'}>
      <Icon name={kind === 'ok' ? 'checkCircle' : kind === 'warn' ? 'info' : 'alert'} size={18} /><span>{children}</span>
    </div>
  );
}
