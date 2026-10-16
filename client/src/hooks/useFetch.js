import { useState, useEffect } from 'react';
import api from '../utils/api';
// GET a path. Returns { data, loading, error, reload }.
export default function useFetch(path) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [n, setN] = useState(0);
  useEffect(() => {
    let off = false;
    setState(s => ({ ...s, loading: true, error: '' }));
    api(path).then(data => !off && setState({ data, loading: false, error: '' }))
      .catch(e => !off && setState({ data: null, loading: false, error: e.message }));
    return () => { off = true; };
  }, [path, n]);
  return { ...state, reload: () => setN(x => x + 1) };
}
