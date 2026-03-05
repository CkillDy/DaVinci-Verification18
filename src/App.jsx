import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
import './App.css'

const ADMIN_PASSWORD = 'picapau2020'

const RULES = {
  MIN_AGE: 18,
  MAX_AGE: 50,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\d{8,15}$/
}

const S = {
  INFO: 1, DOCS: 2, TERMS: 3,
  WAITING: 'waiting', RESULT: 'result',
  ADMIN_LOGIN: 'admin-login', ADMIN: 'admin'
}

const STEP_LABELS = ['Dados', 'Documentos', 'Termos']

const getUserId = () => {
  const existing = localStorage.getItem('uid')
  if (existing) return existing
  const id = uuidv4()
  localStorage.setItem('uid', id)
  return id
}

const usePersistedState = (key, initial) => {
  const [val, setVal] = useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initial
    } catch { return initial }
  })
  const set = useCallback(v => {
    setVal(v)
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { }
  }, [key])
  return [val, set]
}

const SESSION_KEY = 'adm_session'
const LOCKOUT_KEY = 'adm_lockout'
const MAX_ATTEMPTS = 4
const SESSION_TTL = 8 * 60 * 60 * 1000

const getAdminSession = () => {
  try {
    const s = localStorage.getItem(SESSION_KEY)
    if (!s) return false
    const { ts } = JSON.parse(s)
    if (Date.now() - ts > SESSION_TTL) { localStorage.removeItem(SESSION_KEY); return false }
    return true
  } catch { return false }
}

const setAdminSession = () => {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ ts: Date.now() }))
}

const clearAdminSession = () => localStorage.removeItem(SESSION_KEY)

const getLockout = () => {
  try {
    const l = localStorage.getItem(LOCKOUT_KEY)
    if (!l) return { attempts: 0, lockedUntil: 0 }
    return JSON.parse(l)
  } catch { return { attempts: 0, lockedUntil: 0 } }
}

const setLockout = (data) => localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data))

const EMPTY_FORM = {
  nome: '', idade: '', email: '', whatsapp: '',
  fotoFrente: null, fotoVerso: null, termosAceitos: false
}

export default function App() {
  const [step, setStep] = useState(() => getAdminSession() ? S.ADMIN : S.INFO)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [formData, setFormData] = usePersistedState('fd', EMPTY_FORM)
  const [previews, setPreviews] = useState({ frente: null, verso: null })
  const [isAdmin, setIsAdmin] = useState(() => getAdminSession())
  const [adminPwd, setAdminPwd] = useState('')
  const [adminError, setAdminError] = useState('')
  const [lockout, setLockoutState] = useState(() => getLockout())
  const [submissions, setSubmissions] = useState([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [filter, setFilter] = useState('all')
  const [myResult, setMyResult] = useState(null)
  const userId = useMemo(() => getUserId(), [])
  const hasSubmitted = useMemo(() => localStorage.getItem('submitted') === 'true', [])

  const stats = useMemo(() => ({
    total: submissions.length,
    pendente: submissions.filter(s => s.status === 'pendente').length,
    aprovado: submissions.filter(s => s.status === 'aprovado').length,
    reprovado: submissions.filter(s => s.status === 'reprovado').length
  }), [submissions])

  const filtered = useMemo(() =>
    filter === 'all' ? submissions : submissions.filter(s => s.status === filter),
    [submissions, filter])

  const loadSubs = useCallback(async () => {
    setSubsLoading(true)
    const r = await fetchSubmissions({ limit: 100 })
    if (r.success) setSubmissions(r.data)
    setSubsLoading(false)
  }, [])

  const unsubRef = useRef(null)

  useEffect(() => {
    if (!isAdmin) return
    loadSubs()
    unsubRef.current = subscribeToSubmissions(p => {
      if (p.eventType === 'INSERT') {
        setSubmissions(prev => prev.some(s => s.id === p.new.id) ? prev : [p.new, ...prev])
      } else if (p.eventType === 'UPDATE') {
        setSubmissions(prev => prev.map(s => s.id === p.new.id ? p.new : s))
      } else if (p.eventType === 'DELETE') {
        const deletedId = p.old?.id ?? p.new?.id
        if (deletedId) setSubmissions(prev => prev.filter(s => s.id !== deletedId))
      }
    })
    return () => { unsubRef.current?.(); unsubRef.current = null }
  }, [isAdmin])

  useEffect(() => {
    if (step !== S.WAITING) return
    fetchUserSubmissions(userId, 1).then(r => {
      if (r.success && r.data.length > 0 && r.data[0].status !== 'pendente') {
        setMyResult(r.data[0].status)
        setStep(S.RESULT)
      }
    })
    return subscribeToUserSubmissions(userId, p => {
      if (p.eventType === 'UPDATE' && p.new.status !== 'pendente') {
        setMyResult(p.new.status)
        setStep(S.RESULT)
      }
    })
  }, [step, userId])

  useEffect(() => {
    if (hasSubmitted && step !== S.WAITING && step !== S.RESULT) setStep(S.WAITING)
  }, [hasSubmitted, step])

  const validate = useCallback(() => {
    const e = {}
    if (step === S.INFO) {
      if (!formData.nome.trim() || formData.nome.trim().length < 2) e.nome = 'Mínimo 2 caracteres'
      const age = parseInt(formData.idade, 10)
      if (!formData.idade || age < RULES.MIN_AGE || age > RULES.MAX_AGE) e.idade = 'Você precisa ter entre 18 e 50 anos'
      if (!RULES.EMAIL.test(formData.email)) e.email = 'E-mail inválido'
      if (!RULES.PHONE.test(formData.whatsapp.replace(/\D/g, ''))) e.whatsapp = 'Número inválido (8–15 dígitos)'
    } else if (step === S.DOCS) {
      if (!formData.fotoFrente) e.fotoFrente = 'Envie a frente do documento'
      if (!formData.fotoVerso) e.fotoVerso = 'Envie o verso do documento'
    } else if (step === S.TERMS) {
      if (!formData.termosAceitos) e.termosAceitos = 'Você precisa aceitar os termos'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }, [step, formData])

  const handleChange = useCallback(e => {
    const { name, value, type, checked, files } = e.target
    if (type === 'file') {
      const file = files[0]
      if (!file) return
      const v = validateImageFile(file)
      if (!v.valid) { setErrors(p => ({ ...p, [name]: v.error })); return }
      setErrors(p => { const n = { ...p }; delete n[name]; return n })
      setFormData(p => ({ ...p, [name]: file }))
      const reader = new FileReader()
      reader.onloadend = () => setPreviews(p => ({
        ...p, [name === 'fotoFrente' ? 'frente' : 'verso']: reader.result
      }))
      reader.readAsDataURL(file)
    } else if (type === 'checkbox') {
      setFormData(p => ({ ...p, [name]: checked }))
    } else {
      setFormData(p => ({ ...p, [name]: name === 'whatsapp' ? value.replace(/\D/g, '') : value }))
    }
  }, [setFormData])

  const removeImg = useCallback(name => {
    setFormData(p => ({ ...p, [name]: null }))
    setPreviews(p => ({ ...p, [name === 'fotoFrente' ? 'frente' : 'verso']: null }))
  }, [setFormData])

  const next = useCallback(() => { if (validate()) setStep(p => p + 1) }, [validate])
  const prev = useCallback(() => setStep(p => p - 1), [])

  const handleSubmit = useCallback(async e => {
    e.preventDefault()
    if (!validate() || loading) return
    setLoading(true)
    try {
      const [fr, vr] = await Promise.all([
        uploadImage(formData.fotoFrente, null, userId),
        uploadImage(formData.fotoVerso, null, userId)
      ])
      if (!fr.success || !vr.success) throw new Error('Falha no upload das imagens')
      const r = await saveSubmission({
        nome: formData.nome.trim(),
        idade: parseInt(formData.idade, 10),
        email: formData.email.toLowerCase().trim(),
        whatsapp: formData.whatsapp,
        foto_frente: fr.url,
        foto_verso: vr.url
      }, userId)
      if (!r.success) throw new Error(r.error)
      localStorage.setItem('submitted', 'true')
      localStorage.removeItem('fd')
      setStep(S.WAITING)
    } catch (err) {
      alert(`Erro ao enviar: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }, [formData, userId, loading, validate])

  const adminLogin = useCallback(() => {
    const now = Date.now()
    const lk = getLockout()

    if (lk.lockedUntil > now) {
      const mins = Math.ceil((lk.lockedUntil - now) / 60000)
      setAdminError(`Bloqueado. Tente em ${mins} min`)
      return
    }

    if (adminPwd === ADMIN_PASSWORD) {
      const reset = { attempts: 0, lockedUntil: 0 }
      setLockout(reset)
      setLockoutState(reset)
      setAdminSession()
      setIsAdmin(true)
      setStep(S.ADMIN)
      setAdminError('')
    } else {
      const attempts = lk.attempts + 1
      const lockedUntil = attempts >= MAX_ATTEMPTS ? now + 15 * 60 * 1000 : 0
      const next = { attempts, lockedUntil }
      setLockout(next)
      setLockoutState(next)
      if (attempts >= MAX_ATTEMPTS) {
        setAdminError('Acesso bloqueado por 15 minutos')
      } else {
        setAdminError(`Senha incorreta — ${MAX_ATTEMPTS - attempts} tentativa${MAX_ATTEMPTS - attempts === 1 ? '' : 's'} restante${MAX_ATTEMPTS - attempts === 1 ? '' : 's'}`)
      }
    }
  }, [adminPwd])

  const adminLogout = useCallback(() => {
    clearAdminSession()
    setIsAdmin(false)
    setSubmissions([])
    setStep(S.INFO)
  }, [])

  const updateSub = useCallback(async (id, status) => {
    const r = await updateStatus(id, status)
    if (r.success) setSubmissions(p => p.map(s => s.id === id ? { ...s, status } : s))
    else alert(`Erro: ${r.error}`)
  }, [])

  const deleteSub = useCallback(async id => {
    if (!confirm('Excluir esta submissão?')) return
    unsubRef.current?.()
    unsubRef.current = null
    setSubmissions(prev => prev.filter(s => s.id !== id))
    const r = await deleteSubmission(id)
    if (!r.success) {
      alert(`Erro: ${r.error}`)
      await loadSubs()
    }
    unsubRef.current = subscribeToSubmissions(p => {
      if (p.eventType === 'INSERT') {
        setSubmissions(prev => prev.some(s => s.id === p.new.id) ? prev : [p.new, ...prev])
      } else if (p.eventType === 'UPDATE') {
        setSubmissions(prev => prev.map(s => s.id === p.new.id ? p.new : s))
      } else if (p.eventType === 'DELETE') {
        const deletedId = p.old?.id ?? p.new?.id
        if (deletedId) setSubmissions(prev => prev.filter(s => s.id !== deletedId))
      }
    })
  }, [loadSubs])

  const deleteAll = useCallback(async () => {
    if (!confirm('EXCLUIR TODAS AS SUBMISSÕES?')) return
    unsubRef.current?.()
    unsubRef.current = null
    setSubmissions([])
    const r = await deleteAllSubmissions()
    if (!r.success) {
      alert(`Erro: ${r.error}`)
      await loadSubs()
    }
    unsubRef.current = subscribeToSubmissions(p => {
      if (p.eventType === 'INSERT') {
        setSubmissions(prev => prev.some(s => s.id === p.new.id) ? prev : [p.new, ...prev])
      } else if (p.eventType === 'UPDATE') {
        setSubmissions(prev => prev.map(s => s.id === p.new.id ? p.new : s))
      } else if (p.eventType === 'DELETE') {
        const deletedId = p.old?.id ?? p.new?.id
        if (deletedId) setSubmissions(prev => prev.filter(s => s.id !== deletedId))
      }
    })
  }, [loadSubs])

  const copy = useCallback(async text => {
    try { await navigator.clipboard.writeText(text) }
    catch {
      const t = document.createElement('textarea')
      t.value = text; document.body.appendChild(t); t.select()
      document.execCommand('copy'); document.body.removeChild(t)
    }
  }, [])

  /* ── ADMIN ──────────────────────────────── */
  if (isAdmin && step === S.ADMIN) return (
    <div className="adm">
      <div className="adm-crt" />

      <header className="adm-hdr">
        <div className="adm-hdr-top">
          <div className="adm-brand">
            <span className="adm-led" />
            <span className="adm-prompt">root@davinci<span className="adm-cur">_</span></span>
            <span className="adm-tag">ADMIN_PANEL</span>
          </div>
          <button className="adm-logout" onClick={adminLogout}>[logout]</button>
        </div>

        <div className="adm-stats">
          {[
            { k: 'TOTAL', v: stats.total, c: '' },
            { k: 'PENDING', v: stats.pendente, c: 'w' },
            { k: 'APPROVED', v: stats.aprovado, c: 'g' },
            { k: 'REJECTED', v: stats.reprovado, c: 'r' }
          ].map(({ k, v, c }) => (
            <div key={k} className={`adm-stat ${c}`}>
              <span className="adm-stat-v">{v}</span>
              <span className="adm-stat-k">{k}</span>
            </div>
          ))}
        </div>

        <div className="adm-bar">
          <div className="adm-filters">
            {['all', 'pendente', 'aprovado', 'reprovado'].map(f => (
              <button key={f} className={`adm-f ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'ALL' : f.toUpperCase()}
              </button>
            ))}
          </div>
          <button className="adm-rmall" onClick={deleteAll}>⌫ Deletar Todas</button>
        </div>
      </header>

      {modal && (
        <div className="adm-modal" onClick={() => setModal(null)}>
          <div className="adm-modal-box" onClick={e => e.stopPropagation()}>
            <button className="adm-modal-x" onClick={() => setModal(null)}>✕</button>
            <img src={modal} alt="doc" />
          </div>
        </div>
      )}

      {subsLoading && <div className="adm-state"><span className="adm-cur">&gt; fetching records...</span></div>}
      {!subsLoading && filtered.length === 0 && (
        <div className="adm-state">
          <span>&gt; no records found</span>
          <button className="adm-btn-outline" onClick={loadSubs}>reload</button>
        </div>
      )}

      <div className="adm-grid">
        {filtered.map(sub => (
          <div key={sub.id} className={`adm-card s-${sub.status}`}>
            <div className="adm-card-top">
              <span className="adm-card-name">{sub.nome}</span>
              <div className="adm-card-top-r">
                <span className={`adm-badge b-${sub.status}`}>{sub.status.toUpperCase()}</span>
                <button className="adm-del" onClick={() => deleteSub(sub.id)}>⌫ Deletar</button>
              </div>
            </div>

            <div className="adm-info">
              <span>{sub.idade}y · {sub.email}</span>
              <span className="adm-phone" onClick={() => copy(sub.whatsapp)} title="copiar">
                {sub.whatsapp} <span className="adm-copy-hint">⎘</span>
              </span>
              <span className="adm-ts">{new Date(sub.created_at).toLocaleString('pt-BR')}</span>
            </div>

            <div className="adm-imgs">
              {[['fotofrente', 'FRENTE'], ['fotoverso', 'VERSO']].map(([key, lbl]) => (
                <div key={key} className="adm-thumb" onClick={() => sub[key] && setModal(sub[key])}>
                  {sub[key] ? <img src={sub[key]} alt={lbl} loading="lazy" /> : <span className="adm-null">NULL</span>}
                  <span className="adm-lbl">{lbl}</span>
                </div>
              ))}
            </div>

            {sub.status === 'pendente' && (
              <div className="adm-acts">
                <button className="adm-ok" onClick={() => updateSub(sub.id, 'aprovado')}>✓ APPROVE</button>
                <button className="adm-rej" onClick={() => updateSub(sub.id, 'reprovado')}>✗ REJECT</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  /* ── USER ───────────────────────────────── */
  const isNumericStep = typeof step === 'number'

  return (
    <div className="usr">
      <div className="usr-monitor-bar">
        <span className="usr-monitor-dot" />
        <span>Acesso monitorado — dados adulterados resultam em banimento permanente</span>
        <span className="usr-monitor-dot" />
      </div>

      <header className="usr-hdr">
        <div className="usr-hdr-inner">
          <div className="usr-brand">
            <div className="usr-logo">
              <span className="usr-logo-text">18+</span>
              <div className="usr-logo-ring" />
            </div>
            <div className="usr-brand-text">
              <h1 className="usr-title">DaVinci <span className="usr-title-accent">Comic</span></h1>
              <span className="usr-sub">✦ Verificação de Acesso +18 ✦</span>
            </div>
          </div>
          <button className="usr-gear" onClick={() => setStep(S.ADMIN_LOGIN)} disabled={loading} title="Admin">⚙</button>
        </div>

        {isNumericStep && (
          <div className="usr-stepper">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1
              const done = step > n
              const active = step === n
              return (
                <div key={n} className="usr-step-wrap">
                  <div className={`usr-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
                    <div className="usr-step-dot">{done ? '✓' : n}</div>
                    <span className="usr-step-lbl">{label}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div className={`usr-step-connector ${done ? 'done' : ''}`} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </header>

      <main className="usr-main">

        {step === S.ADMIN_LOGIN && (() => {
          const isLocked = lockout.lockedUntil > Date.now()
          const remaining = MAX_ATTEMPTS - lockout.attempts
          return (
            <div className="usr-card fade-in">
              <div className="usr-card-eyebrow">Sistema</div>
              <h2 className="usr-card-title">Área restrita</h2>
              <p className="usr-card-desc">Somente para administradores autorizados.</p>
              {isLocked && (
                <div className="usr-lockout-banner">
                  🔒 Acesso bloqueado temporariamente por múltiplas tentativas incorretas
                </div>
              )}
              <div className="usr-field">
                <label className="usr-label">
                  Senha de acesso
                  {!isLocked && lockout.attempts > 0 && (
                    <span className="usr-attempts-left"> · {remaining} tentativa{remaining === 1 ? '' : 's'} restante{remaining === 1 ? '' : 's'}</span>
                  )}
                </label>
                <input className={`usr-input ${adminError ? 'err' : ''}`} type="password"
                  value={adminPwd}
                  onChange={e => { setAdminPwd(e.target.value); setAdminError('') }}
                  onKeyDown={e => e.key === 'Enter' && !isLocked && adminLogin()}
                  placeholder="••••••••" autoFocus disabled={isLocked} />
                {adminError && <span className="usr-error-msg">{adminError}</span>}
              </div>
              <div className="usr-row-btns">
                <button className="usr-btn-ghost" onClick={() => setStep(S.INFO)}>Voltar</button>
                <button className="usr-btn-primary" onClick={adminLogin} disabled={!adminPwd || isLocked}>Entrar</button>
              </div>
            </div>
          )
        })()}

        {step === S.INFO && (
          <div className="usr-card fade-in">
            <div className="usr-card-eyebrow">Passo 1 de 3</div>
            <h2 className="usr-card-title">Seus dados</h2>
            <p className="usr-card-desc">Use as informações exatamente como aparecem no seu documento.</p>
            {[
              { name: 'nome', type: 'text', label: 'Nome completo', placeholder: 'Igual ao documento' },
              { name: 'idade', type: 'number', label: 'Idade', placeholder: 'Sua idade atual' },
              { name: 'email', type: 'email', label: 'E-mail', placeholder: 'seu@email.com' },
              { name: 'whatsapp', type: 'tel', label: 'WhatsApp', placeholder: 'Somente números' }
            ].map(({ name, type, label, placeholder }) => (
              <div key={name} className="usr-field">
                <label className="usr-label">{label}</label>
                <input
                  className={`usr-input ${errors[name] ? 'err' : ''}`}
                  type={type} name={name} placeholder={placeholder}
                  value={formData[name]} onChange={handleChange} disabled={loading}
                />
                {errors[name] && <span className="usr-error-msg">{errors[name]}</span>}
              </div>
            ))}
            <div className="usr-warn-inline">
              🛡️ Todos os dados são verificados e monitorados
            </div>
            <button className="usr-btn-primary full" onClick={next} disabled={loading}>Continuar →</button>
          </div>
        )}

        {step === S.DOCS && (
          <div className="usr-card fade-in">
            <div className="usr-card-eyebrow">Passo 2 de 3</div>
            <h2 className="usr-card-title">Documento de identidade</h2>
            <p className="usr-card-desc">RG ou CNH — frente e verso, foto nítida e legível.</p>
            <div className="usr-tips">
              <span>📸 Todos os dados devem estar visíveis</span>
              <span>🔒 Pode cobrir o CPF se preferir</span>
              <span>📏 Máximo 3MB por foto · JPG, PNG ou WebP</span>
            </div>
            {[
              { name: 'fotoFrente', label: 'Frente do documento', preview: previews.frente },
              { name: 'fotoVerso', label: 'Verso do documento', preview: previews.verso }
            ].map(({ name, label, preview }) => (
              <div key={name} className="usr-field">
                <label className="usr-label">{label}</label>
                {preview ? (
                  <div className="usr-preview">
                    <img src={preview} alt={label} />
                    <button className="usr-btn-remove" onClick={() => removeImg(name)} disabled={loading}>
                      🗑 Remover foto
                    </button>
                  </div>
                ) : (
                  <label className={`usr-dropzone ${errors[name] ? 'err' : ''}`}>
                    <input type="file" name={name} accept="image/*" onChange={handleChange} disabled={loading} hidden />
                    <span className="usr-dz-icon">📎</span>
                    <span className="usr-dz-text">Toque para selecionar</span>
                    <span className="usr-dz-hint">ou arraste a imagem aqui</span>
                  </label>
                )}
                {errors[name] && <span className="usr-error-msg">{errors[name]}</span>}
              </div>
            ))}
            <div className="usr-row-btns">
              <button className="usr-btn-ghost" onClick={prev} disabled={loading}>← Voltar</button>
              <button className="usr-btn-primary" onClick={next} disabled={loading}>Continuar →</button>
            </div>
          </div>
        )}

        {step === S.TERMS && (
          <div className="usr-card fade-in">
            <div className="usr-card-eyebrow">Passo 3 de 3 · Quase lá</div>
            <h2 className="usr-card-title">Termos de uso</h2>
            <div className="usr-terms">
              <div className="usr-term">
                <span className="usr-term-ico">🔒</span>
                <div>
                  <strong>Privacidade garantida</strong>
                  <p>Seus dados são usados exclusivamente para verificação de idade e não são compartilhados.</p>
                </div>
              </div>
              <div className="usr-term warn">
                <span className="usr-term-ico">⚠️</span>
                <div>
                  <strong>Dados adulterados são detectados</strong>
                  <p>Documentos falsos ou informações incorretas resultam em banimento permanente e reporte às autoridades.</p>
                </div>
              </div>
              <div className="usr-term">
                <span className="usr-term-ico">⚡</span>
                <div>
                  <strong>Aprovação em até 1–2 dias úteis</strong>
                  <p>Foto de perfil visível no WhatsApp e solicitação no grupo aceleram a análise.</p>
                </div>
              </div>
            </div>
            <label className="usr-check">
              <input type="checkbox" name="termosAceitos" checked={formData.termosAceitos} onChange={handleChange} disabled={loading} />
              <span>Li, entendi e concordo com todos os termos</span>
            </label>
            {errors.termosAceitos && <span className="usr-error-msg">{errors.termosAceitos}</span>}
            <div className="usr-row-btns">
              <button className="usr-btn-ghost" onClick={prev} disabled={loading}>← Voltar</button>
              <button className="usr-btn-primary" onClick={handleSubmit} disabled={loading || !formData.termosAceitos}>
                {loading ? <span className="usr-dots">Enviando<span /><span /><span /></span> : '🚀 Enviar verificação'}
              </button>
            </div>
          </div>
        )}

        {step === S.WAITING && (
          <div className="usr-card fade-in usr-center">
            <div className="usr-waiting-art">
              <div className="usr-pulse" />
              <div className="usr-pulse-inner">🔍</div>
            </div>
            <h2 className="usr-card-title">Em análise</h2>
            <p className="usr-card-desc">Verificação enviada com sucesso! Nossa equipe está analisando seus documentos.</p>
            <div className="usr-status-badge">
              <span className="usr-status-dot" />
              Aguardando análise manual
            </div>
            <div className="usr-tips mt">
              <span>⏱ Prazo: 1 a 2 dias úteis</span>
              <span>💡 Mantenha esta página salva para acompanhar</span>
            </div>
          </div>
        )}

        {step === S.RESULT && (
          <div className={`usr-card fade-in usr-center`}>
            <div className={`usr-result-ico ${myResult}`}>
              {myResult === 'aprovado' ? '✓' : '✗'}
            </div>
            <h2 className={`usr-card-title result-title-${myResult}`}>
              {myResult === 'aprovado' ? '🎉 Verificação aprovada!' : 'Verificação reprovada'}
            </h2>
            <p className="usr-card-desc">
              {myResult === 'aprovado'
                ? 'Bem-vindo à comunidade DaVinci Comic! Em breve você será adicionado ao grupo.'
                : 'Seus documentos não passaram na verificação. Entre em contato para mais informações.'}
            </p>
            {myResult === 'aprovado' && (
              <div className="usr-approved-badge">✦ Membro verificado ✦</div>
            )}
          </div>
        )}

      </main>

      <footer className="usr-footer">
        <span>DaVinci Comic © {new Date().getFullYear()}</span>
        <span className="usr-footer-dot">·</span>
        <span>Acesso monitorado e seguro</span>
      </footer>
    </div>
  )
}