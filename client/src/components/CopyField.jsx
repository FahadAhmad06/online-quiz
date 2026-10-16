import { useState } from 'react';
export default function CopyField({ label, value }) {
  const [done, setDone] = useState(false);
  const copy = () => navigator.clipboard.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); });
  return (<>
    <div className="muted">{label}</div>
    <div className="copy"><code>{value}</code><button className="small" onClick={copy}>{done ? 'Copied' : 'Copy'}</button></div>
  </>);
}
