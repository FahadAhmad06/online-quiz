import { useEffect } from 'react';
// Calls fn on a pointer-down outside ref's element or on Escape, while `active`.
export default function useOutside(ref, fn, active = true) {
  useEffect(() => {
    if (!active) return;
    const down = e => ref.current && !ref.current.contains(e.target) && fn();
    const key = e => e.key === 'Escape' && fn();
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [active]);
}
