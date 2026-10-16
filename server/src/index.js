import app from './app.js';
import config from './config.js';
import connectDb from './db.js';
connectDb()
  .then(() => app.listen(config.port, () => console.log('QuizRoom API on http://localhost:' + config.port)))
  .catch(e => { console.error('Could not start:', e.message); process.exit(1); });
