import { useState, useEffect } from 'react';
export default function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('qr_theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('qr_theme', theme); }, [theme]);
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}
