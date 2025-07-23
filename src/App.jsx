import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';
import { v4 as uuidv4 } from 'uuid';
import {
  saveSubmission,
  uploadImage,
  subscribeToSubmissions,
  subscribeToUserSubmissions,
  fetchSubmissions,
  fetchUserSubmissions,
  updateStatus,
  validateImageFile
} from './supabase'; // Usando a versão melhorada

// ⚠️ MOVA PARA VARIÁVEL DE AMBIENTE EM PRODUÇÃO
const ADMIN_PASSWORD = 'picapau2020';

// Constantes para validação
const VALIDATION_RULES = {
  MIN_AGE: 18,
  MAX_AGE: 50,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^\d{8,15}$/,
  MAX_FILE_SIZE: 3 * 1024 * 1024 // 3MB
};

// Estados possíveis da aplicação
const STEPS = {
  BASIC_INFO: 1,
  DOCUMENTS: 2,
  TERMS: 3,
  ADMIN_LOGIN: 'admin-login',
  WAITING: 'waiting',
  RESULT: 'result'
};

function App() {
  // Estados principais
  const [step, setStep] = useState(STEPS.BASIC_INFO);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [imagemModal, setImagemModal] = useState(null);

  // Geração e persistência do userId
  const [userId] = useState(() => {
    const existing = localStorage.getItem('userId');
    if (existing) return existing;
    const newId = uuidv4();
    localStorage.setItem('userId', newId);
    return newId;
  });

  // Estado do formulário
  const initialForm = {
    nome: '',
    idade: '',
    email: '',
    whatsapp: '',
    fotoFrente: null,
    fotoVerso: null,
    termosAceitos: false
  };

  const [formData, setFormData] = useState(() => {
    try {
      const saved = localStorage.getItem('formData');
      return saved ? { ...initialForm, ...JSON.parse(saved) } : initialForm;
    } catch (error) {
      console.error('Erro ao carregar dados salvos:', error);
      return initialForm;
    }
  });

  // Estados de preview das imagens
  const [previewFotoFrente, setPreviewFotoFrente] = useState(null);
  const [previewFotoVerso, setPreviewFotoVerso] = useState(null);

  // Estados do admin
  const [isAdmin, setIsAdmin] = useState(() =>
    localStorage.getItem('adminLogged') === 'true'
  );
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);

  // Estado do resultado do usuário
  const [myResult, setMyResult] = useState(null);

  // Verifica se já foi submetido anteriormente
  const hasSubmitted = useMemo(() =>
    localStorage.getItem('submitted') === 'true', []
  );

  // Salva dados do formulário no localStorage
  useEffect(() => {
    try {
      // Remove arquivos do localStorage (muito pesado)
      const dataToSave = {
        ...formData,
        fotoFrente: null,
        fotoVerso: null
      };
      localStorage.setItem('formData', JSON.stringify(dataToSave));
    } catch (error) {
      console.error('Erro ao salvar no localStorage:', error);
    }
  }, [formData]);

  // Carrega submissões para admin
  const loadSubmissions = useCallback(async () => {
    if (!isAdmin) return;

    setSubmissionsLoading(true);
    try {
      const result = await fetchSubmissions({ limit: 100 });
      if (result.success) {
        setSubmissions(result.data);
      } else {
        console.error('Erro ao carregar submissões:', result.error);
      }
    } catch (error) {
      console.error('Erro ao carregar submissões:', error);
    } finally {
      setSubmissionsLoading(false);
    }
  }, [isAdmin]);

  // Subscription para admin
  useEffect(() => {
    if (!isAdmin) return;

    loadSubmissions();

    const unsubscribe = subscribeToSubmissions((payload) => {
      console.log('📡 Nova mudança:', payload);

      if (payload.eventType === 'INSERT') {
        setSubmissions(prev => [payload.new, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        setSubmissions(prev =>
          prev.map(sub => sub.id === payload.new.id ? payload.new : sub)
        );
      } else if (payload.eventType === 'DELETE') {
        setSubmissions(prev =>
          prev.filter(sub => sub.id !== payload.old.id)
        );
      }
    });

    return unsubscribe;
  }, [isAdmin, loadSubmissions]);

  // Subscription para usuário aguardando resultado
  useEffect(() => {
    if (step !== STEPS.WAITING) return;

    const checkUserResult = async () => {
      try {
        const result = await fetchUserSubmissions(userId, 1);
        if (result.success && result.data.length > 0) {
          const latest = result.data[0];
          if (latest.status !== 'pendente') {
            setMyResult(latest.status);
            setStep(STEPS.RESULT);
          }
        }
      } catch (error) {
        console.error('Erro ao verificar resultado:', error);
      }
    };

    // Verifica imediatamente
    checkUserResult();

    // Subscription para atualizações em tempo real
    const unsubscribe = subscribeToUserSubmissions(userId, (payload) => {
      if (payload.eventType === 'UPDATE' && payload.new.status !== 'pendente') {
        setMyResult(payload.new.status);
        setStep(STEPS.RESULT);
      }
    });

    return unsubscribe;
  }, [step, userId]);

  // Redireciona se já submeteu
  useEffect(() => {
    if (hasSubmitted && step !== STEPS.WAITING && step !== STEPS.RESULT) {
      setStep(STEPS.WAITING);
    }
  }, [hasSubmitted, step]);

  // Validação do formulário
  const validateStep = useCallback(() => {
    const newErrors = {};

    if (step === STEPS.BASIC_INFO) {
      if (!formData.nome.trim()) {
        newErrors.nome = 'Nome é obrigatório';
      } else if (formData.nome.trim().length < 2) {
        newErrors.nome = 'Nome deve ter pelo menos 2 caracteres';
      }

      const idade = parseInt(formData.idade, 10);
      if (!formData.idade || idade < VALIDATION_RULES.MIN_AGE || idade > VALIDATION_RULES.MAX_AGE) {
        newErrors.idade = `Idade deve ser entre ${VALIDATION_RULES.MIN_AGE} e ${VALIDATION_RULES.MAX_AGE}`;
      }

      if (!VALIDATION_RULES.EMAIL_REGEX.test(formData.email)) {
        newErrors.email = 'E-mail inválido';
      }

      if (!VALIDATION_RULES.PHONE_REGEX.test(formData.whatsapp.replace(/\D/g, ''))) {
        newErrors.whatsapp = 'Número de WhatsApp inválido (somente números, 8-15 dígitos)';
      }
    } else if (step === STEPS.DOCUMENTS) {
      if (!formData.fotoFrente) {
        newErrors.fotoFrente = 'Foto da frente do documento é obrigatória';
      }
      if (!formData.fotoVerso) {
        newErrors.fotoVerso = 'Foto do verso do documento é obrigatória';
      }
    } else if (step === STEPS.TERMS) {
      if (!formData.termosAceitos) {
        newErrors.termosAceitos = 'Você deve aceitar os termos para continuar';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [step, formData]);

  // Manipulador de mudanças no formulário
  const handleChange = useCallback((e) => {
    const { name, value, type, checked, files } = e.target;

    if (type === 'file') {
      const file = files[0];
      if (!file) return;

      // Validação do arquivo
      const validation = validateImageFile(file);
      if (!validation.valid) {
        setErrors(prev => ({ ...prev, [name]: validation.error }));
        return;
      }

      // Limpa erros anteriores
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });

      setFormData(prev => ({ ...prev, [name]: file }));

      // Cria preview
      const reader = new FileReader();
      reader.onloadend = () => {
        if (name === 'fotoFrente') setPreviewFotoFrente(reader.result);
        if (name === 'fotoVerso') setPreviewFotoVerso(reader.result);
      };
      reader.readAsDataURL(file);

    } else if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      // Formatação específica para WhatsApp
      let processedValue = value;
      if (name === 'whatsapp') {
        processedValue = value.replace(/\D/g, ''); // Remove tudo que não é dígito
      }
      setFormData(prev => ({ ...prev, [name]: processedValue }));
    }
  }, []);

  // Remove imagem
  const removeImage = useCallback((name) => {
    setFormData(prev => ({ ...prev, [name]: null }));
    if (name === 'fotoFrente') setPreviewFotoFrente(null);
    if (name === 'fotoVerso') setPreviewFotoVerso(null);
  }, []);

  // Navegação entre etapas
  const nextStep = useCallback(() => {
    if (validateStep()) {
      setStep(prev => prev + 1);
    }
  }, [validateStep]);

  const prevStep = useCallback(() => {
    setStep(prev => prev - 1);
  }, []);

  // Submissão do formulário
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!validateStep() || loading) return;

    setLoading(true);
    try {
      console.log('📤 Iniciando submissão...');

      // Upload das imagens - MUDANÇA AQUI 👇
      const [frenteResult, versoResult] = await Promise.all([
        uploadImage(formData.fotoFrente, null, userId), // null = nome único automático
        uploadImage(formData.fotoVerso, null, userId)   // null = nome único automático
      ]);

      if (!frenteResult.success || !versoResult.success) {
        throw new Error('Falha no upload das imagens');
      }

      // Salva no banco
      const submissionData = {
        nome: formData.nome.trim(),
        idade: parseInt(formData.idade, 10),
        email: formData.email.toLowerCase().trim(),
        whatsapp: formData.whatsapp,
        foto_frente: frenteResult.url,
        foto_verso: versoResult.url,
      };

      const saveResult = await saveSubmission(submissionData, userId);

      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Falha ao salvar submissão');
      }

      console.log('✅ Submissão enviada com sucesso!');

      // Limpa dados e marca como submetido
      localStorage.setItem('submitted', 'true');
      localStorage.removeItem('formData');
      setStep(STEPS.WAITING);

    } catch (error) {
      console.error('❌ Erro na submissão:', error);
      alert(`Erro ao enviar submissão: ${error.message}. Tente novamente.`);
    } finally {
      setLoading(false);
    }
  }, [formData, userId, loading, validateStep]);

  // Login do admin
  const handleAdminLogin = () => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setStep('admin'); // 👈 redireciona para o painel admin
    } else {
      alert('Senha incorreta!');
    }
  };


  // Logout do admin
  const handleAdminLogout = useCallback(() => {
    setIsAdmin(false);
    localStorage.removeItem('adminLogged');
    setSubmissions([]);
    setStep(STEPS.BASIC_INFO); // 👈 volta para a primeira tela
  }, []);

  // Atualiza status de submissão (admin)
  const updateSubmissionStatus = useCallback(async (id, status) => {
    try {
      const result = await updateStatus(id, status, userId);
      if (result.success) {
        setSubmissions(prev =>
          prev.map(sub => sub.id === id ? { ...sub, status } : sub)
        );
        console.log(`✅ Status atualizado para: ${status}`);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('❌ Erro ao atualizar status:', error);
      alert(`Erro ao atualizar status: ${error.message}`);
    }
  }, [userId]);

  // Copia texto para clipboard
  const copyToClipboard = useCallback(async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      alert('Copiado para a área de transferência!');
    } catch (error) {
      console.error('Erro ao copiar:', error);
      // Fallback para navegadores mais antigos
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      alert('Copiado!');
    }
  }, []);

  // Renderização do painel admin
  if (isAdmin && step === 'admin') {

    return (
      <div className="app admin">
        <header className="admin-header">
          <h1>🛡️ Painel Administrativo</h1>
          <div className="admin-stats">
            <span>Total: {submissions.length}</span>
            <span>Pendentes: {submissions.filter(s => s.status === 'pendente').length}</span>
            <button className="btn-logout" onClick={handleAdminLogout}>
              Sair
            </button>
          </div>
        </header>

        {/* Modal de imagem */}
        {imagemModal && (
          <div className="modal-backdrop" onClick={() => setImagemModal(null)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setImagemModal(null)}>
                ✕
              </button>
              <img src={imagemModal} alt="Documento ampliado" />
            </div>
          </div>
        )}

        {submissionsLoading && (
          <div className="loading">
            <p>🔄 Carregando submissões...</p>
          </div>
        )}

        {submissions.length === 0 && !submissionsLoading && (
          <div className="empty-state">
            <p>📋 Nenhuma submissão encontrada.</p>
            <button onClick={loadSubmissions}>🔄 Recarregar</button>
          </div>
        )}

        <div className="submissions-list">
          {submissions.map(sub => (
            <div key={sub.id} className={`submission-card status-${sub.status}`}>
              <div className="submission-header">
                <h3>{sub.nome}</h3>
                <span className={`status-badge ${sub.status}`}>
                  {sub.status.toUpperCase()}
                </span>
              </div>

              <div className="submission-info">
                <div className="info-grid">
                  <div>
                    <strong>Idade:</strong> {sub.idade} anos
                  </div>
                  <div>
                    <strong>E-mail:</strong> {sub.email}
                  </div>
                  <div>
                    <strong>WhatsApp:</strong>
                    <span className="phone-number">{sub.whatsapp}</span>
                    <button
                      className="btn-copy"
                      onClick={() => copyToClipboard(sub.whatsapp)}
                    >
                      📋
                    </button>
                  </div>
                  <div>
                    <strong>Enviado:</strong> {new Date(sub.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>





              <div className="submission-images" >
                <div className="image-container">
                  <h4>Frente</h4>
                  {sub.fotofrente ? (
                    <img
                      src={sub.fotofrente}
                      alt="Frente do documento"
                      loading="lazy"
                      className="preview-img"
                      onClick={() => setImagemModal(sub.fotofrente)}
                    />
                  ) : (
                    <div className="no-image">❌ Sem imagem</div>
                  )}
                </div>

                <div className="image-container">
                  <h4>Verso</h4>
                  {sub.fotoverso ? (
                    <img
                      src={sub.fotoverso}
                      alt="Verso do documento"
                      loading="lazy"
                      className="preview-img"
                      onClick={() => setImagemModal(sub.fotoverso)}
                    />
                  ) : (
                    <div className="no-image">❌ Sem imagem</div>
                  )}
                </div>
              </div>

              {sub.status === 'pendente' && (
                <div className="submission-actions">
                  <button
                    className="btn-approve"
                    onClick={() => updateSubmissionStatus(sub.id, 'aprovado')}
                    disabled={loading}
                  >
                    ✅ Aprovar
                  </button>
                  <button
                    className="btn-reject"
                    onClick={() => updateSubmissionStatus(sub.id, 'reprovado')}
                    disabled={loading}
                  >
                    ❌ Reprovar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Renderização para usuários
  return (
    <div className="app">
      <header className="app-header">
        <h1>🔞 Verificação +18 - DaVinci Comic</h1>
        <button
          className="btn-admin"
          onClick={() => setStep(STEPS.ADMIN_LOGIN)}
          disabled={loading}
        >
          🛡️ Área Admin
        </button>
      </header>

      {step === STEPS.ADMIN_LOGIN && (
        <div className="admin-login">
          <h2>🔐 Login Administrador</h2>
          <div className="form-group">
            <input
              type="password"
              placeholder="Digite a senha de administrador"
              value={adminPasswordInput}
              onChange={e => setAdminPasswordInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAdminLogin()}
            />
          </div>
          <div className="form-actions">
            <button onClick={handleAdminLogin} disabled={!adminPasswordInput}>
              Entrar
            </button>
            <button className="btn-secondary" onClick={() => setStep(STEPS.BASIC_INFO)}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {step === STEPS.BASIC_INFO && (
        <div className="step">
          <h2>📝 Etapa 1: Dados Básicos</h2>
          <p>Preencha seus dados pessoais para iniciar a verificação.</p>

          <div className="form-group">
            <input
              type="text"
              name="nome"
              placeholder="Nome completo"
              value={formData.nome}
              onChange={handleChange}
              disabled={loading}
            />
            {errors.nome && <span className="error">❌ {errors.nome}</span>}
          </div>

          <div className="form-group">
            <input
              type="number"
              name="idade"
              placeholder="Idade"
              value={formData.idade}
              onChange={handleChange}
              min={VALIDATION_RULES.MIN_AGE}
              max={VALIDATION_RULES.MAX_AGE}
              disabled={loading}
            />
            {errors.idade && <span className="error">❌ {errors.idade}</span>}
          </div>

          <div className="form-group">
            <input
              type="email"
              name="email"
              placeholder="Seu melhor e-mail"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
            />
            {errors.email && <span className="error">❌ {errors.email}</span>}
          </div>

          <div className="form-group">
            <input
              type="tel"
              name="whatsapp"
              placeholder="Número WhatsApp (somente números)"
              value={formData.whatsapp}
              onChange={handleChange}
              disabled={loading}
            />
            {errors.whatsapp && <span className="error">❌ {errors.whatsapp}</span>}
          </div>

          <div className="form-actions">
            <button onClick={nextStep} disabled={loading}>
              Próximo →
            </button>
          </div>
        </div>
      )}

      {step === STEPS.DOCUMENTS && (
        <div className="step">
          <h2>📄 Etapa 2: Documentos de Identidade</h2>

          <div className="instructions">
            <p>
              📸 Envie fotos <strong>nítidas</strong> da frente e verso do seu documento de identidade:
            </p>
            <ul>
              <li>✅ <strong>Frente:</strong> deve conter sua foto, dados sensiveis pode riscar</li>
              <li>✅ <strong>Verso:</strong> deve conter nome completo e data de nascimento</li>
              <li>🔒 Pode cobrir o CPF e outros dados sensíveis se desejar</li>
              <li>📏 Máximo 3MB por foto</li>
            </ul>
          </div>

          <div className="document-upload">
            <h4>📄 Frente do Documento</h4>
            {previewFotoFrente ? (
              <div className="image-preview">
                <img
                  src={previewFotoFrente}
                  alt="Frente do documento"
                  className="document-image"
                />
                <button
                  className="btn-remove"
                  onClick={() => removeImage('fotoFrente')}
                  disabled={loading}
                >
                  🗑️ Remover
                </button>
              </div>
            ) : (
              <div className="file-input-container">
                <input
                  type="file"
                  name="fotoFrente"
                  accept="image/*"
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            )}
            {errors.fotoFrente && <span className="error">❌ {errors.fotoFrente}</span>}
          </div>

          <div className="document-upload">
            <h4>📄 Verso do Documento</h4>
            {previewFotoVerso ? (
              <div className="image-preview">
                <img
                  src={previewFotoVerso}
                  alt="Verso do documento"
                  className="document-image"
                />
                <button
                  className="btn-remove"
                  onClick={() => removeImage('fotoVerso')}
                  disabled={loading}
                >
                  🗑️ Remover
                </button>
              </div>
            ) : (
              <div className="file-input-container">
                <input
                  type="file"
                  name="fotoVerso"
                  accept="image/*"
                  onChange={handleChange}
                  disabled={loading}
                />
              </div>
            )}
            {errors.fotoVerso && <span className="error">❌ {errors.fotoVerso}</span>}
          </div>

          <div className="form-actions">
            <button className="btn-secondary" onClick={prevStep} disabled={loading}>
              ← Voltar
            </button>
            <button onClick={nextStep} disabled={loading}>
              Próximo →
            </button>
          </div>
        </div>
      )}

      {step === STEPS.TERMS && (
        <div className="step">
          <h2>📋 Etapa 3: Termos e Condições</h2>

          <div className="terms-content">
            <div className="privacy-notice">
              <h3>🔒 Privacidade dos Dados</h3>
              <p>
                Seus dados pessoais são utilizados <strong>exclusivamente</strong> para
                confirmar sua maioridade. Não compartilhamos suas informações com terceiros.
              </p>
            </div>

            <div className="warning-notice">
              <h3>⚠️ Aviso Importante</h3>
              <p>
                Tentativas de burlar o sistema de verificação resultarão em
                <strong> banimento permanente</strong> do grupo. Não tente enganar
                a verificação com documentos falsos ou de terceiros.
              </p>
            </div>

            <div className="approval-tips">
              <h3>🚀 Para Aprovação Mais Rápida</h3>
              <ul>
                <li>✅ Tenha uma <strong>foto de perfil visível</strong> no WhatsApp</li>
                <li>✅ Já tenha enviado a <strong>solicitação para entrar</strong> no grupo</li>
                <li>✅ Certifique-se de que as fotos estão <strong>nítidas e legíveis</strong></li>
              </ul>
            </div>
          </div>

          <div className="terms-agreement">
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="termosAceitos"
                checked={formData.termosAceitos}
                onChange={handleChange}
                disabled={loading}
              />
              <span className="checkmark"></span>
              Eu li e aceito todos os termos e condições acima
            </label>
            {errors.termosAceitos && <span className="error">❌ {errors.termosAceitos}</span>}
          </div>

          <div className="form-actions">
            <button className="btn-secondary" onClick={prevStep} disabled={loading}>
              ← Voltar
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !formData.termosAceitos}
              className="btn-primary"
            >
              {loading ? '⏳ Enviando...' : '🚀 Enviar Verificação'}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.WAITING && (
        <div className="step waiting">
          <div className="waiting-content">
            <div className="spinner">⏳</div>
            <h2>🔍 Analisando seu Cadastro</h2>
            <p>
              Nossa equipe está verificando suas informações. Você será notificado
              assim que a análise for concluída.
            </p>
            <div className="waiting-info">
              <p>⏱️ <strong>Tempo estimado:</strong> 1-2 dias</p>
              <p>📱 <strong>Status:</strong> Aguardando aprovação</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;