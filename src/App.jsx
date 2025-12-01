import React, { useState, useEffect, useCallback, useMemo } from 'react'
import './App.css'
import { v4 as uuidv4 } from 'uuid'
import {
  saveSubmission,
  uploadImage,
  subscribeToSubmissions,
  subscribeToUserSubmissions,
  fetchSubmissions,
  fetchUserSubmissions,
  updateStatus,
  deleteSubmission,
  deleteAllSubmissions,
  validateImageFile
} from './supabase'

// ⚠️ MOVA PARA VARIÁVEL DE AMBIENTE EM PRODUÇÃO
const ADMIN_PASSWORD = 'picapau2020'

const VALIDATION_RULES = {
  MIN_AGE: 18,
  MAX_AGE: 50,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^\d{8,15}$/,
  MAX_FILE_SIZE: 3 * 1024 * 1024
}

const STEPS = {
  BASIC_INFO: 1,
  DOCUMENTS: 2,
  TERMS: 3,
  ADMIN_LOGIN: 'admin-login',
  ADMIN_PANEL: 'admin-panel',
  WAITING: 'waiting',
  RESULT: 'result'
}

// Hook personalizado para localStorage
const useLocalStorage = (key, initialValue) => {
  const [value, setValue] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })

  const setStoredValue = useCallback(
    newValue => {
      try {
        setValue(newValue)
        localStorage.setItem(key, JSON.stringify(newValue))
      } catch (error) {
        console.error(`Erro ao salvar ${key}:`, error)
      }
    },
    [key]
  )

  return [value, setStoredValue]
}

// Hook para gerenciar userId
const useUserId = () => {
  const [userId] = useState(() => {
    const existing = localStorage.getItem('userId')
    if (existing) return existing
    const newId = uuidv4()
    localStorage.setItem('userId', newId)
    return newId
  })
  return userId
}

function App () {
  const [step, setStep] = useState(STEPS.BASIC_INFO)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [imagemModal, setImagemModal] = useState(null)
  const userId = useUserId()

  const initialForm = useMemo(
    () => ({
      nome: '',
      idade: '',
      email: '',
      whatsapp: '',
      fotoFrente: null,
      fotoVerso: null,
      termosAceitos: false
    }),
    []
  )

  const [formData, setFormData] = useLocalStorage('formData', initialForm)
  const [previewFotoFrente, setPreviewFotoFrente] = useState(null)
  const [previewFotoVerso, setPreviewFotoVerso] = useState(null)

  const [isAdmin, setIsAdmin] = useLocalStorage('adminLogged', false)
  const [adminPasswordInput, setAdminPasswordInput] = useState('')
  const [submissions, setSubmissions] = useState([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [myResult, setMyResult] = useState(null)

  const hasSubmitted = useMemo(
    () => localStorage.getItem('submitted') === 'true',
    []
  )

  // Filtra submissões por status
  const filteredSubmissions = useMemo(() => {
    if (filterStatus === 'all') return submissions
    return submissions.filter(sub => sub.status === filterStatus)
  }, [submissions, filterStatus])

  // Stats para o admin
  const stats = useMemo(
    () => ({
      total: submissions.length,
      pendente: submissions.filter(s => s.status === 'pendente').length,
      aprovado: submissions.filter(s => s.status === 'aprovado').length,
      reprovado: submissions.filter(s => s.status === 'reprovado').length
    }),
    [submissions]
  )

  // Carrega submissões
  const loadSubmissions = useCallback(async () => {
    if (!isAdmin) return

    setSubmissionsLoading(true)
    try {
      const result = await fetchSubmissions({ limit: 100 })
      if (result.success) {
        setSubmissions(result.data)
      }
    } catch (error) {
      console.error('Erro ao carregar:', error)
    } finally {
      setSubmissionsLoading(false)
    }
  }, [isAdmin])

  // Subscription admin
  useEffect(() => {
    if (!isAdmin) return

    loadSubmissions()

    const unsubscribe = subscribeToSubmissions(payload => {
      if (payload.eventType === 'INSERT') {
        setSubmissions(prev => [payload.new, ...prev])
      } else if (payload.eventType === 'UPDATE') {
        setSubmissions(prev =>
          prev.map(sub => (sub.id === payload.new.id ? payload.new : sub))
        )
      } else if (payload.eventType === 'DELETE') {
        setSubmissions(prev => prev.filter(sub => sub.id !== payload.old.id))
      }
    })

    return unsubscribe
  }, [isAdmin, loadSubmissions])

  // Subscription usuário
  useEffect(() => {
    if (step !== STEPS.WAITING) return

    const checkUserResult = async () => {
      try {
        const result = await fetchUserSubmissions(userId, 1)
        if (result.success && result.data.length > 0) {
          const latest = result.data[0]
          if (latest.status !== 'pendente') {
            setMyResult(latest.status)
            setStep(STEPS.RESULT)
          }
        }
      } catch (error) {
        console.error('Erro:', error)
      }
    }

    checkUserResult()

    const unsubscribe = subscribeToUserSubmissions(userId, payload => {
      if (payload.eventType === 'UPDATE' && payload.new.status !== 'pendente') {
        setMyResult(payload.new.status)
        setStep(STEPS.RESULT)
      }
    })

    return unsubscribe
  }, [step, userId])

  useEffect(() => {
    if (hasSubmitted && step !== STEPS.WAITING && step !== STEPS.RESULT) {
      setStep(STEPS.WAITING)
    }
  }, [hasSubmitted, step])

  const validateStep = useCallback(() => {
    const newErrors = {}

    if (step === STEPS.BASIC_INFO) {
      if (!formData.nome.trim() || formData.nome.trim().length < 2) {
        newErrors.nome = 'Nome deve ter pelo menos 2 caracteres'
      }

      const idade = parseInt(formData.idade, 10)
      if (
        !formData.idade ||
        idade < VALIDATION_RULES.MIN_AGE ||
        idade > VALIDATION_RULES.MAX_AGE
      ) {
        newErrors.idade = `Idade entre ${VALIDATION_RULES.MIN_AGE}-${VALIDATION_RULES.MAX_AGE}`
      }

      if (!VALIDATION_RULES.EMAIL_REGEX.test(formData.email)) {
        newErrors.email = 'E-mail inválido'
      }

      if (
        !VALIDATION_RULES.PHONE_REGEX.test(formData.whatsapp.replace(/\D/g, ''))
      ) {
        newErrors.whatsapp = 'WhatsApp inválido (8-15 dígitos)'
      }
    } else if (step === STEPS.DOCUMENTS) {
      if (!formData.fotoFrente) newErrors.fotoFrente = 'Foto frente obrigatória'
      if (!formData.fotoVerso) newErrors.fotoVerso = 'Foto verso obrigatória'
    } else if (step === STEPS.TERMS) {
      if (!formData.termosAceitos) newErrors.termosAceitos = 'Aceite os termos'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [step, formData])

  const handleChange = useCallback(
    e => {
      const { name, value, type, checked, files } = e.target

      if (type === 'file') {
        const file = files[0]
        if (!file) return

        const validation = validateImageFile(file)
        if (!validation.valid) {
          setErrors(prev => ({ ...prev, [name]: validation.error }))
          return
        }

        setErrors(prev => {
          const newErrors = { ...prev }
          delete newErrors[name]
          return newErrors
        })

        setFormData(prev => ({ ...prev, [name]: file }))

        const reader = new FileReader()
        reader.onloadend = () => {
          if (name === 'fotoFrente') setPreviewFotoFrente(reader.result)
          if (name === 'fotoVerso') setPreviewFotoVerso(reader.result)
        }
        reader.readAsDataURL(file)
      } else if (type === 'checkbox') {
        setFormData(prev => ({ ...prev, [name]: checked }))
      } else {
        const processedValue =
          name === 'whatsapp' ? value.replace(/\D/g, '') : value
        setFormData(prev => ({ ...prev, [name]: processedValue }))
      }
    },
    [setFormData]
  )

  const removeImage = useCallback(
    name => {
      setFormData(prev => ({ ...prev, [name]: null }))
      if (name === 'fotoFrente') setPreviewFotoFrente(null)
      if (name === 'fotoVerso') setPreviewFotoVerso(null)
    },
    [setFormData]
  )

  const nextStep = useCallback(() => {
    if (validateStep()) setStep(prev => prev + 1)
  }, [validateStep])

  const prevStep = useCallback(() => setStep(prev => prev - 1), [])

  const handleSubmit = useCallback(
    async e => {
      e.preventDefault()
      if (!validateStep() || loading) return

      setLoading(true)
      try {
        const [frenteResult, versoResult] = await Promise.all([
          uploadImage(formData.fotoFrente, null, userId),
          uploadImage(formData.fotoVerso, null, userId)
        ])

        if (!frenteResult.success || !versoResult.success) {
          throw new Error('Falha no upload')
        }

        const submissionData = {
          nome: formData.nome.trim(),
          idade: parseInt(formData.idade, 10),
          email: formData.email.toLowerCase().trim(),
          whatsapp: formData.whatsapp,
          foto_frente: frenteResult.url,
          foto_verso: versoResult.url
        }

        const saveResult = await saveSubmission(submissionData, userId)

        if (!saveResult.success) {
          throw new Error(saveResult.error || 'Falha ao salvar')
        }

        localStorage.setItem('submitted', 'true')
        localStorage.removeItem('formData')
        setStep(STEPS.WAITING)
      } catch (error) {
        alert(`Erro: ${error.message}`)
      } finally {
        setLoading(false)
      }
    },
    [formData, userId, loading, validateStep]
  )

  const handleAdminLogin = useCallback(() => {
    if (adminPasswordInput === ADMIN_PASSWORD) {
      setIsAdmin(true)
      setStep(STEPS.ADMIN_PANEL)
    } else {
      alert('Senha incorreta!')
    }
  }, [adminPasswordInput, setIsAdmin])

  const handleAdminLogout = useCallback(() => {
    setIsAdmin(false)
    setSubmissions([])
    setStep(STEPS.BASIC_INFO)
  }, [setIsAdmin])

  const updateSubmissionStatus = useCallback(
    async (id, status) => {
      try {
        const result = await updateStatus(id, status, userId)
        if (result.success) {
          setSubmissions(prev =>
            prev.map(sub => (sub.id === id ? { ...sub, status } : sub))
          )
        } else {
          throw new Error(result.error)
        }
      } catch (error) {
        alert(`Erro: ${error.message}`)
      }
    },
    [userId]
  )

  const handleDeleteSubmission = useCallback(async id => {
    if (!confirm('Excluir esta submissão?')) return

    try {
      const result = await deleteSubmission(id)
      if (result.success) {
        setSubmissions(prev => prev.filter(sub => sub.id !== id))
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      alert(`Erro ao excluir: ${error.message}`)
    }
  }, [])

  const handleDeleteAll = useCallback(async () => {
    if (!confirm('⚠️ ATENÇÃO! Isso excluirá TODAS as submissões. Continuar?'))
      return

    try {
      const result = await deleteAllSubmissions()
      if (result.success) {
        setSubmissions([])
        alert('✅ Todas as submissões foram excluídas')
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      alert(`Erro: ${error.message}`)
    }
  }, [])

  const copyToClipboard = useCallback(async text => {
    try {
      await navigator.clipboard.writeText(text)
      alert('✅ Copiado!')
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      alert('✅ Copiado!')
    }
  }, [])

  // ADMIN PANEL
  if (isAdmin && step === STEPS.ADMIN_PANEL) {
    return (
      <div className='app admin'>
        <header className='admin-header'>
          <div className='admin-title'>
            <h1>🛡️ Painel Admin</h1>
            <button className='btn-logout' onClick={handleAdminLogout}>
              Sair
            </button>
          </div>

          <div className='admin-stats-grid'>
            <div className='stat-card'>
              <span className='stat-value'>{stats.total}</span>
              <span className='stat-label'>Total</span>
            </div>
            <div className='stat-card pending'>
              <span className='stat-value'>{stats.pendente}</span>
              <span className='stat-label'>Pendentes</span>
            </div>
            <div className='stat-card approved'>
              <span className='stat-value'>{stats.aprovado}</span>
              <span className='stat-label'>Aprovados</span>
            </div>
            <div className='stat-card rejected'>
              <span className='stat-value'>{stats.reprovado}</span>
              <span className='stat-label'>Reprovados</span>
            </div>
          </div>

          <div className='admin-actions'>
            <div className='filter-buttons'>
              <button
                className={filterStatus === 'all' ? 'active' : ''}
                onClick={() => setFilterStatus('all')}
              >
                Todos
              </button>
              <button
                className={filterStatus === 'pendente' ? 'active' : ''}
                onClick={() => setFilterStatus('pendente')}
              >
                Pendentes
              </button>
              <button
                className={filterStatus === 'aprovado' ? 'active' : ''}
                onClick={() => setFilterStatus('aprovado')}
              >
                Aprovados
              </button>
              <button
                className={filterStatus === 'reprovado' ? 'active' : ''}
                onClick={() => setFilterStatus('reprovado')}
              >
                Reprovados
              </button>
            </div>

            <div className='danger-zone'>
              <button className='btn-danger' onClick={handleDeleteAll}>
                🗑️ Excluir Todas
              </button>
            </div>
          </div>
        </header>

        {imagemModal && (
          <div className='modal-backdrop' onClick={() => setImagemModal(null)}>
            <div className='modal-content' onClick={e => e.stopPropagation()}>
              <button
                className='modal-close'
                onClick={() => setImagemModal(null)}
              >
                ✕
              </button>
              <img src={imagemModal} alt='Documento' />
            </div>
          </div>
        )}

        {submissionsLoading && (
          <div className='loading'>
            <div className='spinner'>⏳</div>
            <p>Carregando...</p>
          </div>
        )}

        {filteredSubmissions.length === 0 && !submissionsLoading && (
          <div className='empty-state'>
            <p>📋 Nenhuma submissão encontrada</p>
            <button onClick={loadSubmissions}>🔄 Recarregar</button>
          </div>
        )}

        <div className='submissions-grid'>
          {filteredSubmissions.map(sub => (
            <div
              key={sub.id}
              className={`submission-card status-${sub.status}`}
            >
              <div className='card-header'>
                <h3>{sub.nome}</h3>
                <div className='card-actions'>
                  <span className={`badge ${sub.status}`}>
                    {sub.status.toUpperCase()}
                  </span>
                  <button
                    className='btn-delete-card'
                    onClick={() => handleDeleteSubmission(sub.id)}
                    title='Excluir'
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div className='card-info'>
                <div className='info-row'>
                  <span>📅 {sub.idade} anos</span>
                  <span>📧 {sub.email}</span>
                </div>
                <div className='info-row'>
                  <span>📱 {sub.whatsapp}</span>
                  <button
                    className='btn-copy-inline'
                    onClick={() => copyToClipboard(sub.whatsapp)}
                  >
                    📋
                  </button>
                </div>
                <div className='info-row'>
                  <small>
                    🕐 {new Date(sub.created_at).toLocaleString('pt-BR')}
                  </small>
                </div>
              </div>

              <div className='card-images'>
                <div
                  className='image-box'
                  onClick={() => setImagemModal(sub.fotofrente)}
                >
                  {sub.fotofrente ? (
                    <img src={sub.fotofrente} alt='Frente' loading='lazy' />
                  ) : (
                    <div className='no-image'>❌</div>
                  )}
                  <span className='image-label'>Frente</span>
                </div>
                <div
                  className='image-box'
                  onClick={() => setImagemModal(sub.fotoverso)}
                >
                  {sub.fotoverso ? (
                    <img src={sub.fotoverso} alt='Verso' loading='lazy' />
                  ) : (
                    <div className='no-image'>❌</div>
                  )}
                  <span className='image-label'>Verso</span>
                </div>
              </div>

              {sub.status === 'pendente' && (
                <div className='card-buttons'>
                  <button
                    className='btn-approve'
                    onClick={() => updateSubmissionStatus(sub.id, 'aprovado')}
                  >
                    ✅ Aprovar
                  </button>
                  <button
                    className='btn-reject'
                    onClick={() => updateSubmissionStatus(sub.id, 'reprovado')}
                  >
                    ❌ Reprovar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // USER INTERFACE
  return (
    <div className='app'>
      <header className='app-header'>
        <h1>🔞 Verificação +18</h1>
        <p>DaVinci Comic</p>
        <button
          className='btn-admin'
          onClick={() => setStep(STEPS.ADMIN_LOGIN)}
          disabled={loading}
        >
          🛡️
        </button>
      </header>

      {step === STEPS.ADMIN_LOGIN && (
        <div className='step'>
          <h2>🔐 Login Admin</h2>
          <div className='form-group'>
            <input
              type='password'
              placeholder='Senha'
              value={adminPasswordInput}
              onChange={e => setAdminPasswordInput(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAdminLogin()}
            />
          </div>
          <div className='form-actions'>
            <button onClick={handleAdminLogin} disabled={!adminPasswordInput}>
              Entrar
            </button>
            <button
              className='btn-secondary'
              onClick={() => setStep(STEPS.BASIC_INFO)}
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {step === STEPS.BASIC_INFO && (
        <div className='step'>
          <h2>📝 Dados Básicos</h2>

          <div className='form-group'>
            <input
              type='text'
              name='nome'
              placeholder='Nome completo'
              value={formData.nome}
              onChange={handleChange}
              disabled={loading}
            />
            {errors.nome && <span className='error'>❌ {errors.nome}</span>}
          </div>

          <div className='form-group'>
            <input
              type='number'
              name='idade'
              placeholder='Idade'
              value={formData.idade}
              onChange={handleChange}
              min={VALIDATION_RULES.MIN_AGE}
              max={VALIDATION_RULES.MAX_AGE}
              disabled={loading}
            />
            {errors.idade && <span className='error'>❌ {errors.idade}</span>}
          </div>

          <div className='form-group'>
            <input
              type='email'
              name='email'
              placeholder='E-mail'
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
            />
            {errors.email && <span className='error'>❌ {errors.email}</span>}
          </div>

          <div className='form-group'>
            <input
              type='tel'
              name='whatsapp'
              placeholder='WhatsApp (somente números)'
              value={formData.whatsapp}
              onChange={handleChange}
              disabled={loading}
            />
            {errors.whatsapp && (
              <span className='error'>❌ {errors.whatsapp}</span>
            )}
          </div>

          <div className='form-actions'>
            <button onClick={nextStep} disabled={loading}>
              Próximo →
            </button>
          </div>
        </div>
      )}

      {step === STEPS.DOCUMENTS && (
        <div className='step'>
          <h2>📄 Documentos</h2>

          <div className='instructions'>
            <p>📸 Fotos nítidas da frente e verso do documento</p>
            <ul>
              <li>✅ Foto com todos os dados visíveis</li>
              <li>🔒 Pode cobrir CPF se desejar</li>
              <li>📏 Máximo 3MB por foto</li>
            </ul>
          </div>

          <div className='document-upload'>
            <h4>Frente</h4>
            {previewFotoFrente ? (
              <div className='image-preview'>
                <img src={previewFotoFrente} alt='Frente' />
                <button
                  className='btn-remove'
                  onClick={() => removeImage('fotoFrente')}
                  disabled={loading}
                >
                  🗑️
                </button>
              </div>
            ) : (
              <input
                type='file'
                name='fotoFrente'
                accept='image/*'
                onChange={handleChange}
                disabled={loading}
              />
            )}
            {errors.fotoFrente && (
              <span className='error'>❌ {errors.fotoFrente}</span>
            )}
          </div>

          <div className='document-upload'>
            <h4>Verso</h4>
            {previewFotoVerso ? (
              <div className='image-preview'>
                <img src={previewFotoVerso} alt='Verso' />
                <button
                  className='btn-remove'
                  onClick={() => removeImage('fotoVerso')}
                  disabled={loading}
                >
                  🗑️
                </button>
              </div>
            ) : (
              <input
                type='file'
                name='fotoVerso'
                accept='image/*'
                onChange={handleChange}
                disabled={loading}
              />
            )}
            {errors.fotoVerso && (
              <span className='error'>❌ {errors.fotoVerso}</span>
            )}
          </div>

          <div className='form-actions'>
            <button
              className='btn-secondary'
              onClick={prevStep}
              disabled={loading}
            >
              ← Voltar
            </button>
            <button onClick={nextStep} disabled={loading}>
              Próximo →
            </button>
          </div>
        </div>
      )}

      {step === STEPS.TERMS && (
        <div className='step'>
          <h2>📋 Termos</h2>

          <div className='terms-content'>
            <div className='notice'>
              <h3>🔒 Privacidade</h3>
              <p>Dados usados apenas para verificação de idade</p>
            </div>

            <div className='notice warning'>
              <h3>⚠️ Aviso</h3>
              <p>Documentos falsos resultam em banimento permanente</p>
            </div>

            <div className='notice'>
              <h3>🚀 Aprovação Rápida</h3>
              <ul>
                <li>✅ Foto de perfil visível no WhatsApp</li>
                <li>✅ Solicitação enviada no grupo</li>
                <li>✅ Fotos nítidas e legíveis</li>
              </ul>
            </div>
          </div>

          <div className='terms-agreement'>
            <label>
              <input
                type='checkbox'
                name='termosAceitos'
                checked={formData.termosAceitos}
                onChange={handleChange}
                disabled={loading}
              />
              Li e aceito os termos
            </label>
            {errors.termosAceitos && (
              <span className='error'>❌ {errors.termosAceitos}</span>
            )}
          </div>

          <div className='form-actions'>
            <button
              className='btn-secondary'
              onClick={prevStep}
              disabled={loading}
            >
              ← Voltar
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !formData.termosAceitos}
            >
              {loading ? '⏳ Enviando...' : '🚀 Enviar'}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.WAITING && (
        <div className='step waiting'>
          <div className='waiting-content'>
            <div className='spinner'>⏳</div>
            <h2>🔍 Analisando</h2>
            <p>Verificando suas informações...</p>
            <div className='waiting-info'>
              <p>⏱️ Tempo: 1-2 dias</p>
              <p>📱 Status: Aguardando</p>
            </div>
          </div>
        </div>
      )}

      {step === STEPS.RESULT && (
        <div className='step waiting'>
          <div className='waiting-content'>
            {myResult === 'aprovado' ? (
              <>
                <div className='spinner'>✅</div>
                <h2>🎉 Aprovado!</h2>
                <p>Sua verificação foi aprovada com sucesso!</p>
                <div className='waiting-info'>
                  <p>✅ Você já pode acessar o grupo</p>
                  <p>📱 Em breve você será adicionado</p>
                </div>
              </>
            ) : (
              <>
                <div className='spinner'>❌</div>
                <h2>😔 Reprovado</h2>
                <p>Infelizmente sua verificação foi reprovada.</p>
                <div className='waiting-info'>
                  <p>❌ Documentos inválidos ou ilegíveis</p>
                  <p>📧 Entre em contato para mais informações</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
