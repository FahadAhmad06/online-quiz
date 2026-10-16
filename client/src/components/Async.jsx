import Loading from './Loading';
import ErrorBox from './ErrorBox';
// Shows loading / error / content for a useFetch() state. children is a function of the data.
export default function Async({ state, children }) {
  if (state.error) return <ErrorBox message={state.error} onRetry={state.reload} />;
  if (state.loading && !state.data) return <Loading />;
  return children(state.data);
}
