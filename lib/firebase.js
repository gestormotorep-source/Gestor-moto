// lib/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

if (typeof window !== 'undefined') {
  setPersistence(auth, browserSessionPersistence).catch((error) => {
    console.error("Error al configurar la persistencia de sesión:", error);
  });
}

// Base de datos principal (tienda principal)
export const db = getFirestore(app);

// Base de datos del almacén
export const dbAlmacen = getFirestore(app, 'almacen');

// Mapa de bases por sucursal, para uso dinámico
export const DB_POR_SUCURSAL = {
  principal: db,
  almacen: dbAlmacen,
};

export const storage = getStorage(app);

export let analytics;
if (typeof window !== 'undefined') {
  import('firebase/analytics').then(({ getAnalytics, isSupported }) => {
    isSupported().then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    }).catch((e) => {
      console.warn("Firebase Analytics no está disponible o no es compatible:", e);
    });
  }).catch((e) => {
    console.warn("Error al cargar Firebase Analytics:", e);
  });
}

export default app;