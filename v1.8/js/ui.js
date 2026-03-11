import { filterBookings, filterExpenses } from './filters.js';
import { renderBookingRows, renderExpenseRows, renderBankRows, renderMarketData } from './renderers.js';
import { initChart } from './charts.js';

export class UI {
    constructor(state) {
        this.state = state;
        this.chart = null;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        // Navegación fluida
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.onclick = () => {
                const targetId = b.dataset.target;
                document.querySelectorAll('.app-view, .nav-btn').forEach(el => el.classList.remove('active'));
                document.getElementById(targetId).classList.add('active');
                b.classList.add('active');
                
                // Renders específicos por pestaña
                if (targetId === 'view-market') this.renderMarket();
                if (targetId === 'view-analysis') this.renderAnalysis();
            };
        });

        // Evento de Identificación (Setup)
        const setupForm = document.getElementById('setup-form');
        if (setupForm) {
            setupForm.onsubmit = (e) => {
                e.preventDefault();
                const formData = new FormData(setupForm);
                const direccion = formData.get('direccion');
                const cp = formData.get('cp');
                
                this.state.loadActiveData(btoa(direccion)); // Crear ID única
                this.state.config = { direccion, cp };
                this.state.save();
                
                document.getElementById('setup-modal').classList.add('hidden');
                this.renderAll(); 
            };
        }

        // Otros eventos (Modales)
        document.getElementById('display-address').onclick = () => {
            document.getElementById('setup-modal').classList.remove('hidden');
        };
    }

    renderAll() {
        if (!this.state.config) return;

        // Actualizar nombre en la cabecera
        const addrDisplay = document.getElementById('display-address');
        if (addrDisplay) addrDisplay.innerText = this.state.config.direccion;

        this.renderDashboard();
        this.renderBookings();
        this.renderExpenses();
        this.renderBank();
    }

    renderDashboard() {
        const b = filterBookings(this.state.bookings, this.state.filters.dashboard);
        const e = filterExpenses(this.state.expenses, this.state.filters.dashboard);

        const bruto = b.reduce((acc, x) => acc + (parseFloat(x.bruto) || 0), 0);
        const gestion = b.reduce((acc, x) => acc + (parseFloat(x.fee_banco)||0) + (parseFloat(x.fee_thl)||0) + (parseFloat(x.limpieza)||0), 0);
        const prop = e.reduce((acc, x) => acc + (parseFloat(x.amount) || 0), 0);

        if(document.getElementById('dash-bruto')) document.getElementById('dash-bruto').innerText = bruto.toFixed(2) + '€';
        if(document.getElementById('dash-gestion')) document.getElementById('dash-gestion').innerText = gestion.toFixed(2) + '€';
        if(document.getElementById('dash-propiedad')) document.getElementById('dash-propiedad').innerText = prop.toFixed(2) + '€';
        if(document.getElementById('dash-neto')) document.getElementById('dash-neto').innerText = (bruto - gestion - prop).toFixed(2) + '€';

        // Gráfico (solo si hay canvas)
        if (document.getElementById('mainTimelineChart')) {
            const chartData = { bruto: Array(12).fill(0), net: Array(12).fill(0), clean: Array(12).fill(0), fee: Array(12).fill(0) };
            b.forEach(x => {
                const m = new Date(x.checkin).getMonth();
                if(!isNaN(m)) {
                    chartData.bruto[m] += parseFloat(x.bruto) || 0;
                    chartData.net[m] += parseFloat(x.net) || 0;
                }
            });
            if (this.chart) this.chart.destroy();
            this.chart = initChart('mainTimelineChart', chartData);
        }
    }

    renderBookings() {
        const container = document.getElementById('list-bookings-body');
        if(container) renderBookingRows(container, this.state.bookings, (id) => {}, (id) => {
            this.state.bookings = this.state.bookings.filter(x => x.id != id);
            this.state.save(); this.renderAll();
        });
    }

    renderExpenses() {
        const container = document.getElementById('list-expenses-body');
        if(container) renderExpenseRows(container, this.state.expenses, (id) => {}, (id) => {
            this.state.expenses = this.state.expenses.filter(x => x.id != id);
            this.state.save(); this.renderAll();
        });
    }
}