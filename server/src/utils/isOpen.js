export default function isOpen(paper) { return !paper.expiresAt || Date.now() < new Date(paper.expiresAt).getTime(); }
