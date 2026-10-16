export default function isOpen(p) { return !p.expiresAt || Date.now() < new Date(p.expiresAt).getTime(); }
