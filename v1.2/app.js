// 1. GESTOR DE DATOS Y PERSISTENCIA
class Storage {
    static save(key, data) { localStorage.setItem(key, JSON.stringify(data)); }
    static get(key) { return JSON.parse(localStorage.getItem(key)) || []; }
}

// 2. CALCULADORA FINANCIERA (Single Responsibility)
class Financer {
    static getNights(inDate, outDate) {
        const start = new Date(inDate);
        const end = new Date(outDate);
        return Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
    }

    static calculateRentalNet(booking) {
        return booking.bruto - (booking.fee_canal || 0) - (booking.fee_thl || 0) - (booking.limpieza || 0);
    }
}

// 3. NÚCLEO DE LA APP (ESTADO)
class AppState {
    constructor() {
        this.config = JSON.parse(localStorage.getItem('piso_config'));
        this.bookings = Storage.get('reservas_pro');
        this.expenses = Storage.get('gastos_pro');
        this.bankRecords = Storage.get('banco_pro');
    }

    saveBooking(data) {
        const nights = Financer.getNights(data.checkin, data.checkout);
        const net = Financer.calculateRentalNet(data);
        const booking = { ...data, nights, net, id: Date.now() };
        this.bookings.push(booking);
        Storage.save('reservas_pro', this.bookings);
    }

    saveExpense(data) {
        this.expenses.push({ ...data, id: Date.now() });
        Storage.save('gastos_pro', this.expenses);
    }
    
    updateBankRecord(id, amount, obs) {
        const record = { bookingId: id, received: amount, observations: obs };
        this.bankRecords = this.bankRecords.filter(r => r.bookingId !== id);
        this.bankRecords.push(record);
        Storage.save('banco_pro', this.bankRecords);
    }
}

// 4. CONTROLADOR DE VISTA (UI)
class UI {
    constructor(state) {
        this.state = state;
        this.chart = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.renderAll();
        this.checkSetup();
    }

    bindEvents() {
        // Navegación
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.getElementById(btn.dataset.target).classList.add('active');
                btn.classList.add('active');
                if(btn.dataset.target === 'view-dashboard') this.renderChart();
            };
        });

        // Formularios
        document.getElementById('form-booking').onsubmit = (e) => {
            e.preventDefault();
            const d = new FormData(e.target);
            this.state.saveBooking(Object.fromEntries(d));
            e.target.reset();
            this.renderAll();
        };

        document.getElementById('form-expense').onsubmit = (e) => {
            e.preventDefault();
            const d = new FormData(e.target);
            this.state.saveExpense(Object.fromEntries(d));
            e.target.reset();
            this.renderAll();
        };

        document.getElementById('clear-data').onclick = () => { localStorage.clear(); location.reload(); };
    }

    checkSetup() {
        if (!this.state.config) {
            const modal = document.getElementById('setup-modal');
            modal.classList.remove('hidden');
            document.getElementById('setup-form').onsubmit = (e) => {
                e.preventDefault();
                const d = new FormData(e.target);
                localStorage.setItem('piso_config', JSON.stringify(Object.fromEntries(d)));
                location.reload();
            };
        } else {
            document.getElementById('display-address').innerText = this.state.config.direccion;
        }
    }

    renderAll() {
        this.renderBookingList();
        this.renderExpenses();
        this.renderStatsTable();
        this.renderBank();
        this.renderDashboardMetrics();
        this.renderChart();
    }

    renderBookingList() {
        const list = document.getElementById('list-bookings');
        list.innerHTML = this.state.bookings.slice(-5).reverse().map(b => `
            <li>
                <span><b>${b.platform}</b> - ${b.checkin} (${b.nights}n)</span>
                <span>Neto: <b>${parseFloat(b.net).toFixed(2)}€</b></span>
            </li>
        `).join('');
    }

    renderExpenses() {
        const list = document.getElementById('list-expenses');
        list.innerHTML = this.state.expenses.slice(-5).reverse().map(e => `
            <li><span>${e.date} - ${e.category}</span> <span>-${e.amount}€</span></li>
        `).join('');
    }

    renderStatsTable() {
        const tbody = document.getElementById('stats-table-body');
        // Lógica de agrupación por mes
        const months = {};
        this.state.bookings.forEach(b => {
            const m = b.checkin.substring(0, 7); // YYYY-MM
            if(!months[m]) months[m] = { res: 0, nights: 0, bruto: 0, neto: 0 };
            months[m].res++;
            months[m].nights += parseFloat(b.nights);
            months[m].bruto += parseFloat(b.bruto);
            months[m].neto += parseFloat(b.net);
        });

        tbody.innerHTML = Object.keys(months).sort().reverse().map(m => {
            const d = months[m];
            const occ = ((d.nights / 30) * 100).toFixed(1);
            const adr = (d.bruto / d.nights).toFixed(1);
            return `<tr>
                <td>${m}</td><td>${d.res}</td><td>${d.nights}</td>
                <td>${occ}%</td><td>${d.bruto}€</td><td>${adr}€</td><td>${d.neto.toFixed(2)}€</td>
            </tr>`;
        }).join('');
    }

    renderBank() {
        const container = document.getElementById('bank-list');
        container.innerHTML = this.state.bookings.map(b => {
            const record = this.state.bankRecords.find(r => r.bookingId == b.id) || { received: 0, observations: '' };
            const expected = b.net; // Lo que debería entrar tras gastos directos
            return `
                <div class="bank-card">
                    <p>#${b.booking_ref} | ${b.platform} | Expectativa: ${parseFloat(expected).toFixed(2)}€</p>
                    <input type="number" placeholder="Recibido" value="${record.received}" 
                        onchange="window.appUpdateBank(${b.id}, this.value, '')">
                    <small>Diferencia: ${(record.received - expected).toFixed(2)}€</small>
                </div>
            `;
        }).join('');
    }

    renderDashboardMetrics() {
        const totalBruto = this.state.bookings.reduce((s, b) => s + parseFloat(b.bruto), 0);
        const totalGestion = this.state.bookings.reduce((s, b) => s + (parseFloat(b.fee_canal)||0) + (parseFloat(b.fee_thl)||0) + (parseFloat(b.limpieza)||0), 0);
        const fijos = this.state.expenses.reduce((s, e) => s + parseFloat(e.amount), 0);
        
        document.getElementById('dash-bruto').innerText = totalBruto.toFixed(0) + '€';
        document.getElementById('dash-gestion').innerText = totalGestion.toFixed(0) + '€';
        document.getElementById('dash-neto').innerText = (totalBruto - totalGestion - fijos).toFixed(0) + '€';
    }

    renderChart() {
        const ctx = document.getElementById('mainTimelineChart').getContext('2d');
        if(this.chart) this.chart.destroy();
        
        // Simulación de datos por meses para el gráfico
        const labels = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'];
        const dataBruto = [1200, 1900, 1500, 2100, 2400, 1800]; // Aquí mapearías this.state.bookings

        this.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Ingreso Bruto',
                    data: dataBruto,
                    borderColor: '#06b6d4',
                    tension: 0.3
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// Inicialización global para funciones inline
const state = new AppState();
const ui = new UI(state);
window.appUpdateBank = (id, val, obs) => state.updateBankRecord(id, val, obs);