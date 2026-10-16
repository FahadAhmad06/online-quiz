export default function ErrorBox({ message, onRetry }) {
  return (
    <div className="card" role="alert">
      <p className="err">{message}</p>
      {onRetry && <button className="ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}
