import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import api from '../utils/api';
import useOutside from '../hooks/useOutside';

// Searches papers (title/code), registered students (name/roll) and roll numbers using the existing
// /admin/papers and /admin/rolls lists, fetched when the box is first used and refreshed every 30s.
export default function GlobalSearch() {
  const navigate = useNavigate(), box = useRef(null), input = useRef(null);
  const [q, setQ] = useState(''), [open, setOpen] = useState(false), [hl, setHl] = useState(0);
  const [data, setData] = useState(null), [err, setErr] = useState(''), loadedAt = useRef(0);
  useOutside(box, () => setOpen(false), open);

  const ensure = () => {
    if (Date.now() - loadedAt.current < 30000) return;
    loadedAt.current = Date.now(); setErr('');
    Promise.all([api('/admin/papers'), api('/admin/rolls')])
      .then(([papers, rolls]) => setData({ papers, rolls }))
      .catch(e => { loadedAt.current = 0; setErr(e.message); });
  };
  useEffect(() => {
    const key = e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); } };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, []);

  const s = q.trim().toLowerCase();
  const items = !s || !data ? [] : [
    ...data.papers.filter(p => (p.title + ' ' + p.code).toLowerCase().includes(s)).slice(0, 5)
      .map(p => ({ group: 'Quizzes', icon: 'quiz', label: p.title, sub: p.code, to: '/admin/papers/' + p._id })),
    ...data.rolls.filter(r => r.registeredStudent && (r.registeredStudent.name + ' ' + r.rollNumber).toLowerCase().includes(s)).slice(0, 5)
      .map(r => ({ group: 'Students', icon: 'user', label: r.registeredStudent.name, sub: r.rollNumber, to: '/admin/students?q=' + encodeURIComponent(r.rollNumber) })),
    ...data.rolls.filter(r => !r.registeredStudent && r.rollNumber.toLowerCase().includes(s)).slice(0, 5)
      .map(r => ({ group: 'Roll numbers', icon: 'key', label: r.rollNumber, sub: r.isEnabled ? 'Not registered' : 'Disabled', to: '/admin/rolls?q=' + encodeURIComponent(r.rollNumber) }))
  ];
  const go = it => { navigate(it.to); setOpen(false); setQ(''); input.current?.blur(); };
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHl(h => Math.min(items.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(h => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && items[hl]) go(items[hl]);
  };

  return (
    <div className="gsearch" ref={box}>
      <Icon name="search" />
      <input ref={input} type="search" placeholder="Search students, quizzes, roll numbers…" value={q} aria-label="Search"
        onFocus={() => { ensure(); setOpen(true); }} onChange={e => { setQ(e.target.value); setHl(0); setOpen(true); }} onKeyDown={onKey}
        role="combobox" aria-expanded={open && !!s} aria-controls="gsearch-list" autoComplete="off" />
      {open && s && (
        <div className="popover" id="gsearch-list" role="listbox">
          {err ? <div className="empty-row err">{err}</div>
            : !data ? <div className="empty-row">Loading…</div>
            : !items.length ? <div className="empty-row">No matches for “{q.trim()}”.</div>
            : items.map((it, i) => (<div key={it.to + i}>
              {(i === 0 || items[i - 1].group !== it.group) && <div className="group">{it.group}</div>}
              <a href={it.to} className={i === hl ? 'hl' : ''} role="option" aria-selected={i === hl}
                onMouseEnter={() => setHl(i)} onClick={e => { e.preventDefault(); go(it); }}>
                <Icon name={it.icon} size={16} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span><span className="sub">{it.sub}</span>
              </a>
            </div>))}
        </div>
      )}
    </div>
  );
}
