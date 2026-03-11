// --- CONFIGURACIÓN Y CONSTANTES ---
const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const COUNTRIES = ["España", "Chile", "Arabia Saudita", "Corea del Sur", "Brasil", "Francia", "Alemania", "Inglaterra", "EE.UU.", "Italia", "Portugal", "Argentina", "Congo", "Guatemala"];

// --- 1. GESTOR DE ESTADO (SOLID: Responsabilidad de Datos) ---
class AppState {
    constructor() {
        this.config = JSON.parse(localStorage.getItem('m_config')) || null;
        this.bookings = JSON.parse(localStorage.getItem('m_res')) || [];
        this.expenses = JSON.parse(localStorage.getItem('m_gas')) || [];
        this.bankRecords = JSON.parse(localStorage.getItem('m_bnk')) || [];
    }

    save() {
        localStorage.setItem('m_res', JSON.stringify(this.bookings));
        localStorage.setItem('m_gas', JSON.stringify(this.expenses));
        localStorage.setItem('m_bnk', JSON.stringify(this.bankRecords));
    }

    addBooking(data) {
        const inDate = new Date(data.checkin);
        const outDate = new Date(data.checkout);
        const nights = Math.max(1, (outDate - inDate) / 86400000);
        
        const gestionCost = (parseFloat(data.fee_canal) || 0) + 
                           (parseFloat(data.fee_banco) || 0) + 
                           (parseFloat(data.fee_thl) || 0) + 
                           (parseFloat(data.limpieza) || 0);
        
        const net = parseFloat(data.bruto) - gestionCost;
        this.bookings.push({ ...data, nights, net, id: Date.now() });
        this.save();
    }

    deleteBooking(id) {
        this.bookings = this.bookings.filter(b => b.id != id);
        this.save();
    }

    updateBank(id, data) {
        this.bankRecords = this.bankRecords.filter(r => r.bookingId != id);
        this.bankRecords.push({ bookingId: id, ...data });
        this.save();
    }
}

// --- 2. CONTROLADOR DE INTERFAZ (UI) ---
class UI {
    constructor(state) {
        this.state = state;
        this.currentYear = 2026;
        this.chart = null;
        this.init();
    }

    init() {
        this.setupSelects();
        this.bindEvents();
        this.checkConfig();
        this.renderAll();
    }

    setupSelects() {
        const originSel = document.getElementById('origin-select');
        if(originSel) originSel.innerHTML = COUNTRIES.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    bindEvents() {
        // Navegación de Tabs
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                const target = btn.dataset.target;
                document.getElementById(target).classList.add('active');
                btn.classList.add('active');
                
                // Acciones específicas al entrar a un tab
                if(target === 'view-dashboard') this.renderChart();
                if(target === 'view-market') this.simulateMarketAI();
            };
        });

        // Formularios
        document.getElementById('form-booking').onsubmit = (e) => {
            e.preventDefault();
            this.state.addBooking(Object.fromEntries(new FormData(e.target)));
            e.target.reset();
            this.renderAll();
        };

        document.getElementById('form-expense').onsubmit = (e) => {
            e.preventDefault();
            this.state.expenses.push({ ...Object.fromEntries(new FormData(e.target)), id: Date.now() });
            this.state.save();
            e.target.reset();
            this.renderAll();
        };

        document.getElementById('filter-year-main').onchange = (e) => {
            this.currentYear = parseInt(e.target.value);
            document.getElementById('current-filter-label').innerText = this.currentYear;
            document.getElementById('occ-year-label').innerText = this.currentYear;
            this.renderAll();
        };

        document.getElementById('clear-data').onclick = () => { if(confirm('¿Borrar todo?')) { localStorage.clear(); location.reload(); }};
    }

    checkConfig() {
        if(!this.state.config) {
            document.getElementById('setup-modal').classList.remove('hidden');
            document.getElementById('setup-form').onsubmit = (e) => {
                const d = Object.fromEntries(new FormData(e.target));
                localStorage.setItem('m_config', JSON.stringify(d));
            }
        } else {
            document.getElementById('display-address').innerText = this.state.config.direccion;
            document.getElementById('market-location-label').innerText = this.state.config.direccion;
        }
    }

    renderAll() {
        this.renderDashboard();
        this.renderHistory();
        this.renderAnalysis();
        this.renderBank();
    }

    renderDashboard() {
        const filtered = this.state.bookings.filter(b => b.checkin.startsWith(this.currentYear));
        const expenses = this.state.expenses.filter(e => e.date.startsWith(this.currentYear));

        const bruto = filtered.reduce((s, b) => s + parseFloat(b.bruto), 0);
        const gestion = filtered.reduce((s, b) => (s + (parseFloat(b.fee_canal)||0) + (parseFloat(b.fee_banco)||0) + (parseFloat(b.fee_thl)||0) + (parseFloat(b.limpieza)||0)), 0);
        const propiedad = expenses.reduce((s, e) => s + parseFloat(e.amount), 0);

        document.getElementById('dash-bruto').innerText = bruto.toFixed(0) + '€';
        document.getElementById('dash-gestion').innerText = gestion.toFixed(0) + '€';
        document.getElementById('dash-propiedad').innerText = propiedad.toFixed(0) + '€';
        document.getElementById('dash-neto').innerText = (bruto - gestion - propiedad).toFixed(0) + '€';

        // Ocupación
        const totalNights = filtered.reduce((s, b) => s + b.nights, 0);
        document.getElementById('occ-year').innerText = ((totalNights / 365) * 100).toFixed(1) + '%';
        this.renderChart();
    }

    renderChart() {
        const ctx = document.getElementById('mainTimelineChart').getContext('2d');
        if(this.chart) this.chart.destroy();

        // Mapeo de datos reales por mes
        const monthlyData = new Array(12).fill(0);
        this.state.bookings
            .filter(b => b.checkin.startsWith(this.currentYear))
            .forEach(b => {
                const month = new Date(b.checkin).getMonth();
                monthlyData[month] += parseFloat(b.bruto);
            });

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: MONTHS_ES,
                datasets: [{
                    label: 'Ingresos Brutos ' + this.currentYear,
                    data: monthlyData,
                    borderColor: '#0ea5e9',
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    renderHistory() {
        const body = document.getElementById('list-bookings-body');
        body.innerHTML = this.state.bookings.slice().reverse().map(b => `
            <tr>
                <td><b>#${b.booking_ref}</b><br><small>${b.platform}</small></td>
                <td>${b.origin}</td>
                <td>${b.checkin} al ${b.checkout}<br><small>(${b.nights} noches)</small></td>
                <td>${parseFloat(b.bruto).toFixed(0)}€</td>
                <td><b class="text-success">${parseFloat(b.net).toFixed(0)}€</b></td>
                <td><button class="text-danger" style="border:none;background:none;cursor:pointer" onclick="window.delBooking(${b.id})">Borrar</button></td>
            </tr>
        `).join('');
    }

    renderAnalysis() {
        const tbody = document.getElementById('stats-table-body');
        const months = {};
        this.state.bookings.forEach(b => {
            const d = new Date(b.checkin);
            const key = `${d.getFullYear()}-${MONTHS_ES[d.getMonth()]}`;
            if(!months[key]) months[key] = { nights: 0, bruto: 0, net: 0 };
            months[key].nights += b.nights;
            months[key].bruto += parseFloat(b.bruto);
            months[key].net += b.net;
        });

        tbody.innerHTML = Object.keys(months).reverse().map(k => {
            const m = months[k];
            return `<tr>
                <td>${k}</td><td>${m.nights.toFixed(0)}</td>
                <td>${((m.nights/30)*100).toFixed(0)}%</td>
                <td>${m.bruto.toFixed(0)}€</td><td>${m.net.toFixed(0)}€</td>
                <td>${(m.bruto/m.nights).toFixed(0)}€</td>
            </tr>`;
        }).join('');

        // Origen
        const origins = {};
        this.state.bookings.forEach(b => origins[b.origin] = (origins[b.origin] || 0) + 1);
        document.getElementById('origin-list').innerHTML = Object.keys(origins).map(o => `<li>${o}: ${origins[o]} reservas</li>`).join('');
    }

    renderBank() {
        const list = document.getElementById('bank-list');
        list.innerHTML = this.state.bookings.map(b => {
            const rec = this.state.bankRecords.find(r => r.bookingId == b.id) || { received: 0, date: '', obs: '' };
            return `
                <div class="bank-card">
                    <p><b>Reserva #${b.booking_ref}</b> (${b.platform}) - Expectativa: ${b.net.toFixed(2)}€</p>
                    <div class="bank-row" style="display:flex; gap:10px; margin-top:10px;">
                        <input type="number" placeholder="Ingreso €" value="${rec.received}" onchange="window.upBank(${b.id}, 'received', this.value)">
                        <input type="date" value="${rec.date}" onchange="window.upBank(${b.id}, 'date', this.value)">
                    </div>
                    <textarea style="margin-top:10px; height:40px;" placeholder="Obs. del banco..." onchange="window.upBank(${b.id}, 'obs', this.value)">${rec.obs}</textarea>
                </div>
            `;
        }).join('');
    }

    simulateMarketAI() {
        // Simulación de respuesta de IA/Scraping
        document.getElementById('price-tourist').innerText = "124€/noche";
        document.getElementById('price-seasonal').innerText = "2.100€/mes";
        document.getElementById('price-permanent').innerText = "1.450€/mes";
        
        document.getElementById('ai-market-insights').innerHTML = `
            <div class="card" style="margin-top:10px; border-left:4px solid gold">
                <small>🤖 IA Insight:</small>
                <p>En el CP ${this.state.config.cp}, los pisos con 2 pax están subiendo un 5% este mes. Tu precio actual (ADR) está un 10% por debajo del mercado turístico.</p>
            </div>
        `;
    }
}

// INSTANCIA GLOBAL
const state = new AppState();
const ui = new UI(state);

// Exponer funciones al DOM (onclick)
window.delBooking = (id) => { if(confirm('¿Borrar?')) { state.deleteBooking(id); ui.renderAll(); }};
window.upBank = (id, field, val) => { 
    const current = state.bankRecords.find(r => r.bookingId == id) || { received: 0, date: '', obs: '' };
    current[field] = val;
    state.updateBank(id, current);
    ui.renderAll();
};