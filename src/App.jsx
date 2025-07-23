import React, { useState, useEffect } from 'react';
import './App.css';
import { v4 as uuidv4 } from 'uuid';
import {
  saveSubmission,
  uploadImage,
  subscribeToSubmissions,
  subscribeToUserSubmissions
} from './firebaseActions';

const ADMIN_PASSWORD = 'senhaSuperSecreta123';

function App() {
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [userId] = useState(() => {
    const existing = localStorage.getItem('userId');
    if (existing) return existing;
    const newId = uuidv4();
    localStorage.setItem('userId', newId);
    return newId;
  });
  const [imagemModal, setImagemModal] = useState(null);

  const initialForm = {
    nome: '', idade: '', email: '', whatsapp: '',
    fotoFrente: null, fotoVerso: null, termosAceitos: false
  };
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('formData');
    return saved ? JSON.parse(saved) : initialForm;
  });
  const [previewFotoFrente, setPreviewFotoFrente] = useState(null);
  const [previewFotoVerso, setPreviewFotoVerso] = useState(null);

  const [isAdmin, setIsAdmin] = useState(() =>
    localStorage.getItem('adminLogged') === 'true'
  );
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [submissions, setSubmissions] = useState([]);

  // Guarda resultado da própria submissão
  const [myResult, setMyResult] = useState(null);

  useEffect(() => {
    localStorage.setItem('formData', JSON.stringify(formData));
  }, [formData]);

  // Carrega submissões para admin em tempo real
  useEffect(() => {
    if (!isAdmin) return;
    const unsub = subscribeToSubmissions(setSubmissions);
    return () => unsub();
  }, [isAdmin]);

  // Após envio, escuta apenas a submissão do user
  useEffect(() => {
    if (step !== 'waiting') return;
    const unsub = subscribeToUserSubmissions(userId, subs => {
      if (subs.length > 0) {
        const latest = subs[0];
        if (latest.status !== 'pendente') {
          setMyResult(latest.status);
          setStep('result');
        }
      }
    });
    return () => unsub();
  }, [step, userId]);

  const validateStep = () => {
    let newErrors = {};
    if (step === 1) {
      if (!formData.nome.trim()) newErrors.nome = 'Nome é obrigatório';
      const idade = parseInt(formData.idade, 10);
      if (!formData.idade || idade < 18 || idade > 50)
        newErrors.idade = 'Idade deve ser entre 18 e 50';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) newErrors.email = 'E-mail inválido';
      const phoneRegex = /^\d{8,15}$/;
      if (!phoneRegex.test(formData.whatsapp))
        newErrors.whatsapp = 'Número inválido';
    } else if (step === 2) {
      if (!previewFotoFrente) newErrors.fotoFrente = 'Foto da frente obrigatória';
      if (!previewFotoVerso) newErrors.fotoVerso = 'Foto do verso obrigatória';
    } else if (step === 3 && !formData.termosAceitos) {
      newErrors.termosAceitos = 'Você deve aceitar os termos';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = e => {
    const { name, value, type, checked, files } = e.target;
    if (type === 'file') {
      const file = files[0];
      if (file.size > 3 * 1024 * 1024) return alert('Máx 3MB');
      setFormData({ ...formData, [name]: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        if (name === 'fotoFrente') setPreviewFotoFrente(reader.result);
        if (name === 'fotoVerso') setPreviewFotoVerso(reader.result);
      };
      reader.readAsDataURL(file);
    } else if (type === 'checkbox') {
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const removeImage = name => {
    setFormData({ ...formData, [name]: null });
    if (name === 'fotoFrente') setPreviewFotoFrente(null);
    if (name === 'fotoVerso') setPreviewFotoVerso(null);
  };

  const nextStep = () => {
    if (validateStep()) setStep(prev => prev + 1);
  };
  const prevStep = () => setStep(prev => prev - 1);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validateStep()) return;
    try {
      const frenteUrl = await uploadImage(formData.fotoFrente, `ids/${userId}_frente.jpg`);
      const versoUrl = await uploadImage(formData.fotoVerso, `ids/${userId}_verso.jpg`);
      await saveSubmission({
        nome: formData.nome,
        idade: formData.idade,
        email: formData.email,
        whatsapp: formData.whatsapp,
        fotoFrente: frenteUrl,
        fotoVerso: versoUrl,
      }, userId);
      localStorage.setItem('submitted', 'true');
      localStorage.removeItem('formData');
      setStep('waiting');
    } catch (err) {
      console.error('[handleSubmit] erro ao enviar:', err);
      alert('Desculpe, ocorreu um erro ao enviar sua submissão. Por favor, tente novamente mais tarde.');
    }
  };

  const handleAdminLogin = () => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      localStorage.setItem('adminLogged', 'true');
      setAdminPasswordInput('');
    } else alert('Senha incorreta');
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    localStorage.removeItem('adminLogged');
  };

  const updateSubmissionStatus = (id, status) => {
    // atualiza apenas local para demo; Firestore refletirá via listener
    setSubmissions(subs => subs.map(s => s.id === id ? { ...s, status } : s));
  };

  const copyToClipboard = text => {
    navigator.clipboard.writeText(text);
    alert('Copiado!');
  };

  if (isAdmin) {
    return (
      <div className="app admin">
        <h1>Área do Administrador</h1>
        <button className="btn-logout" onClick={handleAdminLogout}>Logout</button>
        {imagemModal && (
          <div className="modal-backdrop" onClick={() => setImagemModal(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setImagemModal(null)}>✕</button>
              <img src={imagemModal} alt="Imagem ampliada" />
            </div>
          </div>
        )}
        {submissions.length === 0 && <p>Nenhuma submissão ainda.</p>}
        <div className="submissions-list">
          {submissions.map(sub => (
            <div key={sub.id} className={`submission-card status-${sub.status}`}>
              <div className="info">
                <p><b>Nome:</b> {sub.nome}</p>
                <p><b>Idade:</b> {sub.idade}</p>
                <p><b>E-mail:</b> {sub.email}</p>
                <p><b>WhatsApp:</b> {sub.whatsapp} <button onClick={() => copyToClipboard(sub.whatsapp)}>Copiar</button></p>
                <p><b>Status:</b> {sub.status}</p>
                <p><small>Criado em: {new Date(sub.createdAt).toLocaleString()}</small></p>
              </div>
              <div className="images">
                {sub.fotoFrente
                  ? <img src={sub.fotoFrente} alt="Frente identidade" loading="lazy" className="preview-img" onClick={() => setImagemModal(sub.fotoFrente)} />
                  : <p>Sem frente</p>}
                {sub.fotoVerso
                  ? <img src={sub.fotoVerso} alt="Verso identidade" loading="lazy" className="preview-img" onClick={() => setImagemModal(sub.fotoVerso)} />
                  : <p>Sem verso</p>}
              </div>
              {sub.status === 'pendente' && (
                <div className="actions">
                  <button className="btn-approve" onClick={() => updateSubmissionStatus(sub.id, 'aprovado')}>Aprovar</button>
                  <button className="btn-reject" onClick={() => updateSubmissionStatus(sub.id, 'reprovado')}>Reprovar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Usuário
  return (
    <div className="app">
      <h1>Verificação +18 - DaVinci Comic</h1>
      <button className="btn-admin" onClick={() => setStep('admin-login')}>Área do Admin</button>
      {step === 'admin-login' && (
        <div className="admin-login">
          <h2>Login Administrador</h2>
          <input type="password" placeholder="Digite a senha" value={adminPasswordInput} onChange={e => setAdminPasswordInput(e.target.value)} />
          <button onClick={handleAdminLogin}>Entrar</button>
          <button className="voltar" onClick={() => setStep(1)}>Voltar</button>
        </div>
      )}
      {step === 1 && (
        <div className="step">
          <h2>Etapa 1: Dados básicos</h2>
          <input type="text" name="nome" placeholder="Nome completo" value={formData.nome} onChange={handleChange} />
          {errors.nome && <span className="error">{errors.nome}</span>}
          <input type="number" name="idade" placeholder="Idade" value={formData.idade} onChange={handleChange} />
          {errors.idade && <span className="error">{errors.idade}</span>}
          <input type="email" name="email" placeholder="E-mail" value={formData.email} onChange={handleChange} />
          {errors.email && <span className="error">{errors.email}</span>}
          <input type="tel" name="whatsapp" placeholder="Número WhatsApp" value={formData.whatsapp} onChange={handleChange} />
          {errors.whatsapp && <span className="error">{errors.whatsapp}</span>}
          <button onClick={nextStep}>Próximo</button>
        </div>
      )}

      {step === 2 && (
        <div className="step">
          <h2>Etapa 2: Identidade (frente e verso)</h2>
          <p>Envie duas fotos: <strong>frente</strong> (com rosto) e <strong>verso</strong> (com nome e nascimento). Pode riscar o CPF outros dados, so precisa mostrar seu nome, data de nascimento e foto .</p>
          <h4>Frente da identidade</h4>
          {previewFotoFrente ? (
            <div>
              <img className='imageEnv' src={previewFotoFrente} alt="Frente identidade" style={{ maxWidth: '100%', marginBottom: '10px' }} />
              <button className="remove" onClick={() => removeImage('fotoFrente')}>Remover</button>
            </div>
          ) : (
            <input type="file" name="fotoFrente" accept="image/*" onChange={handleChange} />
          )}
          {errors.fotoFrente && <span className="error">{errors.fotoFrente}</span>}

          <h4>Verso da identidade</h4>
          {previewFotoVerso ? (
            <div>
              <img className='imageEnv' src={previewFotoVerso} alt="Verso identidade" style={{ maxWidth: '100%', marginBottom: '10px' }} />
              <button className="remove" onClick={() => removeImage('fotoVerso')}>Remover</button>
            </div>
          ) : (
            <input type="file" name="fotoVerso" accept="image/*" onChange={handleChange} />
          )}
          {errors.fotoVerso && <span className="error">{errors.fotoVerso}</span>}

          <button className="voltar" onClick={prevStep}>Voltar</button>
          <button onClick={nextStep}>Próximo</button>
        </div>
      )}

      {step === 3 && (
        <div className="step">
          <h2>Etapa 3: Termos e envio</h2>
          <p>Usamos seus dados apenas para confirmar sua maioridade. Eles não são compartilhados com ninguém.</p>

          <div style={{ color: '#ff1f1f', fontWeight: 'bold' }}>
            <p>⚠️ Para aprovação mais rápida:</p>
            <ul>
              <li>Tenha <strong>foto de perfil</strong> visível no WhatsApp</li>
              <li>Já tenha enviado a <strong>solicitação</strong> para entrar no grupo</li>
            </ul>
          </div>

          <label>
            <input
              type="checkbox"
              name="termosAceitos"
              checked={formData.termosAceitos}
              onChange={handleChange}
            />
            Eu aceito os termos
          </label>
          {errors.termosAceitos && <span className="error">{errors.termosAceitos}</span>}

          <button className="voltar" onClick={prevStep}>Voltar</button>
          <button onClick={handleSubmit}>Enviar</button>
        </div>
      )}

      {step === 'waiting' && (
        <div className="step waiting">
          <h2>Estamos analisando seu cadastro...</h2>
          <p>Nosso time está verificando suas informações. Assim que for aprovado, você será adicionado automaticamente ao grupo +18.</p>
        </div>
      )}

      {step === 'result' && myResult && (
        <div className="step result">
          <h2>Você foi {myResult === 'aprovado' ? 'Aprovada' : 'Reprovada'}</h2>
        </div>
      )}
    </div>
  );
}

export default App;
