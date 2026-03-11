// --- 1. GESTIÓN DE MEMORIA (LocalStorage) ---
class StorageManager {
    static save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }
    static get(key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    }
    static clear() {
        localStorage.clear();
        location.reload();
    }
}

// --- 2. LÓGICA DE NEGOCIO (SOLID) ---
class AppState {
    constructor() {
        this.config = StorageManager.get('piso_config') || null;
        this.bookings = StorageManager.get('reservas') || [];
        this.expenses = StorageManager.get('gastos') || [];
    }

    addBooking(booking) {
        this.bookings.push(booking);
        StorageManager.save('reservas', this.bookings);
    }

    addExpense(expense) {
        this.expenses.push(expense);
        StorageManager.save('gastos', this.expenses);
    }
}

// --- 3. CONTROLADOR DE INTERFAZ (UI) ---
class UIController {
    constructor(state) {
        this.state = state;
        this.initNavigation();
        this.initForms();
        this.checkConfig();
        this.renderAll();
    }

    checkConfig() {
        const modal = document.getElementById('setup-modal');
        if (!this.state.config) {
            modal.classList.remove('hidden');
            document.getElementById('setup-form').onsubmit = (e) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const config = { direccion: formData.get('direccion'), cp: formData.get('cp') };
                StorageManager.save('piso_config', config);
                location.reload();
            };
        } else {
            document.getElementById('display-address').innerText = `${this.state.config.direccion} (${this.state.config.cp})`;
        }
    }

    initNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.getElementById(btn.dataset.target).classList.add('active');
                btn.classList.add('active');
            };
        });
        document.getElementById('clear-data').onclick = () => StorageManager.clear();
    }

    initForms() {
        // Form Reservas
        document.getElementById('form-booking').onsubmit = (e) => {
            e.preventDefault();
            const d = new FormData(e.target);
            this.state.addBooking({
                id: Date.now(),
                platform: d.get('platform'),
                checkin: d.get('checkin'),
                bruto: parseFloat(d.get('bruto')),
                limpieza: parseFloat(d.get('limpieza') || 0)
            });
            e.target.reset();
            this.renderAll();
        };

        // Form Gastos
        document.getElementById('form-expense').onsubmit = (e) => {
            e.preventDefault();
            const d = new FormData(e.target);
            this.state.addExpense({
                id: Date.now(),
                category: d.get('category'),
                amount: parseFloat(d.get('amount'))
            });
            e.target.reset();
            this.renderAll();
        };
    }

    renderAll() {
        this.renderLists();
        this.renderDashboard();
    }

    renderLists() {
        const bList = document.getElementById('list-bookings');
        bList.innerHTML = this.state.bookings.map(b => `
            <li><span>${b.checkin} <b>${b.platform}</b></span> <span>${b.bruto}€</span></li>
        `).join('');

        const eList = document.getElementById('list-expenses');
        eList.innerHTML = this.state.expenses.map(e => `
            <li><span>${e.category}</span> <span>-${e.amount}€</span></li>
        `).join('');
    }

    renderDashboard() {
        const totalBruto = this.state.bookings.reduce((acc, b) => acc + b.bruto, 0);
        const totalGastosDirectos = this.state.bookings.reduce((acc, b) => acc + b.limpieza, 0);
        const totalGastosFijos = this.state.expenses.reduce((acc, e) => acc + e.amount, 0);
        
        const totalGastos = totalGastosDirectos + totalGastosFijos;

        document.getElementById('dash-bruto').innerText = `${totalBruto.toLocaleString()}€`;
        document.getElementById('dash-gastos').innerText = `${totalGastos.toLocaleString()}€`;
        document.getElementById('dash-neto').innerText = `${(totalBruto - totalGastos).toLocaleString()}€`;
    }
}

// Iniciar la App
document.addEventListener('DOMContentLoaded', () => {
    const state = new AppState();
    new UIController(state);
});