// Starts a throwaway mongod for tests unless TEST_MONGO_URI points at one already running.
// Set MONGOD_PATH if mongod is not on PATH (e.g. "C:/Program Files/MongoDB/Server/8.2/bin/mongod.exe").
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const waitForPort = (port, ms) => new Promise((resolve, reject) => {
  const until = Date.now() + ms;
  const tryOnce = () => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.end(); resolve(); });
    s.once('error', () => { s.destroy(); Date.now() > until ? reject(new Error('mongod did not start')) : setTimeout(tryOnce, 100); });
  };
  tryOnce();
});

export async function startMongod(port = 27999) {
  if (process.env.TEST_MONGO_URI) return { stop: async () => {} };
  const dir = mkdtempSync(path.join(tmpdir(), 'qr-mongod-'));
  const bin = process.env.MONGOD_PATH || 'mongod';
  const proc = spawn(bin, ['--port', String(port), '--dbpath', dir, '--bind_ip', '127.0.0.1', '--quiet'], { stdio: 'ignore' });
  proc.on('error', e => { console.error('Could not start mongod (' + bin + '): ' + e.message + '. Set MONGOD_PATH or TEST_MONGO_URI.'); process.exit(1); });
  await waitForPort(port, 20000);
  return {
    stop: async () => {
      proc.kill();
      await new Promise(r => proc.once('exit', r));
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  };
}
