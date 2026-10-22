import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import load from '../utils/load';
export default function Home() {
  const [code, setCode] = useState(''), navigate = useNavigate();
  const open = () => { const c = code.trim().split('/').pop().toUpperCase(); if (c) navigate('/join/' + c); };
  // Same session check RequireStudent/api.js already use (sessionStorage 'qr_student'), not a separate flag.
  const studentLoggedIn = !!load('qr_student', null, sessionStorage);
  return (<>
    <h1>Welcome to QuizRoom</h1>
    <p className="muted">Choose how you want to continue.</p>
    <div className="pick">
      <div className="big">
        <b>I am a Student</b><span>Open the link your teacher shared, or enter the paper code</span>
        <input type="text" placeholder="Paper code" value={code} onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && open()} style={{ marginBottom: 0 }} />
        <div className="row" style={{ marginTop: 10 }}>
          <button onClick={open}>Open paper</button>
          {studentLoggedIn ? <Link className="btn ghost" to="/dashboard">My dashboard</Link> : <Link className="btn ghost" to="/student-login">Student Login</Link>}
        </div>
      </div>
      <Link className="big" to="/admin-login"><b>I am an Admin</b><span>Create papers, share links, see marks</span></Link>
    </div>
  </>);
}
