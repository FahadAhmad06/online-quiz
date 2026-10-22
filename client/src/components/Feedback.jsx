import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon';

// App-wide toasts and confirm dialogs.
//   const toast = useToast();     toast.ok('Saved'); toast.bad(e.message);
//   const confirm = useConfirm(); if (await confirm({ title, message, danger: true })) ...
const Ctx = createContext(null);

export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]), [dialog, setDialog] = useState(null);
  const seq = useRef(0);
  const push = useCallback((kind, text) => {
    const id = ++seq.current;
    setToasts(t => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), kind === 'bad' ? 6000 : 3500);
  }, []);
  const toast = useRef({ ok: t => push('ok', t), bad: t => push('bad', t) }).current;
  const confirm = useCallback(opts => new Promise(resolve => setDialog({ ...(typeof opts === 'string' ? { message: opts } : opts), resolve })), []);
  const close = v => { dialog.resolve(v); setDialog(null); };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={'toast ' + t.kind}>
            <Icon name={t.kind === 'ok' ? 'checkCircle' : 'alert'} />
            <span>{t.text}</span>
            <button aria-label="Dismiss" onClick={() => setToasts(x => x.filter(y => y.id !== t.id))}><Icon name="close" size={14} /></button>
          </div>
        ))}
      </div>
      {dialog && <ConfirmDialog {...dialog} onClose={close} />}
    </Ctx.Provider>
  );
}

export function ConfirmDialog({ title = 'Are you sure?', message, confirmText = 'Confirm', cancelText = 'Cancel', danger, onClose }) {
  const ok = useRef(null);
  useEffect(() => {
    ok.current?.focus();
    const key = e => e.key === 'Escape' && onClose(false);
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  return (
    <div className="dialog-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-m">
        <h2 id="dlg-t">{title}</h2>
        {message && <p id="dlg-m" className="muted" style={{ margin: 0 }}>{message}</p>}
        <div className="actions">
          <button className="ghost" onClick={() => onClose(false)}>{cancelText}</button>
          <button ref={ok} className={danger ? 'danger solid' : ''} onClick={() => onClose(true)}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

export const useToast = () => useContext(Ctx).toast;
export const useConfirm = () => useContext(Ctx).confirm;
