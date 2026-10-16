import { randomInt } from 'crypto';
import Paper from '../models/Paper.js';
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O, 0, I, 1
export default async function generateCode() {
  for (let t = 0; t < 20; t++) {
    let c = '';
    for (let i = 0; i < 6; i++) c += CHARS[randomInt(CHARS.length)];
    if (!(await Paper.exists({ code: c }))) return c;
  }
  throw new Error('Could not generate a unique paper code');
}
