// supabase.js - Versão Corrigida
import { createClient } from '@supabase/supabase-js';
import imageCompression from 'browser-image-compression';

// ⚠️ IMPORTANTE: Em produção, mova essas variáveis para variáveis de ambiente
const supabaseUrl = 'https://uayvwxzbbduwlzbvmrcb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVheXZ3eHpiYmR1d2x6YnZtcmNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyODc5MjksImV4cCI6MjA2ODg2MzkyOX0.92DoWolxL9wErpUyfQ3uml-VYZDKYjb8Z-j8lmEr0mw';

const supabase = createClient(supabaseUrl, supabaseKey);

// Configurações de compressão otimizadas
const COMPRESSION_CONFIG = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/jpeg',
  initialQuality: 0.8
};

// Validação de arquivos
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * ✅ Valida arquivo de imagem
 */
export function validateImageFile(file) {
  if (!file) {
    return { valid: false, error: 'Nenhum arquivo selecionado' };
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Tipo de arquivo não permitido. Use: JPEG, PNG ou WebP'
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: 'Arquivo muito grande. Máximo: 10MB'
    };
  }

  return { valid: true };
}

/**
 * ✅ Comprime imagem se necessário
 */
export async function compressImage(file) {
  try {
    const validation = validateImageFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Se arquivo já é pequeno, não comprime
    if (file.size < 3 * 1024 * 1024) {
      return file;
    }

    console.log(`🔄 Comprimindo: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)`);

    const compressedFile = await imageCompression(file, COMPRESSION_CONFIG);

    console.log(`✅ Comprimido: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);

    return compressedFile;
  } catch (error) {
    console.error('❌ Erro na compressão:', error);
    throw new Error(`Falha ao comprimir: ${error.message}`);
  }
}

/**
 * ✅ Gera nome único para arquivo
 */
function generateUniqueFileName(originalName, userId = null) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  const userPrefix = userId ? `user_${userId}_` : '';

  return `${userPrefix}${timestamp}_${random}.${extension}`;
}

/**
 * ✅ Upload de imagem otimizado
 */
export async function uploadImage(file, customPath = null, userId = null) {
  try {
    // Comprime imagem
    const compressedFile = await compressImage(file);

    // Gera caminho único
    const fileName = generateUniqueFileName(file.name, userId);
    const filePath = customPath || `images/${new Date().getFullYear()}/${fileName}`;

    console.log(`📤 Upload: ${filePath}`);

    // Upload para Supabase Storage
    const { data, error } = await supabase.storage
      .from('uploads')
      .upload(filePath, compressedFile, {
        cacheControl: '3600',
        upsert: false, // Evita sobrescrever
        contentType: compressedFile.type,
      });

    if (error) {
      console.error('❌ Erro upload:', error);
      throw new Error(`Upload falhou: ${error.message}`);
    }

    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from('uploads')
      .getPublicUrl(data.path);

    console.log('✅ Upload OK:', urlData.publicUrl);

    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path,
      size: compressedFile.size
    };

  } catch (error) {
    console.error('❌ uploadImage erro:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * ✅ Salva submissão com nomes corretos das colunas
 */
export async function saveSubmission(data, userId = null) {
  try {
    if (!data || typeof data !== 'object') {
      throw new Error('Dados inválidos');
    }

    // ✅ CORRIGIDO: Nomes das colunas corretos
    const payload = {
      nome: data.nome?.trim(),
      idade: parseInt(data.idade),
      email: data.email?.toLowerCase().trim(),
      whatsapp: data.whatsapp?.trim(),
      fotofrente: data.foto_frente || data.fotofrente, // Aceita ambos
      fotoverso: data.foto_verso || data.fotoverso,   // Aceita ambos
      userid: userId,
      status: 'pendente',
      created_at: new Date().toISOString()
    };

    console.log('💾 Salvando:', { ...payload, userid: '***' });

    const { data: inserted, error } = await supabase
      .from('verificacoes')
      .insert([payload])
      .select()
      .single();

    if (error) {
      console.error('❌ Erro DB:', error);
      throw new Error(`DB erro: ${error.message}`);
    }

    console.log('✅ Salvo ID:', inserted.id);
    return { success: true, id: inserted.id, data: inserted };

  } catch (error) {
    console.error('❌ saveSubmission erro:', error);
    return { success: false, error: error.message };
  }
}

/**
 * ✅ Busca submissões otimizada
 */
export async function fetchSubmissions(options = {}) {
  try {
    const {
      limit = 50,
      offset = 0,
      status = null,
      userId = null
    } = options;

    let query = supabase
      .from('verificacoes')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filtros
    if (status) query = query.eq('status', status);
    if (userId) query = query.eq('userid', userId); // ✅ CORRIGIDO

    // Paginação
    if (limit) query = query.limit(limit);
    if (offset) query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('❌ Fetch erro:', error);
      throw new Error(`Consulta falhou: ${error.message}`);
    }

    return {
      success: true,
      data: data || [],
      count: count || 0
    };

  } catch (error) {
    console.error('❌ fetchSubmissions erro:', error);
    return {
      success: false,
      error: error.message,
      data: [],
      count: 0
    };
  }
}

/**
 * ✅ Busca submissões do usuário
 */
export async function fetchUserSubmissions(userId, limit = 20) {
  if (!userId) {
    return { success: false, error: 'UserID obrigatório', data: [] };
  }

  return fetchSubmissions({ userId, limit });
}

/**
 * ✅ Atualiza status da submissão
 */// ✅ CÓDIGO CORRIGIDO:
export const updateStatus = async (submissionId, newStatus) => {
  try {
    console.log(`🔄 Atualizando ${submissionId} → ${newStatus}`);

    const { data, error } = await supabase
      .from('verificacoes')
      .update({
        status: newStatus
        // ❌ NÃO inclua updated_at aqui
      })
      .eq('id', submissionId)
      .select()
      .single();

    if (error) {
      console.error('❌ Update erro:', error);
      throw new Error(`Update falhou: ${error.message}`);
    }

    console.log('✅ Status atualizado:', data);
    return {
      success: true,
      data
    };

  } catch (error) {
    console.error('❌ updateStatus erro:', error);
    return {
      success: false,
      error: error.message
    };
  }
};
/**
 * ✅ Subscription em tempo real otimizada
 */
export function subscribeToSubmissions(callback, options = {}) {
  const { includeRemoved = false } = options;

  console.log('📡 Iniciando subscription...');

  let lastEventTime = 0;

  const channel = supabase
    .channel('verificacoes-realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'verificacoes' },
      (payload) => {
        const now = Date.now();

        // ✅ Evita eventos duplicados
        if (now - lastEventTime < 100) {
          console.log('⚠️ Evento duplicado ignorado');
          return;
        }
        lastEventTime = now;

        console.log('📡 Mudança:', payload.eventType, payload.new?.id);

        // Filtra removidos se necessário
        if (!includeRemoved && payload.new?.status === 'removido') {
          return;
        }

        try {
          callback(payload);
        } catch (error) {
          console.error('❌ Callback erro:', error);
        }
      }
    )
    .subscribe((status) => {
      console.log(`📡 Subscription: ${status}`);
    });

  // Retorna função cleanup
  return () => {
    console.log('🔄 Cancelando subscription...');
    supabase.removeChannel(channel);
  };
}

/**
 * ✅ Subscription para usuário específico
 */
export function subscribeToUserSubmissions(userId, callback) {
  if (!userId) {
    console.error('❌ UserID obrigatório');
    return () => { };
  }

  console.log(`📡 User subscription: ${userId}`);

  let lastEventTime = 0;

  const channel = supabase
    .channel(`user-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'verificacoes',
        filter: `userid=eq.${userId}`, // ✅ CORRIGIDO
      },
      (payload) => {
        const now = Date.now();

        // ✅ Evita eventos duplicados
        if (now - lastEventTime < 100) {
          return;
        }
        lastEventTime = now;

        console.log('📡 User mudança:', payload.eventType, payload.new?.id);

        try {
          callback(payload);
        } catch (error) {
          console.error('❌ User callback erro:', error);
        }
      }
    )
    .subscribe((status) => {
      console.log(`📡 User subscription: ${status}`);
    });

  return () => {
    console.log('🔄 User subscription cancelada');
    supabase.removeChannel(channel);
  };
}

/**
 * ✅ Testa conexão
 */
export async function testConnection() {
  try {
    console.log('🔄 Testando conexão...');

    const { data, error } = await supabase
      .from('verificacoes')
      .select('count(*)')
      .limit(1);

    if (error) throw error;

    console.log('✅ Conexão OK');
    return { success: true, message: 'Conectado' };

  } catch (error) {
    console.error('❌ Conexão erro:', error);
    return { success: false, error: error.message };
  }
}

// Exporta cliente para uso direto
export { supabase };