import { useNavigate } from 'react-router-dom';
import PaperForm from '../../components/PaperForm';
import PageHeader from '../../components/PageHeader';
import api from '../../utils/api';
export default function NewPaper() {
  const navigate = useNavigate();
  const create = async body => {
    const p = await api('/admin/papers', { method: 'POST', body });
    navigate('/admin/papers/' + p._id + '?created=1');
  };
  return (<><PageHeader title="Create a quiz" subtitle="Build an objective (MCQ) paper and get a shareable link." /><PaperForm onSubmit={create} /></>);
}
