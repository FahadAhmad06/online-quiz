export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}
