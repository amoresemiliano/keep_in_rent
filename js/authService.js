// js/authService.js
import { auth, googleProvider, signInWithPopup, signOut } from "./firebaseApp.js";

/**
 * Inicia sesión con el flujo Pop-up de Google.
 * @returns {Promise<Object|null>} El objeto de usuario de Firebase o null si falla.
 */
export const loginWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    // Retornamos el objeto de usuario que contiene displayName, email, photoURL, uid, etc.
    return result.user;
  } catch (error) {
    console.error("Error en Google Auth:", error.code, error.message);

    // Manejo explícito para evitar romper la UI si el usuario cierra la ventana
    if (error.code === 'auth/popup-closed-by-user') {
      console.warn("El usuario cerró la ventana emergente de autenticación.");
    }
    return null;
  }
};

/**
 * Cierra la sesión activa en la aplicación.
 */
export const logout = async () => {
  try {
    await signOut(auth);
    console.log("Sesión cerrada correctamente.");
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
};