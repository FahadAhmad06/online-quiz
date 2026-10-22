import Icon from './Icon';
export default function ErrorBox({ message, onRetry }) {
  return (
    <div className="card" role="alert">
      <p className="err" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 0 }}><Icon name="alert" />{message}</p>
      {onRetry && <button className="ghost" onClick={onRetry}>Try again</button>}
    </div>
  );
}
