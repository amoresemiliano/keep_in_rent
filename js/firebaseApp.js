// js/firebaseApp.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBx7bqWMx7pqcwWz9mRByrD44JgFaCzCHg",
  authDomain: "keep-in-rent.firebaseapp.com",
  projectId: "keep-in-rent",
  storageBucket: "keep-in-rent.firebasestorage.app",
  messagingSenderId: "968181372355",
  appId: "1:968181372355:web:18d7036e3df2ef4d8b9976",
  measurementId: "G-3WKL4V8LTG"
};

// Inicializamos la aplicación de Firebase
const app = initializeApp(firebaseConfig);

// Exportamos las instancias necesarias para los servicios de autenticación
export const auth = getAuth(app);

// Configuración del proveedor de Google
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' }); // Fuerza a elegir cuenta siempre

export { signInWithPopup, signOut, onAuthStateChanged };