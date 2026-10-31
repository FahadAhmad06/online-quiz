import Icon from './Icon';
// Small "is this page still updating?" line for a usePoll() state. Nothing when polling finished.
export default function LiveStatus({ live, onResume }) {
  if (live === 'live') return <span className="live-status" role="status"><i className="live-dot" />Updating automatically</span>;
  if (live === 'retrying') return <span className="live-status warn" role="status"><span className="spinner" />Connection lost — reconnecting…</span>;
  if (live === 'idle' || live === 'error') return (
    <span className="live-status" role="status">
      <Icon name="info" size={14} />{live === 'idle' ? 'Live updates paused.' : 'Could not refresh.'}
      <button className="link" onClick={onResume}>Refresh now</button>
    </span>
  );
  return null;
}
