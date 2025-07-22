import React, { useState, useEffect } from 'react';
import './App.css';
import { v4 as uuidv4 } from 'uuid';

const ADMIN_PASSWORD = 'senhaSuperSecreta123';

const dummySubmissions = [
  {
    id: '1',
    nome: 'Carlos Silva',
    idade: 25,
    email: 'carlos@email.com',
    whatsapp: '11999999999',
    fotoPessoa: null,
    fotoIdentidade: null,
    status: 'pendente',
    createdAt: new Date().toISOString(),
  },
];

function App() {
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});
  const [userId, setUserId] = useState(() => {
    const existing = localStorage.getItem('userId');
    if (existing) return existing;
    const newId = uuidv4();
    localStorage.setItem('userId', newId);
    return newId;
  });

  const initialForm = {
    nome: '',
    idade: '',
    email: '',
    whatsapp: '',
    fotoPessoa: null,
    fotoIdentidade: null,
    termosAceitos: false,
  };

  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('formData');
    return saved ? JSON.parse(saved) : initialForm;
  });

  const [previewFotoPessoa, setPreviewFotoPessoa] = useState(null);
  const [previewFotoIdentidade, setPreviewFotoIdentidade] = useState(null);

  // Admin states
  const [isAdmin, setIsAdmin] = useState(() => {
    return localStorage.getItem('adminLogged') === 'true';
  });
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [submissions, setSubmissions] = useState(dummySubmissions);

  useEffect(() => {
    localStorage.setItem('formData', JSON.stringify(formData));
  }, [formData]);

  // Validação da etapa atual
  const validateStep = () => {
    let newErrors = {};

    if (step === 1) {
      if (!formData.nome.trim()) newErrors.nome = 'Nome é obrigatório';

      const idade = parseInt(formData.idade);
      if (!formData.idade || idade < 18 || idade > 50)
        newErrors.idade = 'Idade deve ser entre 18 e 50';

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email))
        newErrors.email = 'E-mail inválido';

      const phoneRegex = /^\d{8,15}$/;
      if (!phoneRegex.test(formData.whatsapp))
        newErrors.whatsapp = 'Número inválido (apenas números, sem espaços)';
    } else if (step === 2 && !previewFotoIdentidade) {
      newErrors.fotoIdentidade = 'Foto da identidade é obrigatória';
    } else if (step === 3 && !formData.termosAceitos) {
      newErrors.termosAceitos = 'Você deve aceitar os termos';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle input changes e previews
  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === 'file') {
      const file = files[0];
      setFormData({ ...formData, [name]: file });
      const reader = new FileReader();
      reader.onloadend = () => {
        if (name === 'fotoPessoa') setPreviewFotoPessoa(reader.result);
        if (name === 'fotoIdentidade') setPreviewFotoIdentidade(reader.result);
      };
      reader.readAsDataURL(file);
    } else if (type === 'checkbox') {
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const removeImage = (name) => {
    setFormData({ ...formData, [name]: null });
    if (name === 'fotoPessoa') setPreviewFotoPessoa(null);
    if (name === 'fotoIdentidade') setPreviewFotoIdentidade(null);
  };

  const nextStep = () => {
    if (validateStep()) setStep((prev) => prev + 1);
  };

  const prevStep = () => setStep((prev) => prev - 1);

  // Simular envio e salvar no estado "submissions"
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateStep()) return;

    const newEntry = {
      id: uuidv4(),
      nome: formData.nome,
      idade: formData.idade,
      email: formData.email,
      whatsapp: formData.whatsapp,
      fotoPessoa: previewFotoPessoa,
      fotoIdentidade: previewFotoIdentidade,
      status: 'pendente',
      createdAt: new Date().toISOString(),
    };

    setSubmissions((prev) => [newEntry, ...prev]);
    localStorage.removeItem('formData');
    setStep('waiting');
  };

  // Login admin
  const handleAdminLogin = () => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      localStorage.setItem('adminLogged', 'true');
      setAdminPasswordInput('');
    } else {
      alert('Senha incorreta');
    }
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    localStorage.removeItem('adminLogged');
  };

  // Aprovar/Reprovar no painel admin
  const updateSubmissionStatus = (id, status) => {
    setSubmissions((subs) =>
      subs.map((sub) => (sub.id === id ? { ...sub, status } : sub))
    );
  };

  // Copiar whatsapp
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Número copiado!');
  };

  // Mostrar tela principal ou admin
  if (isAdmin) {
    return (
      <div className="app admin">
        <h1>Área do Administrador</h1>
        <button className="btn-logout" onClick={handleAdminLogout}>Logout</button>
        {submissions.length === 0 && <p>Nenhuma submissão ainda.</p>}
        <div className="submissions-list">
          {submissions.map((sub) => (
            <div key={sub.id} className={`submission-card status-${sub.status}`}>
              <div className="info">
                <p><b>Nome:</b> {sub.nome}</p>
                <p><b>Idade:</b> {sub.idade}</p>
                <p><b>E-mail:</b> {sub.email}</p>
                <p>
                  <b>WhatsApp:</b> {sub.whatsapp}{' '}
                  <button onClick={() => copyToClipboard(sub.whatsapp)}>Copiar</button>
                </p>
                <p><b>Status:</b> {sub.status}</p>
                <p><small>Criado em: {new Date(sub.createdAt).toLocaleString()}</small></p>
              </div>
              <div className="images">
                {sub.fotoPessoa ? <img src={sub.fotoPessoa} alt="Foto do rosto" /> : <p>Sem foto do rosto</p>}
                {sub.fotoIdentidade ? <img src={sub.fotoIdentidade} alt="Foto da identidade" /> : <p>Sem foto identidade</p>}
              </div>
              <div className="actions">
                {sub.status === 'pendente' && (
                  <>
                    <button className="btn-approve" onClick={() => updateSubmissionStatus(sub.id, 'aprovado')}>Aprovar</button>
                    <button className="btn-reject" onClick={() => updateSubmissionStatus(sub.id, 'reprovado')}>Reprovar</button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Tela inicial de usuário normal (verificação +18)
  return (
    <div className="app">
      <h1>Verificação +18 - DaVinci Comic</h1>

      <button className="btn-admin" onClick={() => setStep('admin-login')}>Área do Admin</button>

      {step === 'admin-login' && (
        <div className="admin-login">
          <h2>Login Administrador</h2>
          <input
            type="password"
            placeholder="Digite a senha"
            value={adminPasswordInput}
            onChange={(e) => setAdminPasswordInput(e.target.value)}
          />
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
          <h2>Etapa 2: Foto da identidade</h2>
          <p>Só precisa mostrar seu nome, data de nascimento e foto. Pode riscar CPF e outros dados.</p>
          {previewFotoIdentidade && (
            <div>
              <img src={previewFotoIdentidade} alt="Preview identidade" style={{ maxWidth: '100%', marginBottom: '10px' }} />
              <button className="remove" onClick={() => removeImage('fotoIdentidade')}>Remover imagem</button>
            </div>
          )}
          {!previewFotoIdentidade && (
            <input type="file" name="fotoIdentidade" accept="image/*" onChange={handleChange} />
          )}
          {errors.fotoIdentidade && <span className="error">{errors.fotoIdentidade}</span>}

          <button className="voltar" onClick={prevStep}>Voltar</button>
          <button onClick={nextStep}>Próximo</button>
        </div>
      )}

      {step === 3 && (
        <div className="step">
          <h2>Etapa 3: Termos e envio</h2>
          <p>Usaremos seus dados apenas para verificação de maioridade. Eles não serão compartilhados.</p>

          <p><strong>Aviso:</strong> Se você for menor de idade, ou tentar burlar o sistema, você será <strong>banido permanentemente</strong> do grupo. Não é permitido tentar enganar a verificação.</p>

          <div style={{ color: 'darkred', fontWeight: 'bold' }}>
            <p style={{
              color: "#ff1f1fff"
            }}>⚠️ Para aumentar suas chances de aprovação imediata, certifique-se de:</p>
            <ul>
              <li>Ter <strong>foto de perfil</strong> visível no WhatsApp</li>
              <li>Já ter enviado a <strong>solicitação de entrada</strong> no grupo</li>
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
          <p>Por favor, aguarde. Isso pode levar alguns minutos.</p>
        </div>
      )}
    </div>
  );
}

export default App;
