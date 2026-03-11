// --- 1. CONFIGURACIÓN Y CONSTANTES ---
const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COUNTRIES = ["España", "Francia", "Alemania", "Reino Unido", "Italia", "EE.UU.", "México", "Argentina", "Brasil", "Portugal", "Otros"].sort();

// --- 2. GESTIÓN DE ESTADO ---
class AppState {
    constructor() {
        this.currentActiveId = localStorage.getItem('last_active_id') || null;
        this.config = null;
        this.bookings = [];
        this.expenses = [];
        this.bankRecords = [];
        // Filtros independientes por pestaña
        this.filters = {
            dashboard: { start: '', end: '' },
            bookings: { start: '', end: '' },
            expenses: { start: '', end: '' },
            analysis: { start: '', end: '' }
        };
        if(this.currentActiveId) this.loadActiveData(this.currentActiveId);
    }

    generateId(dir) { return btoa(dir.toLowerCase().replace(/\s/g, '')).substring(0, 10); }

    loadActiveData(id) {
        this.currentActiveId = id;
        localStorage.setItem('last_active_id', id);
        this.config = JSON.parse(localStorage.getItem(`conf_${id}`)) || null;
        this.bookings = JSON.parse(localStorage.getItem(`res_${id}`)) || [];
        this.expenses = JSON.parse(localStorage.getItem(`gas_${id}`)) || [];
        this.bankRecords = JSON.parse(localStorage.getItem(`bnk_${id}`)) || [];
        this.initDefaultFilters();
    }

    initDefaultFilters() {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
        const end = new Date(now.getFullYear(), 11, 31).toISOString().split('T')[0];
        Object.keys(this.filters).forEach(k => {
            this.filters[k].start = start;
            this.filters[k].end = end;
        });
    }

    save() {
        if(!this.currentActiveId) return;
        const id = this.currentActiveId;
        localStorage.setItem(`conf_${id}`, JSON.stringify(this.config));
        localStorage.setItem(`res_${id}`, JSON.stringify(this.bookings));
        localStorage.setItem(`gas_${id}`, JSON.stringify(this.expenses));
        localStorage.setItem(`bnk_${id}`, JSON.stringify(this.bankRecords));
    }

    addBooking(data) {
        const nights = Math.max(1, (new Date(data.checkout) - new Date(data.checkin)) / 86400000);
        const net = parseFloat(data.bruto) - (parseFloat(data.fee_banco)||0) - (parseFloat(data.fee_thl)||0) - (parseFloat(data.limpieza)||0);
        if(data.booking_id) this.bookings = this.bookings.map(b => b.id == data.booking_id ? {...data, nights, net, id: b.id} : b);
        else this.bookings.push({...data, nights, net, id: Date.now() + Math.random()});
        this.save();
    }

    addExpense(data) {
        if(data.expense_id) this.expenses = this.expenses.map(e => e.id == data.expense_id ? {...data, id: e.id} : e);
        else this.expenses.push({...data, id: Date.now() + Math.random()});
        this.save();
    }
}

// --- 3. CONTROLADOR DE INTERFAZ ---
class UI {
    constructor(state) {
        this.state = state;
        this.chart = null;
        this.sortStates = { bookings: { key: 'checkin', dir: -1 }, expenses: { key: 'date', dir: -1 } };
        this.init();
    }

    init() {
        this.checkConfig();
        this.bindEvents();
        this.renderAll();
    }

    checkConfig() {
        if(!this.state.config) document.getElementById('setup-modal').classList.remove('hidden');
        else {
            document.getElementById('display-address').innerText = this.state.config.direccion;
            document.getElementById('setup-modal').classList.add('hidden');
        }
    }

    bindEvents() {
        // Navegación
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.app-view, .nav-btn').forEach(el => el.classList.remove('active'));
                document.getElementById(btn.dataset.target).classList.add('active');
                btn.classList.add('active');
                this.renderAll();
            };
        });

        // Configuración de activo
        document.getElementById('setup-form').onsubmit = (e) => {
            e.preventDefault();
            const data = Object.fromEntries(new FormData(e.target));
            this.state.loadActiveData(this.state.generateId(data.direccion));
            this.state.config = data;
            this.state.save();
            this.checkConfig();
            this.renderAll();
        };

        // Escuchar cambios en filtros de fecha por vista
        ['dashboard', 'bookings', 'expenses', 'analysis'].forEach(view => {
            document.getElementById(`f-${view}-start`).onchange = (e) => { this.state.filters[view].start = e.target.value; this.renderAll(); };
            document.getElementById(`f-${view}-end`).onchange = (e) => { this.state.filters[view].end = e.target.value; this.renderAll(); };
        });

        // Formulario Reservas y Gastos
        document.getElementById('form-booking').onsubmit = (e) => {
            e.preventDefault();
            this.state.addBooking(Object.fromEntries(new FormData(e.target)));
            e.target.reset();
            this.renderAll();
        };

        document.getElementById('form-expense').onsubmit = (e) => {
            e.preventDefault();
            this.state.addExpense(Object.fromEntries(new FormData(e.target)));
            e.target.reset();
            this.renderAll();
        };

        // Selector de Métrica en Análisis
        document.getElementById('analysis-metric-select').onchange = () => this.renderAnalysis();
    }

    getFiltered(col, field, viewKey) {
        const s = this.state.filters[viewKey].start;
        const e = this.state.filters[viewKey].end;
        return col.filter(item => item[field] >= s && item[field] <= e);
    }

    renderAll() {
        if(!this.state.config) return;
        this.syncFilterInputs();
        this.renderDashboard();
        this.renderBookings();
        this.renderExpenses();
        this.renderAnalysis();
        this.renderBank();
    }

    syncFilterInputs() {
        ['dashboard', 'bookings', 'expenses', 'analysis'].forEach(v => {
            document.getElementById(`f-${v}-start`).value = this.state.filters[v].start;
            document.getElementById(`f-${v}-end`).value = this.state.filters[v].end;
        });
    }

    // --- RENDERS ESPECÍFICOS ---

    renderDashboard() {
        const fb = this.getFiltered(this.state.bookings, 'checkin', 'dashboard');
        const fe = this.getFiltered(this.state.expenses, 'date', 'dashboard');
        const bruto = fb.reduce((s, b) => s + parseFloat(b.bruto), 0);
        const gestion = fb.reduce((s, b) => s + (parseFloat(b.fee_banco)||0) + (parseFloat(b.fee_thl)||0) + (parseFloat(b.limpieza)||0), 0);
        const propiedad = fe.reduce((s, e) => s + parseFloat(e.amount), 0);

        document.getElementById('dash-bruto').innerText = bruto.toFixed(2) + '€';
        document.getElementById('dash-gestion').innerText = gestion.toFixed(2) + '€';
        document.getElementById('dash-propiedad').innerText = propiedad.toFixed(2) + '€';
        document.getElementById('dash-neto').innerText = (bruto - gestion - propiedad).toFixed(2) + '€';
        
        this.updateChart(fb);
    }

    updateChart(bookings) {
        const ctx = document.getElementById('mainTimelineChart').getContext('2d');
        if(this.chart) this.chart.destroy();
        const data = new Array(12).fill(0);
        bookings.forEach(b => {
            const m = new Date(b.checkin).getMonth();
            data[m] += parseFloat(b.bruto);
        });
        this.chart = new Chart(ctx, { 
            type: 'line', 
            data: { labels: MONTHS_ES, datasets: [{ label: 'Bruto €', data: data, borderColor: '#0ea5e9', tension: 0.3, fill: true, backgroundColor: 'rgba(14, 165, 233, 0.1)' }] },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    renderBookings() {
        let fb = this.getFiltered(this.state.bookings, 'checkin', 'bookings');
        fb = this.sortData(fb, 'bookings');
        document.getElementById('list-bookings-body').innerHTML = fb.map(b => `
            <tr>
                <td>${b.booking_ref}</td>
                <td>${b.platform}</td>
                <td>${b.origin}</td>
                <td>${b.checkin}</td>
                <td>${b.nights}</td>
                <td>${parseFloat(b.bruto).toFixed(2)}€</td>
                <td class="text-success">${parseFloat(b.net).toFixed(2)}€</td>
                <td><button onclick="window.delB(${b.id})">❌</button></td>
            </tr>
        `).join('');
    }

    renderExpenses() {
        let fe = this.getFiltered(this.state.expenses, 'date', 'expenses');
        fe = this.sortData(fe, 'expenses');
        document.getElementById('list-expenses-body').innerHTML = fe.map(e => `
            <tr>
                <td>${e.date}</td>
                <td>${e.category}</td>
                <td>${e.observations}</td>
                <td class="text-danger">-${parseFloat(e.amount).toFixed(2)}€</td>
                <td><button onclick="window.delE(${e.id})">❌</button></td>
            </tr>
        `).join('');
    }

    renderAnalysis() {
        const fb = this.getFiltered(this.state.bookings, 'checkin', 'analysis');
        const fe = this.getFiltered(this.state.expenses, 'date', 'analysis');
        const metric = document.getElementById('analysis-metric-select').value;
        
        // Tabla 1: Resumen Mensual Estándar
        const months = {};
        fb.forEach(b => {
            const k = b.checkin.substring(0, 7);
            if(!months[k]) months[k] = { n:0, b:0, net:0, clean:0, thl:0, platform:0 };
            months[k].n += b.nights;
            months[k].b += parseFloat(b.bruto);
            months[k].net += b.net;
            months[k].clean += parseFloat(b.limpieza || 0);
            months[k].thl += parseFloat(b.fee_thl || 0);
            months[k].platform += parseFloat(b.fee_banco || 0);
        });

        document.getElementById('stats-table-body').innerHTML = Object.keys(months).sort().reverse().map(k => `
            <tr>
                <td>${k}</td>
                <td>${months[k].n}</td>
                <td>${months[k].b.toFixed(2)}€</td>
                <td>${months[k].net.toFixed(2)}€</td>
                <td>${months[k].clean.toFixed(2)}€</td>
                <td>${months[k].platform.toFixed(2)}€</td>
            </tr>
        `).join('');

        // Tabla 2: Análisis Cruzado Dinámico
        this.renderCrossAnalysis(fb, fe, metric);
    }

    renderCrossAnalysis(bookings, expenses, metric) {
        const container = document.getElementById('cross-analysis-body');
        let html = '';

        if(metric === 'origin') {
            const map = {};
            bookings.forEach(b => {
                if(!map[b.origin]) map[b.origin] = { count: 0, bruto: 0 };
                map[b.origin].count++;
                map[b.origin].bruto += parseFloat(b.bruto);
            });
            html = Object.keys(map).map(o => `<tr><td>${o}</td><td>${map[o].count} Reservas</td><td>${map[o].bruto.toFixed(2)}€</td></tr>`).join('');
        } else if(metric === 'platform') {
            const map = {};
            bookings.forEach(b => {
                if(!map[b.platform]) map[b.platform] = { count: 0, bruto: 0 };
                map[b.platform].count++;
                map[b.platform].bruto += parseFloat(b.bruto);
            });
            html = Object.keys(map).map(p => `<tr><td>${p}</td><td>${map[p].count} Reservas</td><td>${map[p].bruto.toFixed(2)}€</td></tr>`).join('');
        } else if(metric === 'expenses') {
            const map = {};
            expenses.forEach(e => {
                if(!map[e.category]) map[e.category] = 0;
                map[e.category] += parseFloat(e.amount);
            });
            html = Object.keys(map).map(c => `<tr><td>${c}</td><td>Gasto Propiedad</td><td>${map[c].toFixed(2)}€</td></tr>`).join('');
        }

        container.innerHTML = html;
    }

    renderBank() {
        const fb = this.getFiltered(this.state.bookings, 'checkin', 'analysis'); // Usa filtro de análisis o propio
        document.getElementById('bank-list').innerHTML = fb.map(b => {
            const r = this.state.bankRecords.find(x => x.bookingId == b.id) || { received: 0, date: '', obs: '' };
            return `<div class="bank-row-inline">
                <span>#${b.booking_ref} (${b.net.toFixed(2)}€)</span>
                <input type="number" value="${r.received}" onchange="window.upB(${b.id}, 'received', this.value)">
                <b class="${Math.abs(r.received - b.net) < 0.1 ? 'text-success' : 'text-danger'}">${(r.received - b.net).toFixed(2)}€</b>
            </div>`;
        }).join('');
    }

    // --- UTILIDADES ---
    sortData(data, type) {
        const { key, dir } = this.sortStates[type];
        return data.sort((a, b) => {
            let valA = a[key], valB = b[key];
            if(!isNaN(valA)) { valA = parseFloat(valA); valB = parseFloat(valB); }
            return valA > valB ? (1 * dir) : (-1 * dir);
        });
    }

    setSort(type, key) {
        if(this.sortStates[type].key === key) this.sortStates[type].dir *= -1;
        else { this.sortStates[type].key = key; this.sortStates[type].dir = 1; }
        this.renderAll();
    }
}

// --- 4. MODIFICACIÓN DEL HTML PARA FILTROS Y ANALÍTICA ---
// (Este bloque de código asume que el HTML tiene los IDs f-view-start/end correspondientes)

const app = new UI(new AppState());

// Exponer funciones de ordenamiento a las tablas
window.setSort = (type, key) => app.setSort(type, key);
window.delB = (id) => { if(confirm('¿Borrar?')) { app.state.bookings = app.state.bookings.filter(x => x.id != id); app.state.save(); app.renderAll(); }};
window.delE = (id) => { if(confirm('¿Borrar?')) { app.state.expenses = app.state.expenses.filter(x => x.id != id); app.state.save(); app.renderAll(); }};
window.upB = (id, field, val) => {
    const r = app.state.bankRecords.find(x => x.bookingId == id) || { received: 0, date: '', obs: '' };
    r[field] = val;
    app.state.bankRecords = app.state.bankRecords.filter(x => x.bookingId != id);
    app.state.bankRecords.push({bookingId: id, ...r});
    app.state.save();
    app.renderAll();
};