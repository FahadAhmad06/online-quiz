import { useNavigate } from 'react-router-dom';
import PaperForm from '../../components/PaperForm';
import api from '../../utils/api';
export default function NewPaper() {
  const navigate = useNavigate();
  const create = async body => {
    const p = await api('/admin/papers', { method: 'POST', body });
    navigate('/admin/papers/' + p._id + '?created=1'); 
  };
  return (<><h2>Create an objective paper</h2><PaperForm onSubmit={create} /></>);
}
