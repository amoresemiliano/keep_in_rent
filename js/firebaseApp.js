// js/firebaseApp.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const fallbackConfig = {
  apiKey: "AIzaSyBx7bqWMx7pqcwWz9mRByrD44JgFaCzCHg",
  authDomain: "keep-in-rent.firebaseapp.com",
  projectId: "keep-in-rent",
  storageBucket: "keep-in-rent.firebasestorage.app",
  messagingSenderId: "968181372355",
  appId: "1:968181372355:web:18d7036e3df2ef4d8b9976",
  measurementId: "G-3WKL4V8LTG"
};

let config = fallbackConfig;

// Attempt to use globally loaded config if available synchronously (if we somehow managed it)
// BUT since we switched to fetch, we MUST use a top-level await to block this module
// until the promise resolves, so exports are correctly initialized.
// Top-level await is supported in modern browsers for module scripts.

if (window.FIREBASE_CONFIG_PROMISE) {
    try {
        config = await window.FIREBASE_CONFIG_PROMISE || fallbackConfig;
    } catch (e) {
        console.error("Failed to load Firebase config from API, using fallback", e);
    }
} else if (window.FIREBASE_CONFIG) {
    config = window.FIREBASE_CONFIG;
}

const app = initializeApp(config);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { signInWithPopup, signOut, onAuthStateChanged };