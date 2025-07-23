import { db, storage } from './firebase';
import {
  ref,
  uploadBytes,
  getDownloadURL
} from 'firebase/storage';
import {
  collection,
  addDoc,
  getDocs,
  getDocsFromServer,
  onSnapshot,
  query,
  orderBy,
  where
} from 'firebase/firestore';
import { compressImage } from './compressImage';

/**
 * Faz upload da imagem (com compressão) e retorna a URL pública
 */
export async function uploadImage(file, path) {
  const compressed = await compressImage(file);
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, compressed);
  return await getDownloadURL(storageRef);
}

/**
 * Salva um novo documento de submissão no Firestore
 */
export async function saveSubmission(data, userId) {
  const docRef = await addDoc(collection(db, 'submissions'), {
    ...data,
    userId,
    createdAt: new Date().toISOString(),
    status: 'pendente',
  });
  return docRef.id;
}

/**
 * Busca uma vez todas as submissões (padrão, pode vir de cache ou servidor)
 */
export async function fetchSubmissions() {
  const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Busca diretamente do servidor, ignorando cache local
 */
export async function fetchSubmissionsServerOnly() {
  const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocsFromServer(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Inscrição em tempo real: recebe inicial + apenas deltas quando houver mudança no servidor
 */
export function subscribeToSubmissions(callback) {
  const q = query(collection(db, 'submissions'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    snapshot => {
      const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(subs);
    },
    error => console.error('[subscribeToSubmissions] erro no listener:', error)
  );
}

/**
 * Inscrição apenas para as submissões de um usuário específico
 */
export function subscribeToUserSubmissions(userId, callback) {
  const q = query(
    collection(db, 'submissions'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(
    q,
    snapshot => {
      const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      callback(subs);
    },
    error => console.error('[subscribeToUserSubmissions] erro no listener:', error)
  );
}
