import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDbjF3ttk03gVIPQrZVmz2WcVz6fuEgKY4",
  authDomain: "davinci-comic-verification.firebaseapp.com",
  projectId: "davinci-comic-verification",
  storageBucket: "davinci-comic-verification.appspot.com", // <- corrigido
  messagingSenderId: "805631337102",
  appId: "1:805631337102:web:aff36c971d02e120b11fdf",
  measurementId: "G-0FGGHFX3VD"
};

// Inicializa o app
const app = initializeApp(firebaseConfig);
console.log('[Firebase] App initialized:', app.name);

// Inicializa o Firestore
export const db = getFirestore(app);
console.log('[Firebase] Firestore initialized:', db instanceof Object);

// Inicializa o Storage
export const storage = getStorage(app);
console.log('[Firebase] Storage initialized:', storage instanceof Object);

export default { app, db, storage };
