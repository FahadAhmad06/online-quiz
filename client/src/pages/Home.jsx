import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import load from '../utils/load';
import Icon from '../components/Icon';

const features = [
  { icon: 'lock', tone: 'purple', title: 'Strict, fair navigation', text: 'Questions lock the moment a student clicks Next. No going back, enforced by the server.' },
  { icon: 'clock', tone: 'blue', title: 'Scheduled timing', text: 'Papers open at a set time with a live countdown, and the exam clock follows the schedule.' },
  { icon: 'checkCircle', tone: 'green', title: 'Instant results', text: 'Scores are calculated the moment a test is submitted, with a full answer review.' },
  { icon: 'key', tone: 'amber', title: 'Roll number & PIN sign-up', text: 'Only students the admin has authorized can register, each with a one-time PIN.' },
  { icon: 'retake', tone: 'purple', title: 'Controlled retakes', text: 'One attempt per paper by default. Admins can allow a retake for a single student.' },
  { icon: 'chart', tone: 'blue', title: 'Reports & rankings', text: 'Per-paper ranks, averages and CSV export help teachers see how the class did.' }
];
const steps = [
  { icon: 'key', title: 'Get authorized', text: 'Your teacher adds your roll number and gives you a registration PIN.' },
  { icon: 'user', title: 'Create your account', text: 'Register once with your roll number, PIN and a password.' },
  { icon: 'quiz', title: 'Enter the paper code', text: 'Open the link or type the code, read the rules, and start when it opens.' }
];

export default function Home() {
  const [code, setCode] = useState(''), [hint, setHint] = useState(''), navigate = useNavigate();
  const open = () => {
    const c = code.trim().split('/').pop().toUpperCase();
    if (c) navigate('/join/' + c); else setHint('Enter the paper code your teacher shared.');
  };
  // Same session check RequireStudent/api.js already use (sessionStorage 'qr_student'), not a separate flag.
  const student = load('qr_student', null, sessionStorage);

  return (<>
    <section className="hero">
      <div className="hero-glow" aria-hidden="true" />
      <div className="container hero-grid">
        <div className="hero-copy fade-up">
          <span className="eyebrow"><Icon name="shield" size={14} />Secure online MCQ exams</span>
          <h1>Fair exams, <span className="grad">beautifully simple.</span></h1>
          <p className="lead">QuizRoom lets teachers create timed, scheduled papers and lets students take them in a focused, distraction-free exam room, with results the moment they finish.</p>
          <div className="row hero-cta">
            {student
              ? <Link className="btn lg" to="/dashboard"><Icon name="home" size={18} />Go to my dashboard</Link>
              : <Link className="btn lg" to="/student-login"><Icon name="user" size={18} />Student login</Link>}
            {!student && <Link className="btn ghost lg on-dark" to="/student-register">Create an account</Link>}
          </div>
          <ul className="hero-points">
            <li><Icon name="check" size={16} />Questions lock after Next</li>
            <li><Icon name="check" size={16} />Live start countdown</li>
            <li><Icon name="check" size={16} />Instant scores</li>
          </ul>
        </div>

        <div className="hero-card fade-up delay-1" id="join">
          <div className="hero-card-head">
            <span className="ic purple"><Icon name="quiz" size={22} /></span>
            <div><b>I am a student</b><span>Open the link your teacher shared, or enter the paper code</span></div>
          </div>
          <label className="field" htmlFor="home-code">Paper code</label>
          <div className="code-box">
            <input id="home-code" type="text" placeholder="e.g. 7K2QXP" value={code} autoComplete="off"
              onChange={e => { setCode(e.target.value); setHint(''); }} onKeyDown={e => e.key === 'Enter' && open()} />
            <button onClick={open}>Open paper<Icon name="chevronRight" size={16} /></button>
          </div>
          {hint && <p className="err small-text" role="alert" style={{ margin: '0 0 8px' }}>{hint}</p>}
          <div className="hero-card-foot">
            {student
              ? <Link className="link" to="/dashboard">My dashboard →</Link>
              : <span className="muted small-text">Not registered yet? <Link className="link" to="/student-register">Register</Link></span>}
          </div>
          <div className="divider"><span>or</span></div>
          <Link className="admin-tile" to="/admin-login">
            <span className="ic blue"><Icon name="settings" size={20} /></span>
            <div><b>I am an admin</b><span>Create papers, share links, see marks</span></div>
            <Icon name="chevronRight" size={18} />
          </Link>
        </div>
      </div>
    </section>

    <section className="section container" id="features">
      <div className="section-head">
        <span className="eyebrow soft">Features</span>
        <h2>Everything a fair exam needs</h2>
        <p className="muted">Built for classrooms: simple for students, in control for teachers.</p>
      </div>
      <div className="feature-grid">
        {features.map(f => (
          <article className="fcard" key={f.title}>
            <span className={'ic ' + f.tone}><Icon name={f.icon} size={22} /></span>
            <h3>{f.title}</h3>
            <p className="muted">{f.text}</p>
          </article>
        ))}
      </div>
    </section>

    <section className="section container" id="how">
      <div className="section-head">
        <span className="eyebrow soft">How it works</span>
        <h2>From sign-up to score in three steps</h2>
      </div>
      <ol className="steps">
        {steps.map((s, i) => (
          <li key={s.title}>
            <span className="step-n">{i + 1}</span>
            <span className="ic soft"><Icon name={s.icon} size={20} /></span>
            <h3>{s.title}</h3>
            <p className="muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>

    <section className="container">
      <div className="cta-band">
        <div>
          <h2>Ready for your next paper?</h2>
          <p>Log in, enter the code, and you're in the exam room.</p>
        </div>
        <div className="row">
          {student
            ? <Link className="btn lg light" to="/dashboard">Open my dashboard</Link>
            : (<><Link className="btn lg light" to="/student-login">Student login</Link><Link className="btn ghost lg on-dark" to="/admin-login">Admin login</Link></>)}
        </div>
      </div>
    </section>
  </>);
}
