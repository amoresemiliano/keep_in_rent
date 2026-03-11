import { AppState } from './state.js';
import { UI } from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    try {
        const state = new AppState();
        const ui = new UI(state);
        window.app = ui; // Para que puedas usar 'app' en la consola si hace falta
        
        // Si no hay configuración previa, forzamos el modal de bienvenida
        if (!state.config) {
            document.getElementById('setup-modal').classList.remove('hidden');
        } else {
            ui.renderAll();
        }
        console.log("Sistema Modular iniciado correctamente.");
    } catch (e) {
        console.error("Error crítico en el inicio:", e);
    }
});