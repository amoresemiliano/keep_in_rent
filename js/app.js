import { loginWithGoogle, logout } from "./authService.js";
import { auth, onAuthStateChanged } from "./firebaseApp.js";

const MONTHS_ES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

class AppState {
    constructor() {
        this.currentUser = null;
        this.token = null;
        this.properties = [];
        this.currentActiveId = null;

        this.config = {};
        this.bookings = [];
        this.expenses = [];
        this.bankRecords = [];

        this.globalExpenseCategories = ["Luz", "Agua", "Internet", "Comunidad", "Seguro", "Mantenimiento", "Limpieza Extra", "Otros"];
        this.globalPlatforms = ["Booking", "Airbnb", "Directo", "Vrbo", "Expedia"];

        this.filters = {
            dashboard: { start: '', end: '' },
            bookings: { start: '', end: '', platform: '', origin: '' },
            expenses: { start: '', end: '', type: '' },
            analysis: { start: '', end: '' },
            bank: { start: '', end: '', year: '', platform: '' }
        };
    }

    async apiCall(endpoint, method = 'GET', data = null) {
        if (!this.token) throw new Error("No token available");

        const headers = {
            'Authorization': 'Bearer ' + this.token
        };

        const options = { method, headers };
        if (data) {
            options.body = data instanceof FormData ? data : JSON.stringify(data);
            if (!(data instanceof FormData)) {
                headers['Content-Type'] = 'application/json';
            }
        }

        const res = await fetch(`api.php?action=${endpoint}`, options);
        if (!res.ok) {
            const err = await res.json().catch(() => ({error: res.statusText}));
            throw new Error(err.error || `HTTP error ${res.status}`);
        }
        return await res.json();
    }

    async loadUserProperties() {
        if (!this.currentUser) return;
        const API_URL = 'api.php';
        try {
            const token = await auth.currentUser.getIdToken();

            const settingsRes = await fetch(`${API_URL}?action=get_settings`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const settingsData = await settingsRes.json();
            if (settingsData.error) {
                console.error("API Error (Settings):", settingsData.error);
                this.globalSettings = {};
            } else {
                this.globalSettings = settingsData;
                if (this.globalSettings.expense_categories) this.globalExpenseCategories = this.globalSettings.expense_categories;
                if (this.globalSettings.booking_platforms) this.globalPlatforms = this.globalSettings.booking_platforms;
            }

            const res = await fetch(`${API_URL}?action=get_properties`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const propsData = await res.json();

            if (propsData.error) {
                console.error("API Error (Properties):", propsData.error);
                alert("Error cargando propiedades desde la Base de Datos:\n" + propsData.error + "\n\nPor favor, verifica la conexión.");
                this.properties = [];
            } else {
                this.properties = Array.isArray(propsData) ? propsData.map(p => {
                    return { ...p, name: p.calle ? `${p.calle}, ${p.ciudad}` : `Propiedad #${p.id}` };
                }) : [];
            }

            if (this.currentActiveId && this.properties.find(p => p.id == this.currentActiveId)) {
                await this.loadActiveData(this.currentActiveId);
            } else if (this.properties.length > 0) {
                await this.loadActiveData(this.properties[0].id);
            } else {
                this.config = null;
                if (window.appUI) window.appUI.renderAll();
            }
        } catch (e) { console.error("Error loading properties:", e); }
    }

    async loadGlobalSettings() {
        // Redundant with loadUserProperties, but we'll keep it simple
        try {
            const data = await this.apiCall('get_settings');
            if (data.expense_categories) this.globalExpenseCategories = data.expense_categories;
            if (data.booking_platforms) this.globalPlatforms = data.booking_platforms;
        } catch(e) {
            console.error("No se pudieron cargar variables globales", e);
        }
    }

    async loadActiveData(property_id) {
        if (!this.currentUser) return;
        this.currentActiveId = property_id;
        try {
            const data = await this.apiCall(`get_data&property_id=${property_id}`);
            if (data.error) {
                 console.error(data.error);
                 return;
            }
            this.bookings = data.bookings || [];
            this.expenses = data.expenses || [];
            this.bankRecords = data.bank_records || [];
            this.config = data.config || {};

            if (window.appUI) window.appUI.renderAll();
        } catch (e) { console.error(e); }
    }

    async loadPropertyData() {
        if(!this.currentActiveId) return;
        await this.loadActiveData(this.currentActiveId);
    }

    async saveConfig(conf) {
        this.config = { ...this.config, ...conf };
        if(this.currentActiveId) {
            await this.apiCall(`updateConfig&property_id=${this.currentActiveId}`, 'POST', this.config);
            await this.loadUserProperties(); // Refresh name in dropdown
        } else {
            const res = await this.apiCall('add_property', 'POST', this.config);
            this.currentActiveId = res.property_id;
            await this.loadUserProperties();
        }
    }

    async saveRecord(type, data) {
        if(!this.currentActiveId) return;
        data.property_id = this.currentActiveId;
        const endpoint = type === 'booking' ? 'save_booking' : 'save_expense';
        const targetArray = type === 'booking' ? this.bookings : this.expenses;

        const res = await this.apiCall(endpoint, 'POST', data);

        if (data.id) {
            const idx = targetArray.findIndex(x => x.id == data.id);
            if(idx > -1) targetArray[idx] = res.data;
        } else {
            targetArray.push(res.data);
        }
    }

    async deleteRecord(type, id) {
        if(!this.currentActiveId) return;
        const endpoint = type === 'booking' ? 'delete_booking' : 'delete_expense';
        await this.apiCall(endpoint, 'POST', { id, property_id: this.currentActiveId });

        if (type === 'booking') {
            this.bookings = this.bookings.filter(x => x.id != id);
        } else {
            this.expenses = this.expenses.filter(x => x.id != id);
        }
    }

    async updateBank(bookingId, val, obs) {
        if(!this.currentActiveId) return;
        const payload = { property_id: this.currentActiveId, booking_id: bookingId, val: val, obs: obs };
        await this.apiCall('updateBank', 'POST', payload);

        let rec = this.bankRecords.find(x => x.booking_id == bookingId);
        if(rec) { rec.val = val; rec.obs = obs; }
        else { this.bankRecords.push({ booking_id: bookingId, val, obs }); }
    }

    // Super Admin methods
    async adminGetUsers() { return await this.apiCall('admin_get_users'); }
    async adminGetAllProperties() { return await this.apiCall('get_properties'); }
    async adminGetLinks() { return await this.apiCall('admin_get_links'); }
    async adminDeleteLink(linkId) { return await this.apiCall('admin_delete_link', 'POST', { link_id: linkId }); }
    async adminLinkProperty(propId, email) { return await this.apiCall('admin_link_property', 'POST', { property_id: propId, user_email: email }); }
    async adminUpdateGlobal(key, val) { return await this.apiCall('admin_update_settings', 'POST', { key, val }); }
    async adminDeleteProperty(propId) { return await this.apiCall('admin_delete_property', 'POST', { property_id: propId }); }
    async adminDeleteUser(userId) { return await this.apiCall('admin_delete_user', 'POST', { user_id: userId }); }
}

let customFeatures = [];

class UI {
    constructor(state) {
        this.state = state;
        this.chart = null;
        this.marketMap = null;
        this.sorts = { bookings: { k: 'checkin', d: -1 }, expenses: { k: 'date', d: -1 }, analysis: { k: 'month', d: -1 } };
        this.initAuth();
    }

    initAuth() {
        const btnLogin = document.getElementById('btn-login-google');
        btnLogin.onclick = async () => {
            try {
                btnLogin.disabled = true;
                btnLogin.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Cargando Google...';

                const user = await loginWithGoogle();

                if (!user) {
                    btnLogin.disabled = false;
                    btnLogin.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" style="width: 20px;"> Continuar con Google';
                }
            } catch (error) {
                console.error(error);
                const errEl = document.getElementById('login-error');
                errEl.innerText = "Error: " + error.message;
                errEl.style.display = 'block';

                btnLogin.disabled = false;
                btnLogin.innerHTML = '<img src="https://upload.wikimedia.org/wikipedia/commons/c/c1/Google_%22G%22_logo.svg" alt="Google" style="width: 20px;"> Continuar con Google';
            }
        };

        document.getElementById('btn-logout').onclick = async () => {
            await logout();
            location.reload();
        };

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                document.getElementById('login-modal').classList.add('hidden');
                document.getElementById('login-modal').style.display = 'none';
                this.state.currentUser = user.email;
                this.state.token = await user.getIdToken();

                await this.state.loadGlobalSettings();
                await this.state.loadUserProperties();

                if (this.state.currentUser === 'vegendigital@gmail.com') {
                    document.getElementById('nav-btn-admin').classList.remove('hidden');
                }

                if (this.state.properties.length > 0) {
                    await this.state.loadPropertyData();
                    this.init();
                } else {
                    this.initEvents();
                    const setupModal = document.getElementById('setup-modal');
                    setupModal.classList.remove('hidden');
                    setupModal.style.display = 'flex';
                    document.getElementById('close-setup').classList.add('hidden');
                }
            } else {
                document.getElementById('login-modal').classList.remove('hidden');
                document.getElementById('login-modal').style.display = 'flex';
            }
        });
    }

    async handlePropertyChange(newId) {
        this.state.currentActiveId = newId;
        await this.state.loadPropertyData();

        document.getElementById('f-dashboard-start').value = '';
        document.getElementById('f-dashboard-end').value = '';
        document.getElementById('f-bookings-start').value = '';
        document.getElementById('f-bookings-end').value = '';
        document.getElementById('f-expenses-start').value = '';
        document.getElementById('f-expenses-end').value = '';
        document.getElementById('f-analysis-start').value = '';
        document.getElementById('f-analysis-end').value = '';

        this.renderAll();
    }

    init() {
        this.initEvents();
        this.renderAll();
    }

    initEvents() {
        const today = new Date().toISOString().split('T')[0];
        document.querySelectorAll('.set-today').forEach(el => el.value = today);

        const pSel = document.getElementById('property-selector');
        pSel.innerHTML = this.state.properties.map(p => `<option value="${p.id}" ${p.id == this.state.currentActiveId ? 'selected':''}>${p.name}</option>`).join('');
        pSel.onchange = (e) => this.handlePropertyChange(e.target.value);

        document.getElementById('btn-add-property').onclick = () => {
            const sm = document.getElementById('setup-modal');
            document.getElementById('form-setup').reset();
            document.getElementById('custom-features-container').innerHTML = '';
            customFeatures = [];
            sm.classList.remove('hidden');
            sm.style.display = 'flex';
            document.getElementById('close-setup').classList.remove('hidden');
        };

        const setDates = (daysAgo) => {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - daysAgo);
            document.getElementById('f-dashboard-start').value = start.toISOString().split('T')[0];
            document.getElementById('f-dashboard-end').value = end.toISOString().split('T')[0];
            this.renderDashboard();
        };

        document.getElementById('btn-30days').onclick = () => setDates(30);
        document.getElementById('btn-lastmonth').onclick = () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const end = new Date(now.getFullYear(), now.getMonth(), 0);
            document.getElementById('f-dashboard-start').value = start.toISOString().split('T')[0];
            document.getElementById('f-dashboard-end').value = end.toISOString().split('T')[0];
            this.renderDashboard();
        };
        document.getElementById('btn-thisyear').onclick = () => {
            const now = new Date();
            const start = new Date(now.getFullYear(), 0, 1);
            const end = new Date(now.getFullYear(), 11, 31);
            document.getElementById('f-dashboard-start').value = start.toISOString().split('T')[0];
            document.getElementById('f-dashboard-end').value = end.toISOString().split('T')[0];
            this.renderDashboard();
        };

        document.getElementById('chart-type').onchange = () => this.renderDashboard();

        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.onclick = (e) => {
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                document.querySelectorAll('.app-view').forEach(v => {
                    v.classList.remove('active');
                    if(v.id === 'view-analysis') v.classList.remove('active');
                });
                const targetId = e.target.getAttribute('data-target');
                const targetView = document.getElementById(targetId);
                targetView.classList.add('active');

                if (targetId === 'view-admin') {
                    this.renderAdminPanel();
                } else if (targetId === 'view-market') {
                    this.renderMarketData();
                }
            };
        });

        document.getElementById('edit-address-trigger').onclick = () => {
            const sm = document.getElementById('setup-modal');
            const c = this.state.config;
            document.getElementById('conf-name').value = c.name || '';
            document.getElementById('conf-calle').value = c.calle || '';
            document.getElementById('conf-ciudad').value = c.ciudad || '';
            document.getElementById('conf-cp').value = c.cp || '';
            document.getElementById('conf-pais').value = c.pais || 'España';

            document.getElementById('conf-rooms').value = c.rooms || '';
            document.getElementById('conf-baths').value = c.baths || '';
            document.getElementById('conf-pax').value = c.pax || '';
            document.getElementById('conf-m2').value = c.m2 || '';
            document.getElementById('conf-floor').value = c.floor || '';
            document.getElementById('conf-elevator').value = c.elevator || 'si';
            if (document.getElementById('conf-currency')) document.getElementById('conf-currency').value = c.currency || 'EUR';

            customFeatures = c.customFeatures || [];
            this.renderCustomFeatures();

            sm.classList.remove('hidden');
            sm.style.display = 'flex';
            document.getElementById('close-setup').classList.remove('hidden');
        };
        document.getElementById('close-setup').onclick = () => {
            const sm = document.getElementById('setup-modal');
            sm.classList.add('hidden');
            sm.style.display = 'none';
        };

        document.getElementById('btn-add-feature').onclick = () => {
            customFeatures.push({ name: '', value: '' });
            this.renderCustomFeatures();
        };

        ['dashboard', 'bookings', 'expenses', 'analysis', 'bank'].forEach(view => {
            const s = document.getElementById(`f-${view}-start`);
            const e = document.getElementById(`f-${view}-end`);
            if(s) s.onchange = (ev) => { this.state.filters[view].start = ev.target.value; this.renderView(view); };
            if(e) e.onchange = (ev) => { this.state.filters[view].end = ev.target.value; this.renderView(view); };
        });

        document.getElementById('f-bookings-platform').onchange = (e) => { this.state.filters.bookings.platform = e.target.value; this.renderBookings(); };
        document.getElementById('f-bookings-origin').onchange = (e) => { this.state.filters.bookings.origin = e.target.value; this.renderBookings(); };
        document.getElementById('f-expenses-type').onchange = (e) => { this.state.filters.expenses.type = e.target.value; this.renderExpenses(); };

        document.getElementById('f-analysis-platform').onchange = () => this.renderAnalysis();
        document.getElementById('f-analysis-origin').onchange = () => this.renderAnalysis();

        document.getElementById('f-bank-year').onchange = (e) => { this.state.filters.bank.year = e.target.value; this.renderBank(); };
        document.getElementById('f-bank-platform').onchange = (e) => { this.state.filters.bank.platform = e.target.value; this.renderBank(); };

        document.getElementById('form-booking').onsubmit = async (e) => {
            e.preventDefault();
            const fd = new FormData(e.target);
            const obj = Object.fromEntries(fd.entries());
            const isNew = !obj.booking_id;

            if(obj.checkin.includes('/')) {
                const p = obj.checkin.split('/');
                obj.checkin = `${p[2]}-${p[1]}-${p[0]}`;
            }
            if(obj.checkout.includes('/')) {
                const p = obj.checkout.split('/');
                obj.checkout = `${p[2]}-${p[1]}-${p[0]}`;
            }

            obj.nights = Math.round((new Date(obj.checkout) - new Date(obj.checkin)) / 86400000);
            if (!isNew) obj.id = obj.booking_id;

            await this.state.saveRecord('booking', obj);
            e.target.reset();
            this.renderAll();
            alert(isNew ? "Reserva guardada con éxito." : "Reserva actualizada con éxito.");
        };

        const calcBookingFees = () => {
            const b = parseFloat(document.getElementById('bk-bruto').value) || 0;
            const l = parseFloat(document.getElementById('bk-limpieza').value) || 0;
            const commP = parseFloat(document.getElementById('bk-comm-pct').value) || 0;
            const taxP = parseFloat(document.getElementById('bk-tax-pct').value) || 0;
            const adminP = parseFloat(document.getElementById('bk-fee-admin-pct').value) || 0;

            const commV = (b * commP) / 100;
            const taxV = (b * taxP) / 100;
            const adminV = (b * adminP) / 100;

            document.getElementById('bk-fee-canal').value = commV.toFixed(2);
            document.getElementById('bk-tax-val').value = taxV.toFixed(2);
            document.getElementById('bk-fee-admin').value = adminV.toFixed(2);

            const net = b - commV - taxV - adminV - l;
            document.getElementById('bk-net').value = net.toFixed(2);
        };

        const bkFields = ['bk-bruto', 'bk-limpieza', 'bk-comm-pct', 'bk-tax-pct', 'bk-fee-admin-pct'];
        bkFields.forEach(f => {
            const el = document.getElementById(f);
            if(el) el.addEventListener('input', calcBookingFees);
        });

        document.getElementById('form-expense').onsubmit = async (e) => {
            e.preventDefault();
            const obj = Object.fromEntries(new FormData(e.target).entries());
            const isNew = !obj.expense_id;

            if(obj.date.includes('/')) {
                const p = obj.date.split('/');
                obj.date = `${p[2]}-${p[1]}-${p[0]}`;
            }

            if (!isNew) obj.id = obj.expense_id;

            await this.state.saveRecord('expense', obj);
            e.target.reset();
            this.renderAll();
            alert(isNew ? "Gasto guardado con éxito." : "Gasto actualizado con éxito.");
        };

        document.getElementById('form-setup').onsubmit = async (e) => {
            e.preventDefault();
            const featInputs = document.querySelectorAll('.custom-feature-row');
            customFeatures = Array.from(featInputs).map(row => ({
                name: row.querySelector('.feat-name').value,
                value: row.querySelector('.feat-value').value
            })).filter(f => f.name.trim() !== '');

            const isNew = !this.state.currentActiveId;

            await this.state.saveConfig({
                name: document.getElementById('conf-name').value,
                calle: document.getElementById('conf-calle').value,
                ciudad: document.getElementById('conf-ciudad').value,
                cp: document.getElementById('conf-cp').value,
                pais: document.getElementById('conf-pais').value,
                rooms: document.getElementById('conf-rooms').value,
                baths: document.getElementById('conf-baths').value,
                pax: document.getElementById('conf-pax').value,
                m2: document.getElementById('conf-m2').value,
                floor: document.getElementById('conf-floor').value,
                elevator: document.getElementById('conf-elevator').value,
                currency: document.getElementById('conf-currency') ? document.getElementById('conf-currency').value : 'EUR',
                customFeatures: customFeatures
            });

            if (isNew) {
                const pSel = document.getElementById('property-selector');
                pSel.innerHTML = this.state.properties.map(p => `<option value="${p.id}" ${p.id == this.state.currentActiveId ? 'selected':''}>${p.name}</option>`).join('');
            }

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
        document.getElementById('matrix-year-select').onchange = () => this.renderAnalysis();

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

        analysisNav('matrix', 'btn-show-matrix');


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

            const parseCSV = (file, isBooking) => {
                return new Promise((resolve) => {
                    if(!file) return resolve([]);
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        let text = ev.target.result;
                        // Clean BOM if present
                        if(text.charCodeAt(0) === 0xFEFF) {
                            text = text.slice(1);
                        }

                        // normalize line endings
                        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                        const lines = text.split('\n').filter(l => l.trim() !== '');
                        if(lines.length < 2) return resolve([]);

                        // Parse header, remove quotes, lower case
                        const headers = lines[0].split(',').map(h => h.replace(/['"]+/g, '').trim().toLowerCase());

                        const data = [];
                        for(let i=1; i<lines.length; i++) {
                            const values = lines[i].split(',').map(v => v.replace(/['"]+/g, '').trim());
                            const obj = {};
                            headers.forEach((h, idx) => {
                                let val = values[idx];
                                if(val === undefined) return;

                                if(isBooking) {
                                    if(h.includes('checkin') || h.includes('entrada') || h.includes('llegada')) obj.checkin = val;
                                    else if(h.includes('checkout') || h.includes('salida')) obj.checkout = val;
                                    else if(h.includes('bruto') || h.includes('gross') || h.includes('precio')) obj.bruto = parseFloat(val);
                                    else if(h.includes('neto') || h.includes('net')) obj.net = parseFloat(val);
                                    else if(h.includes('canal') || h.includes('platform')) obj.platform = val;
                                    else if(h.includes('origen') || h.includes('origin')) obj.origin = val;
                                    else if(h.includes('ref')) obj.booking_ref = val;
                                } else {
                                    if(h.includes('fecha') || h.includes('date')) obj.date = val;
                                    else if(h.includes('cat') || h.includes('tipo')) obj.category = val;
                                    else if(h.includes('monto') || h.includes('amount') || h.includes('valor')) obj.amount = parseFloat(val);
                                    else if(h.includes('obs')) obj.observations = val;
                                }
                            });

                            const formatDate = (d) => {
                                if(!d) return d;
                                if(d.includes('/')) {
                                    const p = d.split('/');
                                    return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
                                }
                                return d;
                            };

                            if(isBooking) {
                                obj.checkin = formatDate(obj.checkin);
                                obj.checkout = formatDate(obj.checkout);
                                if(obj.checkin && obj.checkout) {
                                    obj.nights = Math.round((new Date(obj.checkout) - new Date(obj.checkin)) / 86400000);
                                    if(!obj.bruto) obj.bruto = 0;
                                    if(!obj.net) obj.net = obj.bruto;
                                    if(!obj.platform) obj.platform = 'Desconocido';
                                    data.push(obj);
                                }
                            } else {
                                obj.date = formatDate(obj.date);
                                if(obj.date && !isNaN(obj.amount)) data.push(obj);
                            }
                        }
                        resolve(data);
                    };
                    reader.readAsText(file);
                });
            };

            importPayload.bookings = await parseCSV(fileB, true);
            importPayload.expenses = await parseCSV(fileE, false);

            if(importPayload.bookings.length === 0 && importPayload.expenses.length === 0) {
                alert("No se encontraron datos válidos para importar. Revisa el formato de tu CSV.");
                return;
            }

            try {
                await this.state.apiCall('importData', 'POST', importPayload);
                alert("Importación completada con éxito.");
                document.getElementById('import-modal').classList.add('hidden');
                await this.state.loadPropertyData();
                this.renderAll();
            } catch(e) {
                alert("Error en la importación: " + e.message);
            }
        };

        if (document.getElementById('form-admin-link')) {
            document.getElementById('form-admin-link').onsubmit = async (e) => {
                e.preventDefault();
                const propId = document.getElementById('admin-prop-select').value;
                const email = document.getElementById('admin-user-email').value;
                try {
                    await this.state.adminLinkProperty(propId, email);
                    alert("Propiedad vinculada exitosamente al usuario.");
                    document.getElementById('admin-user-email').value = '';
                    this.renderAdminPanel();
                } catch(err) {
                    alert("Error: " + err.message);
                }
            };
        }

        if (document.getElementById('btn-admin-save-cat')) {
            document.getElementById('btn-admin-save-cat').onclick = async () => {
                const val = document.getElementById('admin-cat-input').value;
                try {
                    await this.state.adminUpdateGlobal('expense_categories', val);
                    alert("Categorías globales actualizadas.");
                    await this.state.loadGlobalSettings();
                } catch(err) { alert("Error: " + err.message); }
            };
        }

        if (document.getElementById('btn-admin-save-chan')) {
            document.getElementById('btn-admin-save-chan').onclick = async () => {
                const val = document.getElementById('admin-chan-input').value;
                try {
                    await this.state.adminUpdateGlobal('booking_platforms', val);
                    alert("Canales globales actualizados.");
                    await this.state.loadGlobalSettings();
                } catch(err) { alert("Error: " + err.message); }
            };
        }

        if (document.getElementById('btn-admin-delete-prop')) {
            document.getElementById('btn-admin-delete-prop').onclick = async () => {
                const propId = document.getElementById('admin-prop-select').value;
                const propName = document.getElementById('admin-prop-select').options[document.getElementById('admin-prop-select').selectedIndex].text;
                if(confirm(`ATENCIÓN: Vas a eliminar permanentemente la propiedad "${propName}" y TODOS sus datos.\n\nEsta acción no se puede deshacer. ¿Continuar?`)) {
                    try {
                        await this.state.adminDeleteProperty(propId);
                        alert("Propiedad eliminada.");
                        await this.state.loadUserProperties();
                        if(this.state.properties.length > 0) {
                            await this.state.loadPropertyData();
                            this.renderAll();
                        } else {
                            location.reload();
                        }
                    } catch(err) { alert("Error: " + err.message); }
                }
            };
        }
    }

    renderCustomFeatures() {
        const container = document.getElementById('custom-features-container');
        container.innerHTML = customFeatures.map((f, i) => `
            <div class="form-row-3 custom-feature-row" style="margin-bottom: 10px;">
                <div class="field"><input type="text" class="feat-name" placeholder="Nombre (ej: Piscina)" value="${f.name}"></div>
                <div class="field" style="position:relative;">
                    <input type="text" class="feat-value" placeholder="Valor (ej: Comunitaria)" value="${f.value}">
                    <button type="button" class="icon-btn" onclick="customFeatures.splice(${i},1); app.renderCustomFeatures();" style="position:absolute; right:-30px; top:10px;"><i class="fa fa-times text-danger"></i></button>
                </div>
            </div>
        `).join('');
    }

    renderView(v) {
        if(v === 'dashboard') this.renderDashboard();
        if(v === 'bookings') this.renderBookings();
        if(v === 'expenses') this.renderExpenses();
        if(v === 'analysis') this.renderAnalysis();
        if(v === 'bank') this.renderBank();
    }

    populateSelectors() {
        const opts = (arr) => '<option value="">Todos</option>' + arr.map(x => `<option value="${x}">${x}</option>`).join('');
        const catsOpts = this.state.globalExpenseCategories.map(x => `<option value="${x}">${x}</option>`).join('');
        const platOpts = this.state.globalPlatforms.map(x => `<option value="${x}">${x}</option>`).join('');

        document.getElementById('form-category-select').innerHTML = catsOpts;
        document.getElementById('form-platform-select').innerHTML = platOpts;

        const origins = [...new Set(this.state.bookings.map(x => x.origin))].filter(Boolean);
        const oriHTML = origins.length > 0 ? origins.map(x => `<option value="${x}">${x}</option>`).join('') : '<option value="España">España</option><option value="UK">UK</option><option value="Francia">Francia</option>';
        document.getElementById('origin-select').innerHTML = oriHTML;

        const platFilter = '<option value="">Todos los canales</option>' + this.state.globalPlatforms.map(x => `<option value="${x}">${x}</option>`).join('');
        document.getElementById('f-bookings-platform').innerHTML = platFilter;
        document.getElementById('f-analysis-platform').innerHTML = platFilter;
        document.getElementById('f-bank-platform').innerHTML = platFilter;

        document.getElementById('f-expenses-type').innerHTML = '<option value="">Todas las categorías</option>' + this.state.globalExpenseCategories.map(x => `<option value="${x}">${x}</option>`).join('');

        const oriFilter = '<option value="">Todos los orígenes</option>' + origins.map(x => `<option value="${x}">${x}</option>`).join('');
        document.getElementById('f-bookings-origin').innerHTML = oriFilter;
        document.getElementById('f-analysis-origin').innerHTML = oriFilter;
    }

    renderAll() {
        this.populateSelectors();

        const setupModal = document.getElementById('setup-modal');
        if (!this.state.currentActiveId) {
            if (this.state.currentUser === 'vegendigital@gmail.com') {
                this.state.adminGetAllProperties().then(data => {
                    const props = Array.isArray(data) ? data : (data.properties || []);
                    if(props && props.length > 0) {
                        this.state.currentActiveId = props[0].id;
                        this.state.loadUserProperties().then(() => {
                            this.state.loadPropertyData().then(() => {
                                setupModal.classList.add('hidden');
                                setupModal.style.display = 'none';
                                this.renderDashboard();
                                this.renderBookings();
                                this.renderExpenses();
                                this.renderAnalysis();
                                this.renderBank();
                            });
                        });
                        return;
                    }

                    setupModal.classList.remove('hidden');
                    setupModal.style.display = 'flex';
                    document.getElementById('close-setup').classList.add('hidden');

                    this.renderDashboard();
                    this.renderBookings();
                    this.renderExpenses();
                    this.renderAnalysis();
                    this.renderBank();
                });
            } else {
                if (this.state.currentUser !== 'vegendigital@gmail.com') {
                    setupModal.classList.remove('hidden');
                    setupModal.style.display = 'flex';
                    document.getElementById('close-setup').classList.add('hidden');
                }
            }
            return;
        }

        setupModal.classList.add('hidden');
        setupModal.style.display = 'none';
        const dispAddr = document.getElementById('display-address');
        if(dispAddr && this.state.config) dispAddr.innerText = (this.state.config.calle || '') + ', ' + (this.state.config.ciudad || '');
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
        const gestion = b.reduce((acc, x) => acc + parseFloat(x.fee_banco||0) + parseFloat(x.fee_admin||0) + parseFloat(x.limpieza||0), 0);
        const prop = e.reduce((acc, x) => acc + parseFloat(x.amount), 0);

        document.getElementById('dash-bruto').innerText = this.fmtMoney(bruto);
        document.getElementById('dash-gestion').innerText = this.fmtMoney(gestion);
        document.getElementById('dash-propiedad').innerText = this.fmtMoney(prop);
        document.getElementById('dash-neto').innerText = this.fmtMoney(bruto - gestion - prop);
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
            dataSet.fee[m] += parseFloat(x.fee_banco) + parseFloat(x.fee_admin);
        });

        const chartType = document.getElementById('chart-type') ? document.getElementById('chart-type').value : 'bar';

        this.chart = new Chart(ctx, {
            type: chartType,
            data: {
                labels: MONTHS_ES,
                datasets: [
                    { label: 'Bruto', data: dataSet.bruto, backgroundColor: '#0ea5e9', borderColor: '#0ea5e9', fill: false },
                    { label: 'Neto', data: dataSet.net, backgroundColor: '#10b981', borderColor: '#10b981', fill: false },
                    { label: 'Limpieza', data: dataSet.clean, backgroundColor: '#f59e0b', borderColor: '#f59e0b', fill: false },
                    { label: 'Comisiones', data: dataSet.fee, backgroundColor: '#f43f5e', borderColor: '#f43f5e', fill: false }
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
                <td>${x.checkin}</td><td>${x.platform}</td><td>${x.origin}</td><td>${this.fmtMoney(x.bruto)}</td>
                <td class="text-success">${this.fmtMoney(x.net)}</td>
                <td>
                    <button class="icon-btn" onclick="window.editB(${x.id})" title="Editar"><i class="fa fa-pencil text-accent"></i></button>
                    <button class="icon-btn" onclick="window.dupB(${x.id})" title="Duplicar"><i class="fa fa-copy text-success"></i></button>
                    <button class="icon-btn" onclick="window.delB(${x.id})" title="Eliminar"><i class="fa fa-trash text-danger"></i></button>
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
                <td>${x.date}</td><td>${x.category}</td><td>${this.fmtMoney(x.amount)}</td>
                <td>
                    <button class="icon-btn" onclick="window.editE(${x.id})" title="Editar"><i class="fa fa-pencil text-accent"></i></button>
                    <button class="icon-btn" onclick="window.dupE(${x.id})" title="Duplicar"><i class="fa fa-copy text-success"></i></button>
                    <button class="icon-btn" onclick="window.delE(${x.id})" title="Eliminar"><i class="fa fa-trash text-danger"></i></button>
                </td>
            </tr>
        `).join('');
    }

    renderAnalysis() {
        const b = this.getFiltered('bookings', 'checkin', 'analysis');
        const e = this.getFiltered('expenses', 'date', 'analysis');

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
            months[m].comisiones += (parseFloat(x.fee_banco||0) + parseFloat(x.fee_admin||0));
        });

        e.forEach(x => {
            const m = x.date.substring(0,7);
            if(!months[m]) months[m] = { month: m, res_count: 0, nights: 0, bruto: 0, net: 0, comisiones: 0, expenses: 0 };
            months[m].expenses += parseFloat(x.amount);
        });

        const data = this.sortData(Object.values(months), 'analysis');

        document.getElementById('stats-table-body').innerHTML = data.map(x => `
            <tr><td>${x.month}</td><td>${x.nights}</td><td>${this.fmtMoney(x.bruto)}</td><td class="text-success">${this.fmtMoney(x.net)}</td></tr>
        `).join('');

        const yearSelect = document.getElementById('matrix-year-select');
        const currentYear = new Date().getFullYear();
        let selectedYear = yearSelect ? yearSelect.value : currentYear.toString();

        if (yearSelect) {
            const years = new Set();
            b.forEach(x => years.add(x.checkin.substring(0, 4)));
            e.forEach(x => years.add(x.date.substring(0, 4)));
            if (years.size === 0) years.add(currentYear.toString());

            const sortedYears = Array.from(years).sort().reverse();

            const currentOptions = Array.from(yearSelect.options).map(o => o.value);
            const needsUpdate = currentOptions.join(',') !== sortedYears.join(',');

            if (needsUpdate || yearSelect.options.length === 0) {
                yearSelect.innerHTML = sortedYears.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>${y}</option>`).join('');
                if (!sortedYears.includes(selectedYear)) {
                     selectedYear = sortedYears[0];
                }
            }
            selectedYear = yearSelect.value || currentYear.toString();
        }

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

        const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const matrixData = [];
        for (let i = 1; i <= 12; i++) {
            const monthStr = i.toString().padStart(2, '0');
            const key = `${selectedYear}-${monthStr}`;
            matrixData.push({
                label: monthNames[i-1],
                data: months[key] || { res_count: 0, nights: 0, bruto: 0, net: 0, comisiones: 0, expenses: 0 }
            });
        }

        const headHtml = '<tr><th>Variables</th>' + matrixData.map(x => `<th>${x.label}</th>`).join('') + '</tr>';
        document.getElementById('matrix-head').innerHTML = headHtml;

        let bodyHtml = '';
        selectedVars.forEach(v => {
            bodyHtml += `<tr><td><b>${varLabels[v]}</b></td>`;
            matrixData.forEach(x => {
                let val = x.data[v];
                let displayVal = (v === 'res_count' || v === 'nights') ? val : val.toFixed(2);
                bodyHtml += `<td>${displayVal}</td>`;
            });
            bodyHtml += '</tr>';
        });
        document.getElementById('matrix-body').innerHTML = bodyHtml;

        const px = document.getElementById('analysis-pivot-x').value;
        const py = document.getElementById('analysis-pivot-y').value;
        const cross = {};
        b.forEach(x => {
            const key = px === 'month' ? x.checkin.substring(0,7) : x[px];
            if(!cross[key]) cross[key] = 0;
            cross[key] += py === 'count' ? 1 : parseFloat(x[py]);
        });
        document.getElementById('cross-analysis-body').innerHTML = Object.keys(cross).map(k => {
            const displayVal = py === 'count' ? cross[k] : this.fmtMoney(cross[k]);
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

            let colorClass = 'text-warning';
            if (Math.abs(diff) < 0.01) colorClass = 'text-success';
            else if (diff < 0) colorClass = 'text-danger';
            else colorClass = 'text-accent';

            return `
            <tr>
                <td>${x.checkin} - ${x.platform} - ${this.fmtMoney(x.bruto)}</td>
                <td>${this.fmtMoney(x.net)}</td>
                <td><input type="number" step="0.01" value="${rec.val}" onchange="window.upBank(${x.id}, 'val', this.value)"></td>
                <td class="${colorClass}"><b>${this.fmtMoney(diff)}</b></td>
                <td><input type="text" value="${rec.obs}" onchange="window.upBank(${x.id}, 'obs', this.value)"></td>
            </tr>`;
        }).join('');
    }

    async renderAdminPanel() {
        if (this.state.currentUser !== 'vegendigital@gmail.com') return;

        try {
            const allPropsReq = await this.state.adminGetAllProperties();
            const props = Array.isArray(allPropsReq) ? allPropsReq : (allPropsReq.properties || []);
            const propOptions = props.map(p => {
                const name = p.calle ? `${p.calle}, ${p.ciudad}` : `Propiedad #${p.id}`;
                return `<option value="${p.id}">${p.id} - ${name}</option>`;
            }).join('');

            const pSel = document.getElementById('admin-prop-select');
            if(pSel) pSel.innerHTML = propOptions;

            const usersReq = await this.state.adminGetUsers();
            const users = Array.isArray(usersReq) ? usersReq : (usersReq.users || []);
            const tbody = document.getElementById('admin-users-body');
            if(tbody) {
                tbody.innerHTML = users.map(u => `
                    <tr>
                        <td>${u.id}</td>
                        <td>${u.email}</td>
                        <td>
                            <button class="icon-btn text-danger" onclick="window.delUser(${u.id})" title="Eliminar Usuario"><i class="fa fa-trash"></i></button>
                        </td>
                    </tr>
                `).join('');
            }

            document.getElementById('admin-cat-input').value = this.state.globalExpenseCategories.join(', ');
            document.getElementById('admin-chan-input').value = this.state.globalPlatforms.join(', ');

            const linksReq = await this.state.adminGetLinks();
            const links = Array.isArray(linksReq) ? linksReq : (linksReq.links || []);
            const linksTbody = document.getElementById('admin-links-body');
            if(linksTbody) {
                linksTbody.innerHTML = links.map(l => `
                    <tr>
                        <td>${l.property_id}</td>
                        <td>${l.calle}, ${l.ciudad}</td>
                        <td>${l.email}</td>
                        <td><button class="icon-btn text-danger" onclick="window.delLink(${l.link_id})" title="Eliminar Vínculo"><i class="fa fa-unlink"></i></button></td>
                    </tr>
                `).join('');
            }

        } catch (e) {
            console.error("Error loading admin data", e);
        }
    }

    async renderMarketData() {
        const c = this.state.config;
        const container = document.getElementById('market-cards-container');
        const statusBox = document.getElementById('market-status-box');
        const mapContainer = document.getElementById('map');

        if (!c.ciudad || !c.m2 || !c.rooms) {
            statusBox.innerHTML = '<span class="text-warning"><i class="fa fa-exclamation-triangle"></i> Por favor, completa los datos de la propiedad (M2, Habitaciones, Ciudad) en "Configurar Propiedad" (haciendo clic en la dirección arriba a la derecha) para poder estimar el mercado.</span>';
            container.innerHTML = '';
            mapContainer.style.display = 'none';
            return;
        }

        statusBox.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Simulando IA de Scrapping en el universo digital...';
        mapContainer.style.display = 'block';

        setTimeout(() => {
            const m2 = parseFloat(c.m2);
            const r = parseFloat(c.rooms) || 1;

            const valVentaBase = m2 * 2500;
            const valVentaTarget = valVentaBase + (Math.random() * 50000 - 25000);

            const alqPermBase = m2 * 12;
            const alqPermTarget = alqPermBase + (Math.random() * 200 - 100);

            const alqTempBase = alqPermBase * 1.5;
            const alqTempTarget = alqTempBase + (Math.random() * 300 - 150);

            const now = new Date();
            const lastYearStart = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().split('T')[0];
            const netLastYear = this.state.bookings.filter(b => b.checkin >= lastYearStart).reduce((acc, x) => acc + parseFloat(x.net), 0);
            const gastosLastYear = this.state.expenses.filter(e => e.date >= lastYearStart).reduce((acc, x) => acc + parseFloat(x.amount), 0);
            const turisTarget = (netLastYear - gastosLastYear) > 0 ? (netLastYear - gastosLastYear) / 12 : (m2 * 25);

            const roaTuristico = ((turisTarget * 12) / valVentaTarget) * 100;
            const roaTemporal = ((alqTempTarget * 12) / valVentaTarget) * 100;
            const roaPerm = ((alqPermTarget * 12) / valVentaTarget) * 100;

            container.innerHTML = `
                <div class="card"><h3>Valor Venta Estimado</h3><p>${valVentaTarget.toLocaleString('es-ES', {maximumFractionDigits:0})}€</p><small>En base a ${c.ciudad}</small></div>
                <div class="card card-propiedad"><h3>Alquiler Permanente</h3><p>${alqPermTarget.toFixed(0)}€/mes</p><small>ROA: ${roaPerm.toFixed(1)}%</small></div>
                <div class="card card-gestion"><h3>Alquiler Temporal (1-11m)</h3><p>${alqTempTarget.toFixed(0)}€/mes</p><small>ROA: ${roaTemporal.toFixed(1)}%</small></div>
                <div class="card card-bruto"><h3>Alquiler Turístico (Actual)</h3><p>${turisTarget.toFixed(0)}€/mes</p><small>ROA: ${roaTuristico.toFixed(1)}%</small></div>
            `;

            statusBox.innerHTML = `Análisis completado para <b>${c.ciudad}</b>. Datos simulados en tiempo real.`;

            this.initMapMock(c.ciudad);

        }, 1500);
    }

    initMapMock(ciudad) {
        if(this.marketMap) {
            this.marketMap.remove();
        }

        let lat = 40.4168;
        let lng = -3.7038;

        if(ciudad.toLowerCase().includes('valencia')) { lat = 39.4699; lng = -0.3763; }
        else if(ciudad.toLowerCase().includes('barcelona')) { lat = 41.3851; lng = 2.1734; }
        else if(ciudad.toLowerCase().includes('sevilla')) { lat = 37.3891; lng = -5.9845; }
        else if(ciudad.toLowerCase().includes('malaga')) { lat = 36.7213; lng = -4.4213; }

        this.marketMap = L.map('map').setView([lat, lng], 14);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(this.marketMap);

        L.circleMarker([lat, lng], { color: 'blue', radius: 8, fillOpacity: 0.8 }).addTo(this.marketMap).bindPopup("Tu Propiedad");

        for(let i=0; i<20; i++) {
            const rLat = lat + (Math.random() - 0.5) * 0.02;
            const rLng = lng + (Math.random() - 0.5) * 0.02;
            const type = Math.random();
            let color = 'red';
            let name = 'Piso Turístico';
            if(type > 0.6 && type < 0.8) { color = 'orange'; name = 'Alquiler Temporal'; }
            else if(type >= 0.8) { color = 'green'; name = 'Alquiler Permanente'; }

            L.circleMarker([rLat, rLng], { color: color, radius: 5, fillOpacity: 0.5 }).addTo(this.marketMap).bindPopup(name);
        }
    }

    getFiltered(type, dateKey, view) {
        let arr = this.state[type];
        const s = this.state.filters[view].start;
        const e = this.state.filters[view].end;
        if(s) arr = arr.filter(x => x[dateKey] >= s);
        if(e) arr = arr.filter(x => x[dateKey] <= e);
        return arr;
    }


    fmtMoney(val) {
        const c = this.state.config?.currency || 'EUR';
        const num = parseFloat(val).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        if (c === 'USD') return `$${num}`;
        if (c === 'ARS') return `AR$${num}`;
        return `${num}€`;
    }

    sortData(arr, type) {
        const s = this.sorts[type];
        return arr.sort((a,b) => a[s.k] > b[s.k] ? (1 * s.d) : (-1 * s.d));
    }
}

const app = new UI(new AppState());
window.app = app;

window.setSort = (t, k) => { app.sorts[t].d *= -1; app.sorts[t].k = k; app.renderAll(); };
window.delB = async (id) => { if(confirm("¿Eliminar reserva?")) { await app.state.deleteRecord('booking', id); app.renderAll(); } };
window.editB = (id) => {
    const x = app.state.bookings.find(b => b.id == id);
    const f = document.getElementById('form-booking');
    Object.keys(x).forEach(k => { if(f.elements[k]) f.elements[k].value = x[k]; });
    f.elements['booking_id'].value = id;
    document.querySelector('button[data-target="view-bookings"]').click();
    window.scrollTo(0,0);
};
window.dupB = (id) => {
    window.editB(id);
    document.getElementById('edit-booking-id').value = '';
    alert("Reserva duplicada en el formulario. Edita los campos necesarios y presiona Guardar.");
};
window.delE = async (id) => { if(confirm("¿Eliminar gasto?")) { await app.state.deleteRecord('expense', id); app.renderAll(); } };
window.editE = (id) => {
    const x = app.state.expenses.find(e => e.id == id);
    const f = document.getElementById('form-expense');
    Object.keys(x).forEach(k => { if(f.elements[k]) f.elements[k].value = x[k]; });
    f.elements['expense_id'].value = id;
    document.querySelector('button[data-target="view-expenses"]').click();
    window.scrollTo(0,0);
};
window.dupE = (id) => {
    window.editE(id);
    document.querySelector('#form-expense [name="expense_id"]').value = '';
    alert("Gasto duplicado en el formulario. Edita los campos necesarios y presiona Guardar.");
};
window.upBank = async (id, k, v) => {
    let r = app.state.bankRecords.find(x => x.booking_id === id);
    let val = r ? r.val : 0;
    let obs = r ? r.obs : '';
    if(k === 'val') val = parseFloat(v);
    if(k === 'obs') obs = v;
    await app.state.updateBank(id, val, obs);
    app.renderAll();
};
window.delUser = async (id) => {
    if(confirm("¿Eliminar usuario y todas sus propiedades asociadas permanentemente?")) {
        await app.state.adminDeleteUser(id);
        app.renderAll();
    }
};

window.delLink = async (id) => {
    if(confirm("¿Quitar acceso de este usuario a la propiedad?")) {
        await app.state.adminDeleteLink(id);
        app.renderAdminPanel();
    }
};
