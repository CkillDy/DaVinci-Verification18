import { createClient } from '@supabase/supabase-js'
import imageCompression from 'browser-image-compression'

// ⚠️ MOVA PARA .env EM PRODUÇÃO
const supabaseUrl = 'https://uayvwxzbbduwlzbvmrcb.supabase.co'
const supabaseKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVheXZ3eHpiYmR1d2x6YnZtcmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyODc5MjksImV4cCI6MjA2ODg2MzkyOX0.92DoWolxL9wErpUyfQ3uml-VYZDKYjb8Z-j8lmEr0mw'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Configurações
const COMPRESSION_CONFIG = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/jpeg',
  initialQuality: 0.8
}

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]
const MAX_FILE_SIZE = 10 * 1024 * 1024

// ============================================
// VALIDAÇÃO E COMPRESSÃO
// ============================================

export function validateImageFile (file) {
  if (!file) return { valid: false, error: 'Nenhum arquivo selecionado' }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { valid: false, error: 'Tipo não permitido. Use: JPEG, PNG ou WebP' }
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Arquivo muito grande. Máximo: 10MB' }
  }

  return { valid: true }
}

export async function compressImage (file) {
  try {
    const validation = validateImageFile(file)
    if (!validation.valid) throw new Error(validation.error)

    // Não comprime se já é pequeno
    if (file.size < 3 * 1024 * 1024) return file

    console.log(`🔄 Comprimindo: ${(file.size / 1024 / 1024).toFixed(2)}MB`)

    const compressed = await imageCompression(file, COMPRESSION_CONFIG)

    console.log(
      `✅ Comprimido: ${(compressed.size / 1024 / 1024).toFixed(2)}MB`
    )
    return compressed
  } catch (error) {
    console.error('❌ Erro compressão:', error)
    throw new Error(`Falha ao comprimir: ${error.message}`)
  }
}

function generateUniqueFileName (originalName, userId = null) {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  const extension = originalName.split('.').pop()
  const prefix = userId ? `user_${userId}_` : ''
  return `${prefix}${timestamp}_${random}.${extension}`
}

// ============================================
// UPLOAD
// ============================================

export async function uploadImage (file, customPath = null, userId = null) {
  try {
    const compressed = await compressImage(file)
    const fileName = generateUniqueFileName(file.name, userId)
    const filePath =
      customPath || `images/${new Date().getFullYear()}/${fileName}`

    console.log(`📤 Upload: ${filePath}`)

    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(filePath, compressed, {
        cacheControl: '3600',
        upsert: false,
        contentType: compressed.type
      })

    if (error) throw new Error(`Upload falhou: ${error.message}`)

    const { data: urlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(data.path)

    console.log('✅ Upload OK')

    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path,
      size: compressed.size
    }
  } catch (error) {
    console.error('❌ uploadImage:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// CRUD OPERATIONS
// ============================================

export async function saveSubmission (data, userId = null) {
  try {
    if (!data || typeof data !== 'object') {
      throw new Error('Dados inválidos')
    }

    const payload = {
      nome: data.nome?.trim(),
      idade: parseInt(data.idade),
      email: data.email?.toLowerCase().trim(),
      whatsapp: data.whatsapp?.trim(),
      fotofrente: data.foto_frente || data.fotofrente,
      fotoverso: data.foto_verso || data.fotoverso,
      userid: userId,
      status: 'pendente'
    }

    console.log('💾 Salvando submissão...')

    const { data: inserted, error } = await supabase
      .from('verificacoes')
      .insert([payload])
      .select()
      .single()

    if (error) throw new Error(`DB erro: ${error.message}`)

    console.log('✅ Salvo:', inserted.id)
    return { success: true, id: inserted.id, data: inserted }
  } catch (error) {
    console.error('❌ saveSubmission:', error)
    return { success: false, error: error.message }
  }
}

export async function fetchSubmissions (options = {}) {
  try {
    const { limit = 50, offset = 0, status = null, userId = null } = options

    let query = supabase
      .from('verificacoes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (userId) query = query.eq('userid', userId)
    if (limit) query = query.limit(limit)
    if (offset) query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) throw new Error(`Consulta falhou: ${error.message}`)

    return { success: true, data: data || [], count: count || 0 }
  } catch (error) {
    console.error('❌ fetchSubmissions:', error)
    return { success: false, error: error.message, data: [], count: 0 }
  }
}

export async function fetchUserSubmissions (userId, limit = 20) {
  if (!userId) {
    return { success: false, error: 'UserID obrigatório', data: [] }
  }
  return fetchSubmissions({ userId, limit })
}

export async function updateStatus (submissionId, newStatus) {
  try {
    console.log(`🔄 Atualizando ${submissionId} → ${newStatus}`)

    const { data, error } = await supabase
      .from('verificacoes')
      .update({ status: newStatus })
      .eq('id', submissionId)
      .select()
      .single()

    if (error) throw new Error(`Update falhou: ${error.message}`)

    console.log('✅ Status atualizado')
    return { success: true, data }
  } catch (error) {
    console.error('❌ updateStatus:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// 🆕 DELETE OPERATIONS
// ============================================

export async function deleteSubmission (submissionId) {
  try {
    console.log(`🗑️ Excluindo submissão: ${submissionId}`)

    // Busca a submissão para pegar os URLs das imagens
    const { data: submission, error: fetchError } = await supabase
      .from('verificacoes')
      .select('fotofrente, fotoverso')
      .eq('id', submissionId)
      .single()

    if (fetchError) throw new Error(`Erro ao buscar: ${fetchError.message}`)

    // Deleta do banco
    const { error: deleteError } = await supabase
      .from('verificacoes')
      .delete()
      .eq('id', submissionId)

    if (deleteError) throw new Error(`Erro ao deletar: ${deleteError.message}`)

    // Tenta deletar as imagens do storage (opcional, não bloqueia)
    if (submission) {
      try {
        const pathsToDelete = []

        if (submission.fotofrente) {
          const path = new URL(submission.fotofrente).pathname
            .split('/')
            .slice(-2)
            .join('/')
          pathsToDelete.push(path)
        }

        if (submission.fotoverso) {
          const path = new URL(submission.fotoverso).pathname
            .split('/')
            .slice(-2)
            .join('/')
          pathsToDelete.push(path)
        }

        if (pathsToDelete.length > 0) {
          await supabase.storage.from('uploads').remove(pathsToDelete)
          console.log('🗑️ Imagens deletadas do storage')
        }
      } catch (storageError) {
        console.warn('⚠️ Erro ao deletar imagens (não crítico):', storageError)
      }
    }

    console.log('✅ Submissão excluída')
    return { success: true }
  } catch (error) {
    console.error('❌ deleteSubmission:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteAllSubmissions () {
  try {
    console.log('🗑️ Excluindo TODAS as submissões...')

    // Busca todas as submissões para pegar as imagens
    const { data: allSubmissions, error: fetchError } = await supabase
      .from('verificacoes')
      .select('id, fotofrente, fotoverso')

    if (fetchError) throw new Error(`Erro ao buscar: ${fetchError.message}`)

    // Deleta todas do banco
    const { error: deleteError } = await supabase
      .from('verificacoes')
      .delete()
      .neq('id', 0) // Deleta tudo (workaround para "delete all")

    if (deleteError) throw new Error(`Erro ao deletar: ${deleteError.message}`)

    // Tenta deletar todas as imagens (não bloqueia se falhar)
    if (allSubmissions && allSubmissions.length > 0) {
      try {
        const pathsToDelete = []

        allSubmissions.forEach(sub => {
          if (sub.fotofrente) {
            const path = new URL(sub.fotofrente).pathname
              .split('/')
              .slice(-2)
              .join('/')
            pathsToDelete.push(path)
          }
          if (sub.fotoverso) {
            const path = new URL(sub.fotoverso).pathname
              .split('/')
              .slice(-2)
              .join('/')
            pathsToDelete.push(path)
          }
        })

        if (pathsToDelete.length > 0) {
          await supabase.storage.from('uploads').remove(pathsToDelete)
          console.log(`🗑️ ${pathsToDelete.length} imagens deletadas`)
        }
      } catch (storageError) {
        console.warn('⚠️ Erro ao deletar imagens (não crítico):', storageError)
      }
    }

    console.log('✅ Todas as submissões excluídas')
    return { success: true, deletedCount: allSubmissions?.length || 0 }
  } catch (error) {
    console.error('❌ deleteAllSubmissions:', error)
    return { success: false, error: error.message }
  }
}

// ============================================
// REAL-TIME SUBSCRIPTIONS
// ============================================

export function subscribeToSubmissions (callback, options = {}) {
  const { includeRemoved = false } = options
  console.log('📡 Iniciando subscription...')

  let lastEventTime = 0

  const channel = supabase
    .channel('verificacoes-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'verificacoes' },
      payload => {
        const now = Date.now()

        // Previne duplicados
        if (now - lastEventTime < 100) {
          console.log('⚠️ Duplicado ignorado')
          return
        }
        lastEventTime = now

        // Filtra removidos
        if (!includeRemoved && payload.new?.status === 'removido') return

        console.log('📡 Mudança:', payload.eventType)

        try {
          callback(payload)
        } catch (error) {
          console.error('❌ Callback erro:', error)
        }
      }
    )
    .subscribe(status => {
      console.log(`📡 Status: ${status}`)
    })

  return () => {
    console.log('🔄 Cancelando subscription')
    supabase.removeChannel(channel)
  }
}

export function subscribeToUserSubmissions (userId, callback) {
  if (!userId) {
    console.error('❌ UserID obrigatório')
    return () => {}
  }

  console.log(`📡 User subscription: ${userId}`)

  let lastEventTime = 0

  const channel = supabase
    .channel(`user-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'verificacoes',
        filter: `userid=eq.${userId}`
      },
      payload => {
        const now = Date.now()
        if (now - lastEventTime < 100) return
        lastEventTime = now

        console.log('📡 User mudança:', payload.eventType)

        try {
          callback(payload)
        } catch (error) {
          console.error('❌ Callback erro:', error)
        }
      }
    )
    .subscribe(status => {
      console.log(`📡 User status: ${status}`)
    })

  return () => {
    console.log('🔄 User subscription cancelada')
    supabase.removeChannel(channel)
  }
}

// ============================================
// UTILIDADES
// ============================================

export async function testConnection () {
  try {
    console.log('🔄 Testando conexão...')

    const { data, error } = await supabase
      .from('verificacoes')
      .select('count(*)')
      .limit(1)

    if (error) throw error

    console.log('✅ Conexão OK')
    return { success: true, message: 'Conectado' }
  } catch (error) {
    console.error('❌ Conexão erro:', error)
    return { success: false, error: error.message }
  }
}
