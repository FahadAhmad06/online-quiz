import { Link, useNavigate, useParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import Async from '../../components/Async';
import PaperForm from '../../components/PaperForm';
import PageHeader from '../../components/PageHeader';
import { useToast } from '../../components/Feedback';
import api from '../../utils/api';
// Uses PATCH /admin/papers/:id, which the server refuses once any student has started or submitted the paper.
export default function EditPaper() {
  const { id } = useParams(), navigate = useNavigate(), toast = useToast();
  const state = useFetch('/admin/papers/' + id);
  const save = async body => {
    await api('/admin/papers/' + id, { method: 'PATCH', body });
    toast.ok('Quiz updated.');
    navigate('/admin/papers/' + id);
  };
  return (
    <Async state={state}>{({ paper, stats }) => (<>
      <PageHeader title={'Edit: ' + paper.title} subtitle={'Code ' + paper.code + ' · link expiry and start time are changed on the quiz page.'}>
        <Link className="btn ghost" to={'/admin/papers/' + id}>Cancel</Link>
      </PageHeader>
      {stats.count > 0
        ? <div className="card"><p className="err">Students have already taken this paper, so its questions and timing can no longer be edited.</p></div>
        : <PaperForm initial={paper} onSubmit={save} submitLabel="Save changes" />}
    </>)}</Async>
  );
}
