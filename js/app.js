import { loginWithGoogle, logout } from "./authService.js";
import { auth, onAuthStateChanged } from "./firebaseApp.js";

// --- 1. CONFIGURACIÓN --- 
const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]; 
const COUNTRIES = ["España", "Francia", "Alemania", "Reino Unido", "Italia", "USA", "México", "Argentina", "Brasil", "Portugal", "Otros"].sort(); 

// --- API CONFIG ---
const API_URL = 'api.php'; // Cambiar a la URL absoluta si está alojado en otro lugar (ej: https://tudominio.com/api.php)

const ALLOWED_EMAILS = [
    "vegendigital@gmail.com",
    "drcmarianela@gmail.com",
    "emilianodirosa@gmail.com"
];

// --- 2. ESTADO --- 
class AppState { 
    constructor() { 
        this.currentUser = null;
        this.currentActiveId = localStorage.getItem('last_active_id') || null; 
        this.properties = [];
        this.config = null; 
        this.bookings = []; 
        this.expenses = []; 
        this.bankRecords = []; 
        this.filters = { 
            dashboard: { start: '2025-01-01', end: '2025-12-31' }, 
            bookings: { start: '2025-01-01', end: '2025-12-31', platform: '', origin: '' }, 
            expenses: { start: '2025-01-01', end: '2025-12-31', type: '' }, 
            analysis: { start: '2025-01-01', end: '2025-12-31', platform: '', origin: '' }, 
            bank: { start: '2025-01-01', end: '2025-12-31', year: '', platform: '' } 
        }; 
    } 

    async loginWithGoogle() {
        const user = await loginWithGoogle();
        if (user) {
            if (ALLOWED_EMAILS.includes(user.email)) {
                this.currentUser = user.email;
            } else {
                alert("Acceso denegado: Este correo no está autorizado.");
                await this.logout();
            }
        }
    }
    
    async logout() {
        await logout();
        this.currentUser = null;
        this.currentActiveId = null;
        this.config = null;
        localStorage.removeItem('last_active_id');
    }

    async loadUserProperties() {
        if (!this.currentUser) return;
        try {
            const token = await auth.currentUser.getIdToken();
            const res = await fetch(`${API_URL}?action=get_properties`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            this.properties = await res.json();

            if (this.currentActiveId && this.properties.find(p => p.id == this.currentActiveId)) {
                await this.loadActiveData(this.currentActiveId);
            } else if (this.properties.length > 0) {
                await this.loadActiveData(this.properties[0].id);
            } else {
                this.config = null;
            }
        } catch (e) { console.error("Error loading properties:", e); }
    }

    async addProperty(data) {
        try {
            const token = await auth.currentUser.getIdToken();
            const res = await fetch(`${API_URL}?action=add_property`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(data)
            });
            const result = await res.json();
            if (result.id) {
                await this.loadUserProperties();
                await this.loadActiveData(result.id);
            }
        } catch (e) { console.error("Error adding property:", e); }
    }
 
    async loadActiveData(id) {
        this.currentActiveId = id; 
        localStorage.setItem('last_active_id', id); 
        this.config = this.properties.find(p => p.id == id) || null;

        try {
            const token = await auth.currentUser.getIdToken();
            const res = await fetch(`${API_URL}?action=get_data&property_id=${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            this.bookings = data.bookings || [];
            this.expenses = data.expenses || [];
            this.bankRecords = data.bank_records || [];
        } catch (e) { console.error("Error loading property data:", e); }
    } 
 
    async addBooking(data) {
        const net = parseFloat(data.bruto) - (parseFloat(data.fee_banco)||0) - (parseFloat(data.fee_thl)||0) - (parseFloat(data.limpieza)||0); 
        const nights = Math.max(1, (new Date(data.checkout) - new Date(data.checkin)) / 86400000); 
        const payload = { ...data, net, nights, property_id: this.currentActiveId, id: data.booking_id };

        try {
            const token = await auth.currentUser.getIdToken();
            await fetch(`${API_URL}?action=save_booking`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            await this.loadActiveData(this.currentActiveId);
        } catch (e) { console.error(e); }
    } 
 
    async addExpense(data) {
        const payload = { ...data, property_id: this.currentActiveId, id: data.expense_id };
        try {
            const token = await auth.currentUser.getIdToken();
            await fetch(`${API_URL}?action=save_expense`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });
            await this.loadActiveData(this.currentActiveId);
        } catch (e) { console.error(e); }
    } 

    async deleteRecord(type, id) {
        try {
            const token = await auth.currentUser.getIdToken();
            await fetch(`${API_URL}?action=delete_${type}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id, property_id: this.currentActiveId })
            });
            await this.loadActiveData(this.currentActiveId);
        } catch (e) { console.error(e); }
    }

    async updateBank(booking_id, val, obs) {
        try {
            const token = await auth.currentUser.getIdToken();
            await fetch(`${API_URL}?action=save_bank`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ property_id: this.currentActiveId, booking_id, val, obs })
            });
            await this.loadActiveData(this.currentActiveId);
        } catch (e) { console.error(e); }
    }
} 
 
// --- 3. UI --- 
class UI { 
    constructor(state) { 
        this.state = state; 
        this.chart = null; 
        this.sorts = { bookings: { k: 'checkin', d: -1 }, expenses: { k: 'date', d: -1 }, analysis: { k: 'month', d: -1 } }; 
        this.init(); 
    } 
 
    init() { 
        this.bindEvents(); 
        this.setupSelects(); 
        this.renderAll(); 
    } 
 
    setupSelects() { 
        const h = COUNTRIES.map(c => `<option value="${c}">${c}</option>`).join(''); 
        ['origin-select', 'f-bookings-origin', 'f-analysis-origin'].forEach(id => { 
            const el = document.getElementById(id); 
            if(el) el.innerHTML += h; 
        }); 
    } 
 
    bindEvents() { 
        document.querySelectorAll('.nav-btn').forEach(b => b.onclick = () => { 
            document.querySelectorAll('.app-view, .nav-btn').forEach(el => el.classList.remove('active')); 
            document.getElementById(b.dataset.target).classList.add('active'); 
            b.classList.add('active'); 
            if(b.dataset.target === 'view-market') this.renderMarket(); 
        }); 
 
        // Botones rápidos Dashboard
        document.getElementById('btn-30days').onclick = () => {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 30);
            this.state.filters.dashboard.start = start.toISOString().split('T')[0];
            this.state.filters.dashboard.end = end.toISOString().split('T')[0];
            document.getElementById('f-dashboard-start').value = this.state.filters.dashboard.start;
            document.getElementById('f-dashboard-end').value = this.state.filters.dashboard.end;
            this.renderDashboard();
        };

        document.getElementById('btn-lastmonth').onclick = () => {
            const date = new Date();
            const start = new Date(date.getFullYear(), date.getMonth() - 1, 1);
            const end = new Date(date.getFullYear(), date.getMonth(), 0);
            this.state.filters.dashboard.start = start.toISOString().split('T')[0];
            this.state.filters.dashboard.end = end.toISOString().split('T')[0];
            document.getElementById('f-dashboard-start').value = this.state.filters.dashboard.start;
            document.getElementById('f-dashboard-end').value = this.state.filters.dashboard.end;
            this.renderDashboard();
        };

        document.getElementById('btn-thisyear').onclick = () => {
            const year = new Date().getFullYear();
            this.state.filters.dashboard.start = year + '-01-01';
            this.state.filters.dashboard.end = year + '-12-31';
            document.getElementById('f-dashboard-start').value = this.state.filters.dashboard.start;
            document.getElementById('f-dashboard-end').value = this.state.filters.dashboard.end;
            this.renderDashboard();
        };

        document.getElementById('chart-type').onchange = () => {
            this.renderDashboard();
        };

        // Eventos de filtros 
        ['dashboard','bookings','expenses','analysis','bank'].forEach(v => { 
            document.getElementById(`f-${v}-start`).onchange = (e) => { this.state.filters[v].start = e.target.value; this.renderAll(); }; 
            document.getElementById(`f-${v}-end`).onchange = (e) => { this.state.filters[v].end = e.target.value; this.renderAll(); }; 
        }); 
 
        document.getElementById('f-bookings-platform').onchange = (e) => { this.state.filters.bookings.platform = e.target.value; this.renderAll(); }; 
        document.getElementById('f-bookings-origin').onchange = (e) => { this.state.filters.bookings.origin = e.target.value; this.renderAll(); }; 
        document.getElementById('f-expenses-type').onchange = (e) => { this.state.filters.expenses.type = e.target.value; this.renderAll(); }; 
        document.getElementById('f-bank-year').onchange = (e) => { this.state.filters.bank.year = e.target.value; this.renderAll(); };
        document.getElementById('f-bank-platform').onchange = (e) => { this.state.filters.bank.platform = e.target.value; this.renderAll(); }; 
 
        document.getElementById('form-booking').onsubmit = async (e) => { e.preventDefault(); await this.state.addBooking(Object.fromEntries(new FormData(e.target))); e.target.reset(); this.renderAll(); };
        document.getElementById('form-expense').onsubmit = async (e) => { e.preventDefault(); await this.state.addExpense(Object.fromEntries(new FormData(e.target))); e.target.reset(); this.renderAll(); };
 
        const btnGoogleLogin = document.getElementById('btn-google-login');
        if (btnGoogleLogin) {
            btnGoogleLogin.onclick = () => {
                this.state.loginWithGoogle();
            };
        }

        onAuthStateChanged(auth, async user => {
            if (user && ALLOWED_EMAILS.includes(user.email)) {
                this.state.currentUser = user.email;
                await this.state.loadUserProperties();
                this.renderAll();
            } else {
                if (user) await this.state.logout(); // Fuerza salida si el correo no es válido pero quedó en caché
                this.state.currentUser = null;
                this.renderAll();
            }
        });

        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.onclick = async () => {
                await this.state.logout();
                location.reload();
            };
        }

        document.getElementById('btn-add-property').onclick = () => {
            const sm = document.getElementById('setup-modal');
            sm.classList.remove('hidden');
            sm.style.display = 'flex';
            document.getElementById('close-setup').classList.remove('hidden');
        };

        document.getElementById('close-setup').onclick = () => {
            const sm = document.getElementById('setup-modal');
            sm.classList.add('hidden');
            sm.style.display = 'none';
        };

        document.getElementById('property-selector').onchange = async (e) => {
            if(e.target.value) {
                await this.state.loadActiveData(e.target.value);
                this.renderAll();
            }
        };

        let customFeatures = [];
        document.getElementById('btn-add-feature').onclick = () => {
            const input = document.getElementById('custom-feature-name');
            const val = input.value.trim();
            if(val && !customFeatures.includes(val)) {
                customFeatures.push(val);
                input.value = '';

                const container = document.getElementById('custom-features-container');
                const badge = document.createElement('div');
                badge.style.cssText = "display: inline-flex; align-items: center; background: #e2e8f0; padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; margin: 0 5px 5px 0;";
                badge.innerHTML = `<span>${val}</span> <button type="button" style="background:none; border:none; margin-left:5px; color:#f43f5e; cursor:pointer;" onclick="this.parentElement.remove(); customFeatures = customFeatures.filter(f => f !== '${val}');"><i class="fa fa-times"></i></button>`;
                container.appendChild(badge);
            }
        };

        document.getElementById('setup-form').onsubmit = async (e) => {
            e.preventDefault(); 
            const formData = new FormData(e.target);
            const d = Object.fromEntries(formData);

            // Checkboxes might not be in formData if not checked, let's normalize
            d.piscina = formData.get('piscina') ? 1 : 0;
            d.cochera = formData.get('cochera') ? 1 : 0;
            d.balcon = formData.get('balcon') ? 1 : 0;
            d.ascensor = formData.get('ascensor') ? 1 : 0;

            // Add custom features as JSON string
            d.custom_features = JSON.stringify(customFeatures);

            await this.state.addProperty(d);

            // Reset modal state
            document.getElementById('custom-features-container').innerHTML = '';
            customFeatures = [];
            e.target.reset();

            const sm = document.getElementById('setup-modal');
            sm.classList.add('hidden');
            sm.style.display = 'none';
            this.renderAll(); 
        }; 
 
        document.getElementById('analysis-pivot-x').onchange = () => this.renderAnalysis(); 
        document.getElementById('analysis-pivot-y').onchange = () => this.renderAnalysis(); 
        
        document.getElementById('matrix-var-select').onchange = () => this.renderAnalysis();

        const analysisNav = (targetId, btnId) => {
            ['matrix', 'period', 'cross'].forEach(v => {
                const el = document.getElementById('analysis-v-' + v);
                if(el) { el.classList.add('hidden'); el.style.display = 'none'; }
                
                const btn = document.getElementById('btn-show-' + v);
                if(btn) {
                    btn.classList.remove('btn-primary');
                    btn.classList.add('btn-secondary');
                    btn.style.background = '';
                }
            });
            
            const targetEl = document.getElementById('analysis-v-' + targetId);
            if(targetEl) { targetEl.classList.remove('hidden'); targetEl.style.display = 'block'; }
            
            const targetBtn = document.getElementById(btnId);
            if(targetBtn) {
                targetBtn.classList.add('btn-primary');
                targetBtn.classList.remove('btn-secondary');
                targetBtn.style.background = 'var(--accent)';
            }
        };

        document.getElementById('btn-show-matrix').onclick = (e) => analysisNav('matrix', 'btn-show-matrix');
        document.getElementById('btn-show-period').onclick = (e) => analysisNav('period', 'btn-show-period');
        document.getElementById('btn-show-cross').onclick = (e) => analysisNav('cross', 'btn-show-cross');
        
        // Initialize first view explicitly
        analysisNav('matrix', 'btn-show-matrix');
        

        // Import Import logic
        document.getElementById('btn-open-import').onclick = () => document.getElementById('import-modal').classList.remove('hidden');
        document.getElementById('close-import').onclick = () => document.getElementById('import-modal').classList.add('hidden');

        document.getElementById('import-form').onsubmit = async (e) => {
            e.preventDefault();
            const clear = document.getElementById('clear-existing').checked;
            
            const fileB = document.getElementById('file-bookings').files[0];
            const fileE = document.getElementById('file-expenses').files[0];
            
            const importPayload = {
                property_id: this.state.currentActiveId,
                clear_existing: clear,
                bookings: [],
                expenses: []
            };

            const promises = [];
            if(fileB) promises.push(this.processCSV(fileB, 'bookings', importPayload.bookings));
            if(fileE) promises.push(this.processCSV(fileE, 'expenses', importPayload.expenses));

            await Promise.all(promises);

            try {
                const token = await auth.currentUser.getIdToken();
                const res = await fetch(`${API_URL}?action=import_data`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(importPayload)
                });

                const result = await res.json();
                if(result.status === 'success') {
                    await this.state.loadActiveData(this.state.currentActiveId);

                    // Auto-adjust filters to imported data range
                    const allDates = [
                        ...this.state.bookings.map(b => b.checkin),
                        ...this.state.expenses.map(exp => exp.date)
                    ].filter(d => d).sort();

                    if (allDates.length > 0) {
                        const start = allDates[0];
                        const end = allDates[allDates.length - 1];

                        ['dashboard', 'bookings', 'expenses', 'analysis', 'bank'].forEach(v => {
                            this.state.filters[v].start = start;
                            this.state.filters[v].end = end;
                            const s = document.getElementById(`f-${v}-start`);
                            const e = document.getElementById(`f-${v}-end`);
                            if(s) s.value = start;
                            if(e) e.value = end;
                        });
                    }

                    alert('Importación completada con éxito.');
                } else {
                    alert('Error en la importación: ' + result.error);
                }
            } catch (err) {
                console.error(err);
                alert('Error de conexión al importar.');
            }

            document.getElementById('import-modal').classList.add('hidden');
            e.target.reset();
            this.renderAll();
        };
    } 

    processCSV(file, type, targetArray) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const rows = text.split(/\r?\n/);
                if (rows.length < 2) return resolve();

                // Detect delimiter (count ; vs , in first row)
                const firstRow = rows[0];
                const delimiter = (firstRow.match(/;/g) || []).length > (firstRow.match(/,/g) || []).length ? ';' : ',';

                const headers = rows[0].split(delimiter).map(h => h.trim().toUpperCase().replace(/"/g, ''));
                
                // Helpers
                const getVal = (cols, idx) => idx > -1 && cols[idx] ? cols[idx].trim().replace(/^"|"$/g, '') : '';
                const parseEur = (s) => {
                    if (!s) return 0;
                    // Remove currency symbol if present
                    s = s.replace('€', '').trim();
                    // If format is 1.234,56 (Spanish)
                    if (s.includes(',') && s.includes('.')) {
                        return parseFloat(s.replace(/\./g, '').replace(',', '.'));
                    }
                    // If format is 1234,56 (Spanish no thousands)
                    if (s.includes(',') && !s.includes('.')) {
                        return parseFloat(s.replace(',', '.'));
                    }
                    return parseFloat(s);
                };
                const parseDate = (s) => {
                    if(!s) return '';
                    // Try detect format
                    const parts = s.split(/[\/\-]/);
                    if(parts.length < 3) return s; // Fallback
                    let d=parts[0], m=parts[1], y=parts[2];
                    // Assumption: DD/MM/YYYY or DD/MM/YY
                    if (y.length === 2) y = '20' + y;
                    // Simple swap if user provides MM/DD/YYYY? Unlikely for Spanish CSV but possible.
                    // Given context (Madrid Rental), DD/MM/YYYY is standard.
                    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
                };

                // Column Mapping
                let map = {};
                if (type === 'bookings') {
                    // Look for specific headers
                    map = {
                        ref: -1, platform: -1, origin: -1, checkin: -1, checkout: -1,
                        bruto: -1, fee_chan: -1, fee_thl: -1, clean: -1
                    };
                    
                    // Specific logic for duplicate "RESERVA"
                    // Usually ID is the one with alphanumeric, DATE is the date.
                    // But for mapping, let's find indices.
                    const reservaIndices = [];
                    headers.forEach((h, i) => { if(h === 'RESERVA') reservaIndices.push(i); });
                    
                    // Heuristic: If 2 "RESERVA", 1st is likely date, 2nd is ID (based on image)
                    // But image shows RESERVA (date) at col 0, RESERVA (id) at col 3.
                    if (reservaIndices.length > 1) {
                         map.ref = reservaIndices[1]; 
                    } else {
                         map.ref = headers.indexOf('RESERVA');
                    }

                    map.platform = headers.indexOf('CANAL');
                    map.origin = headers.indexOf('ORIGEN');
                    map.checkin = headers.findIndex(h => h.includes('CHECK') && h.includes('IN'));
                    map.checkout = headers.findIndex(h => h.includes('CHECK') && h.includes('OUT'));
                    map.bruto = headers.indexOf('TOTAL');
                    map.fee_chan = headers.findIndex(h => h.includes('FEE') && h.includes('CANAL'));
                    map.fee_thl = headers.findIndex(h => h.includes('FEE') && h.includes('THL'));
                    map.clean = headers.indexOf('LIMPIEZA');
                } else {
                    map = {
                        date: headers.indexOf('FECHA'),
                        prov: headers.indexOf('PROVEEDOR'),
                        amount: headers.indexOf('MONTO'),
                        obs: headers.findIndex(h => h.includes('OBSERVA'))
                    };
                }

                // Process rows
                const dataRows = rows.slice(1).filter(r => r.trim());
                dataRows.forEach(rowStr => {
                    // Handle split with potential quotes (basic regex for CSV)
                    // Or simple split if quotes aren't nested
                    let cols;
                    if (rowStr.includes('"')) {
                        // Regex to match ; outside quotes
                        // But JS split limit is tricky. Simple split for now as provided data looks clean.
                         cols = rowStr.split(delimiter); 
                    } else {
                        cols = rowStr.split(delimiter);
                    }

                    if (type === 'bookings') {
                        const bruto = parseEur(getVal(cols, map.bruto));
                        const fee_banco = parseEur(getVal(cols, map.fee_chan));
                        const fee_thl = parseEur(getVal(cols, map.fee_thl));
                        const limpieza = parseEur(getVal(cols, map.clean));
                        const checkin = parseDate(getVal(cols, map.checkin));
                        const checkout = parseDate(getVal(cols, map.checkout));

                        const net = bruto - (fee_banco||0) - (fee_thl||0) - (limpieza||0);
                        const cInDate = new Date(checkin);
                        const cOutDate = new Date(checkout);
                        const nights = isNaN(cInDate) || isNaN(cOutDate) ? 1 : Math.max(1, (cOutDate - cInDate) / 86400000);

                        const booking = {
                            booking_ref: getVal(cols, map.ref) || 'CSV-'+Date.now(),
                            platform: getVal(cols, map.platform) || 'Directo',
                            origin: getVal(cols, map.origin) || 'Otros',
                            checkin: checkin,
                            checkout: checkout,
                            bruto: bruto,
                            fee_banco: fee_banco,
                            fee_thl: fee_thl,
                            limpieza: limpieza,
                            net: net,
                            nights: nights
                        };
                        if(booking.checkin && booking.bruto) targetArray.push(booking);
                    } else {
                        const prov = getVal(cols, map.prov);
                        const obs = getVal(cols, map.obs);
                        const fullObs = (prov + ' ' + obs).trim();
                        
                        // Infer category
                        let cat = 'Mantenimiento';
                        const text = fullObs.toLowerCase();
                        if(text.includes('luz') || text.includes('endesa') || text.includes('iberdrola') || text.includes('electricidad') || text.includes('energia')) cat = 'Luz';
                        else if(text.includes('gas') || text.includes('naturgy') || text.includes('repsol')) cat = 'Gas';
                        else if(text.includes('internet') || text.includes('wifi') || text.includes('digi') || text.includes('movistar') || text.includes('vodafone') || text.includes('orange')) cat = 'Internet';
                        else if(text.includes('comunidad') || text.includes('administracion')) cat = 'Comunidad';
                        else if(text.includes('ibi') || text.includes('suma') || text.includes('ayuntamiento') || text.includes('hacienda') || text.includes('impuesto')) cat = 'Impuestos';
                        else if(text.includes('agua') || text.includes('canal')) cat = 'Agua';
                        else if(text.includes('seguro') || text.includes('mapfre') || text.includes('mutua')) cat = 'Seguro';
                        
                        const expense = {
                            date: parseDate(getVal(cols, map.date)),
                            category: cat,
                            amount: parseEur(getVal(cols, map.amount)),
                            observations: fullObs
                        };
                        if(expense.date && expense.amount) targetArray.push(expense);
                    }
                });
                resolve();
            };
            // Try to read as UTF-8 first, but Spanish Excel is often ISO-8859-1.
            // Let's assume generic text first.
            reader.readAsText(file); 
        });
    }

    renderAll() { 
        const loginModal = document.getElementById('login-modal');
        const setupModal = document.getElementById('setup-modal');

        if(!this.state.currentUser) {
            loginModal.classList.remove('hidden');
            loginModal.style.display = '';
            setupModal.classList.add('hidden');
            setupModal.style.display = 'none';
            return;
        } else {
            loginModal.classList.add('hidden');
            loginModal.style.display = 'none';
        }

        const sel = document.getElementById('property-selector');
        sel.innerHTML = '<option value="">Seleccionar Propiedad...</option>' + 
            this.state.properties.map(p => `<option value="${p.id}" ${p.id == this.state.currentActiveId ? 'selected' : ''}>${p.calle}</option>`).join('');

        if(!this.state.config || !this.state.currentActiveId) { 
            if (this.state.properties.length > 0) {
                this.state.loadActiveData(this.state.properties[0].id).then(() => {
                    sel.value = this.state.properties[0].id;
                    this.renderDashboard();
                    this.renderBookings();
                    this.renderExpenses();
                    this.renderAnalysis();
                    this.renderBank();
                });
            } else {
                setupModal.classList.remove('hidden'); 
                setupModal.style.display = 'flex';
                document.getElementById('close-setup').classList.add('hidden');
            }
            return;
        } 
        
        setupModal.classList.add('hidden');
        setupModal.style.display = 'none';
        const dispAddr = document.getElementById('display-address');
        if(dispAddr) dispAddr.innerText = this.state.config.calle + ', ' + this.state.config.ciudad; 
        this.renderDashboard(); 
        this.renderBookings(); 
        this.renderExpenses(); 
        this.renderAnalysis(); 
        this.renderBank(); 
    } 
 
    renderDashboard() { 
        const b = this.getFiltered('bookings', 'checkin', 'dashboard'); 
        const e = this.getFiltered('expenses', 'date', 'dashboard'); 
        const bruto = b.reduce((acc, x) => acc + parseFloat(x.bruto), 0); 
        const gestion = b.reduce((acc, x) => acc + parseFloat(x.fee_banco||0) + parseFloat(x.fee_thl||0) + parseFloat(x.limpieza||0), 0); 
        const prop = e.reduce((acc, x) => acc + parseFloat(x.amount), 0); 
 
        document.getElementById('dash-bruto').innerText = bruto.toFixed(2) + '€'; 
        document.getElementById('dash-gestion').innerText = gestion.toFixed(2) + '€'; 
        document.getElementById('dash-propiedad').innerText = prop.toFixed(2) + '€'; 
        document.getElementById('dash-neto').innerText = (bruto - gestion - prop).toFixed(2) + '€'; 
        this.updateChart(b, e); 
    } 
 
    updateChart(bookings) { 
        const ctx = document.getElementById('mainTimelineChart').getContext('2d'); 
        if(this.chart) this.chart.destroy(); 
         
        const dataSet = { bruto: new Array(12).fill(0), net: new Array(12).fill(0), clean: new Array(12).fill(0), fee: new Array(12).fill(0) }; 
        bookings.forEach(x => { 
            const m = new Date(x.checkin).getMonth(); 
            dataSet.bruto[m] += parseFloat(x.bruto); 
            dataSet.net[m] += parseFloat(x.net); 
            dataSet.clean[m] += parseFloat(x.limpieza); 
            dataSet.fee[m] += parseFloat(x.fee_banco) + parseFloat(x.fee_thl); 
        }); 
 
        this.chart = new Chart(ctx, { 
            type: 'bar', 
            data: { 
                labels: MONTHS_ES, 
                datasets: [ 
                    { label: 'Bruto', data: dataSet.bruto, backgroundColor: '#0ea5e9' }, 
                    { label: 'Neto', data: dataSet.net, backgroundColor: '#10b981' }, 
                    { label: 'Limpieza', data: dataSet.clean, backgroundColor: '#f59e0b' }, 
                    { label: 'Comisiones', data: dataSet.fee, backgroundColor: '#f43f5e' } 
                ] 
            }, 
            options: { responsive: true, maintainAspectRatio: false } 
        }); 
    } 
 
    renderBookings() { 
        let b = this.getFiltered('bookings', 'checkin', 'bookings'); 
        const f = this.state.filters.bookings; 
        if(f.platform) b = b.filter(x => x.platform === f.platform); 
        if(f.origin) b = b.filter(x => x.origin === f.origin); 
         
        b = this.sortData(b, 'bookings'); 
        document.getElementById('list-bookings-body').innerHTML = b.map(x => ` 
            <tr> 
                <td>${x.checkin}</td><td>${x.platform}</td><td>${x.origin}</td><td>${parseFloat(x.bruto).toFixed(2)}€</td> 
                <td class="text-success">${parseFloat(x.net).toFixed(2)}€</td> 
                <td> 
                    <button class="icon-btn" onclick="window.editB(${x.id})"><i class="fa fa-pencil text-accent"></i></button> 
                    <button class="icon-btn" onclick="window.delB(${x.id})"><i class="fa fa-trash text-danger"></i></button> 
                </td> 
            </tr> 
        `).join(''); 
    } 
 
    renderExpenses() { 
        let e = this.getFiltered('expenses', 'date', 'expenses'); 
        if(this.state.filters.expenses.type) e = e.filter(x => x.category === this.state.filters.expenses.type); 
        e = this.sortData(e, 'expenses'); 
        document.getElementById('list-expenses-body').innerHTML = e.map(x => ` 
            <tr> 
                <td>${x.date}</td><td>${x.category}</td><td>${parseFloat(x.amount).toFixed(2)}€</td> 
                <td> 
                    <button class="icon-btn" onclick="window.editE(${x.id})"><i class="fa fa-pencil text-accent"></i></button> 
                    <button class="icon-btn" onclick="window.delE(${x.id})"><i class="fa fa-trash text-danger"></i></button> 
                </td> 
            </tr> 
        `).join(''); 
    } 
 
    renderAnalysis() { 
        const b = this.getFiltered('bookings', 'checkin', 'analysis'); 
        const e = this.getFiltered('expenses', 'date', 'analysis');

        // Platform & origin filter applies to both matrix & period logic
        let filteredB = b;
        const fPlatform = document.getElementById('f-analysis-platform') ? document.getElementById('f-analysis-platform').value : '';
        const fOrigin = document.getElementById('f-analysis-origin') ? document.getElementById('f-analysis-origin').value : '';
        if (fPlatform) filteredB = filteredB.filter(x => x.platform === fPlatform);
        if (fOrigin) filteredB = filteredB.filter(x => x.origin === fOrigin);

        const months = {}; 
        filteredB.forEach(x => { 
            const m = x.checkin.substring(0,7); 
            if(!months[m]) months[m] = { month: m, res_count: 0, nights: 0, bruto: 0, net: 0, comisiones: 0, expenses: 0 }; 
            months[m].res_count += 1;
            months[m].nights += parseFloat(x.nights); 
            months[m].bruto += parseFloat(x.bruto); 
            months[m].net += parseFloat(x.net);
            months[m].comisiones += (parseFloat(x.fee_banco||0) + parseFloat(x.fee_thl||0));
        }); 
        
        e.forEach(x => {
            const m = x.date.substring(0,7);
            if(!months[m]) months[m] = { month: m, res_count: 0, nights: 0, bruto: 0, net: 0, comisiones: 0, expenses: 0 };
            months[m].expenses += parseFloat(x.amount);
        });

        const data = this.sortData(Object.values(months), 'analysis'); 
        
        // Render Periodo
        document.getElementById('stats-table-body').innerHTML = data.map(x => ` 
            <tr><td>${x.month}</td><td>${x.nights}</td><td>${x.bruto.toFixed(2)}€</td><td class="text-success">${x.net.toFixed(2)}€</td></tr> 
        `).join(''); 
 
        // Render Matrix
        const selObj = document.getElementById('matrix-var-select');
        let selectedVars = [];
        if(selObj && selObj.options) {
            for(let i=0; i<selObj.options.length; i++) {
                if(selObj.options[i].selected) selectedVars.push(selObj.options[i].value);
            }
        }
        
        const varLabels = {
            res_count: "Nº Reservas",
            nights: "Noches Ocupación",
            bruto: "Ingreso Bruto (€)",
            net: "Ingreso Neto (€)",
            expenses: "Gastos Totales (€)",
            comisiones: "Comisiones (€)"
        };

        const headHtml = '<tr><th>Variables</th>' + data.map(x => `<th>${x.month}</th>`).join('') + '</tr>';
        document.getElementById('matrix-head').innerHTML = headHtml;

        let bodyHtml = '';
        selectedVars.forEach(v => {
            bodyHtml += `<tr><td><b>${varLabels[v]}</b></td>`;
            data.forEach(x => {
                let val = x[v];
                let displayVal = (v === 'res_count' || v === 'nights') ? val : val.toFixed(2);
                bodyHtml += `<td>${displayVal}</td>`;
            });
            bodyHtml += '</tr>';
        });
        document.getElementById('matrix-body').innerHTML = bodyHtml;

        // Explorador Cruzado 
        const px = document.getElementById('analysis-pivot-x').value; 
        const py = document.getElementById('analysis-pivot-y').value; 
        const cross = {}; 
        b.forEach(x => { 
            const key = px === 'month' ? x.checkin.substring(0,7) : x[px]; 
            if(!cross[key]) cross[key] = 0; 
            cross[key] += py === 'count' ? 1 : parseFloat(x[py]); 
        }); 
        document.getElementById('cross-analysis-body').innerHTML = Object.keys(cross).map(k => {
            const displayVal = py === 'count' ? cross[k] : cross[k].toFixed(2) + '€';
            return `<tr><td><b>${k}</b></td><td>${displayVal}</td></tr>`;
        }).join(''); 
    } 
 
    renderBank() { 
        let b = this.getFiltered('bookings', 'checkin', 'bank'); 
        
        const fYear = this.state.filters.bank.year;
        if(fYear) b = b.filter(x => x.checkin.startsWith(fYear));

        const fPlatform = this.state.filters.bank.platform;
        if(fPlatform) b = b.filter(x => x.platform === fPlatform);

        document.getElementById('bank-list-body').innerHTML = b.map(x => { 
            const rec = this.state.bankRecords.find(r => r.booking_id == x.id) || { val: 0, obs: '' };
            const diff = rec.val - x.net; 
            
            let colorClass = 'text-warning'; // Default or something else if needed
            if (Math.abs(diff) < 0.01) colorClass = 'text-success'; // green for 0
            else if (diff < 0) colorClass = 'text-danger'; // red for negative
            else colorClass = 'text-accent'; // blue for positive (using accent color)

            return `<tr> 
                <td>#${x.booking_ref}</td><td>${x.net.toFixed(2)}€</td> 
                <td><input type="number" value="${rec.val}" onchange="window.upBank(${x.id}, 'val', this.value)" style="width:80px"></td> 
                <td class="${colorClass}" style="font-weight: bold;">${diff.toFixed(2)}€</td> 
                <td><input type="text" value="${rec.obs}" onchange="window.upBank(${x.id}, 'obs', this.value)"></td> 
            </tr>`; 
        }).join(''); 
    } 
 
    renderMarket() { 
        const c = document.getElementById('market-cards-container'); 
        const m = [
            {t:"Precio Medio/Noche", v:"142€", icon:"euro-sign"}, 
            {t:"Ocupación Media", v:"78%", icon:"chart-pie"}, 
            {t:"Demanda", v:"Alta", icon:"fire"}, 
            {t:"RevPAR", v:"110€", icon:"chart-line"},
            {t:"Oferta Activa", v:"154 Pisos", icon:"building"},
            {t:"Rendimiento Anual", v:"6.5%", icon:"percent"}
        ]; 
        c.innerHTML = m.map(x => `<div class="card"><h3><i class="fa fa-${x.icon}"></i> ${x.t}</h3><p>${x.v}</p></div>`).join(''); 
        document.getElementById('market-status-box').innerHTML = `
            <strong>Datos Simulados (Modo Desarrollo)</strong><br>
            <small>Basados en Código Postal ${this.state.config ? this.state.config.cp : ''}. Esta sección está preparada para integrar una API externa de mercado o Inteligencia Artificial (ej. Google Gemini) que reemplace estos valores mock con análisis real y web scraping de la zona.</small>
        `;

        // Leaflet Map Logic (Mocked Data)
        if (!this.mapInitialized) {
            setTimeout(() => {
                const map = L.map('map').setView([40.4168, -3.7038], 14);
                
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(map);

                const blueIcon = new L.Icon({
                    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
                    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
                });
                L.marker([40.4168, -3.7038], {icon: blueIcon}).addTo(map).bindPopup("<b>Tu Propiedad</b><br>"+(this.state.config?this.state.config.calle:'')).openPopup();

                const colors = { 'Turístico': 'red', 'Temporal': 'orange', 'Permanente': 'green' };
                
                for(let i=0; i<15; i++) {
                    const lat = 40.4168 + (Math.random() - 0.5) * 0.02;
                    const lng = -3.7038 + (Math.random() - 0.5) * 0.02;
                    const types = ['Turístico', 'Temporal', 'Permanente'];
                    const type = types[Math.floor(Math.random() * types.length)];
                    
                    const icon = new L.Icon({
                        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${colors[type]}.png`,
                        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
                    });

                    L.marker([lat, lng], {icon: icon}).addTo(map).bindPopup(`<b>Alquiler ${type}</b><br>Precio est.: ${Math.floor(Math.random() * 100 + 80)}€`);
                }
                this.mapInitialized = true;
            }, 100);
        }
    } 
 
    getFiltered(type, field, view) { 
        const f = this.state.filters[view]; 
        return this.state[type].filter(x => x[field] >= f.start && x[field] <= f.end); 
    } 
 
    sortData(arr, type) { 
        const s = this.sorts[type]; 
        return arr.sort((a,b) => a[s.k] > b[s.k] ? (1 * s.d) : (-1 * s.d)); 
    } 
} 
 
const app = new UI(new AppState()); 
window.app = app; // Exponer al window para que los eventos onclick del HTML puedan llamarlo
 
// Globales para botones - Modificados para trabajar como modulo
window.setSort = (t, k) => { app.sorts[t].d *= -1; app.sorts[t].k = k; app.renderAll(); }; 
window.delB = async (id) => { await app.state.deleteRecord('booking', id); app.renderAll(); };
window.editB = (id) => { const x = app.state.bookings.find(b => b.id === id); const f = document.getElementById('form-booking'); Object.keys(x).forEach(k => { if(f[k]) f[k].value = x[k]; }); window.scrollTo(0,0); }; 
window.delE = async (id) => { await app.state.deleteRecord('expense', id); app.renderAll(); };
window.editE = (id) => { const x = app.state.expenses.find(e => e.id === id); const f = document.getElementById('form-expense'); Object.keys(x).forEach(k => { if(f[k]) f[k].value = x[k]; }); window.scrollTo(0,0); }; 
window.upBank = async (id, k, v) => {
    let r = app.state.bankRecords.find(x => x.booking_id === id);
    let val = r ? r.val : 0;
    let obs = r ? r.obs : '';
    if(k === 'val') val = parseFloat(v);
    if(k === 'obs') obs = v;
    await app.state.updateBank(id, val, obs);
    app.renderAll();
};