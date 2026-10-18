import { useState } from 'react';

function EyeIcon() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>);
}
function EyeOffIcon() {
  return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M9.88 4.6A10.8 10.8 0 0 1 12 4.5c7 0 11 7.5 11 7.5a13.2 13.2 0 0 1-3.1 3.8M6.1 6.1A13.4 13.4 0 0 0 1 12s4 7.5 11 7.5c1.3 0 2.5-.2 3.6-.6" />
  </svg>);
}

// Same bare <input> this app already uses, plus a show/hide toggle. Visibility is purely a
// frontend display change: the value, validation, and what gets sent to the server never differ.
export default function PasswordField({ value, onChange, placeholder, onKeyDown, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pwrap">
      <input type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={onChange}
        onKeyDown={onKeyDown} autoComplete={autoComplete} />
      <button type="button" className="eye" aria-label={show ? 'Hide password' : 'Show password'}
        onClick={() => setShow(s => !s)}>
        {show ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}
