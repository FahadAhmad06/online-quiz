import { createHash, timingSafeEqual } from 'crypto';
const h = s => createHash('sha256').update(String(s)).digest();
export default function safeEqual(a, b) { return timingSafeEqual(h(a), h(b)); }
