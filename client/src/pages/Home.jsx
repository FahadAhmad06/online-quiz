import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
export default function Home() {
  const [code, setCode] = useState(''), navigate = useNavigate();
  const open = () => { const c = code.trim().split('/').pop().toUpperCase(); if (c) navigate('/join/' + c); };
  return (<>
    <h1>Welcome to QuizRoom</h1>
    <p className="muted">Choose how you want to continue.</p>
    <div className="pick">
      <div className="big">
        <b>I am a Student</b><span>Open the link your teacher shared, or enter the paper code</span>
        <input type="text" placeholder="Paper code" value={code} onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && open()} style={{ marginBottom: 0 }} />
        <button onClick={open}>Open paper</button>
      </div>
      <Link className="big" to="/admin-login"><b>I am an Admin</b><span>Create papers, share links, see marks</span></Link>
    </div>
  </>);
}
