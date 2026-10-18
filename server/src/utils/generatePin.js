import { randomInt } from 'crypto';
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O, 0, I, 1
export default function generatePin(len = 10) {
  let p = '';
  for (let i = 0; i < len; i++) p += CHARS[randomInt(CHARS.length)];
  return p;
}
