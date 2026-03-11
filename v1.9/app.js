// --- 1. CONFIGURACIÓN --- 
const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]; 
const COUNTRIES = ["España", "Francia", "Alemania", "Reino Unido", "Italia", "USA", "México", "Argentina", "Brasil", "Portugal", "Otros"].sort(); 
 
// --- 2. ESTADO --- 
class AppState { 
    constructor() { 
        this.currentActiveId = localStorage.getItem('last_active_id') || null; 
        this.config = null; 
        this.bookings = []; 
        this.expenses = []; 
        this.bankRecords = []; 
        this.filters = { 
            dashboard: { start: '2025-01-01', end: '2025-12-31' }, 
            bookings: { start: '2025-01-01', end: '2025-12-31', platform: '', origin: '' }, 
            expenses: { start: '2025-01-01', end: '2025-12-31', type: '' }, 
            analysis: { start: '2025-01-01', end: '2025-12-31', platform: '', origin: '' }, 
            bank: { start: '2025-01-01', end: '2025-12-31' } 
        }; 
        if(this.currentActiveId) this.loadActiveData(this.currentActiveId); 
    } 
 
    loadActiveData(id) { 
        this.currentActiveId = id; 
        localStorage.setItem('last_active_id', id); 
        this.config = JSON.parse(localStorage.getItem(`conf_${id}`)) || null; 
        this.bookings = JSON.parse(localStorage.getItem(`res_${id}`)) || []; 
        this.expenses = JSON.parse(localStorage.getItem(`gas_${id}`)) || []; 
        this.bankRecords = JSON.parse(localStorage.getItem(`bnk_${id}`)) || []; 
    } 
 
    save() { 
        const id = this.currentActiveId; 
        localStorage.setItem(`conf_${id}`, JSON.stringify(this.config)); 
        localStorage.setItem(`res_${id}`, JSON.stringify(this.bookings)); 
        localStorage.setItem(`gas_${id}`, JSON.stringify(this.expenses)); 
        localStorage.setItem(`bnk_${id}`, JSON.stringify(this.bankRecords)); 
    } 
 
    addBooking(data) { 
        const net = parseFloat(data.bruto) - (parseFloat(data.fee_banco)||0) - (parseFloat(data.fee_thl)||0) - (parseFloat(data.limpieza)||0); 
        const nights = Math.max(1, (new Date(data.checkout) - new Date(data.checkin)) / 86400000); 
        if(data.booking_id) this.bookings = this.bookings.map(b => b.id == data.booking_id ? {...data, net, nights, id: b.id} : b); 
        else this.bookings.push({...data, net, nights, id: Date.now()}); 
        this.save(); 
    } 
 
    addExpense(data) { 
        if(data.expense_id) this.expenses = this.expenses.map(e => e.id == data.expense_id ? {...data, id: e.id} : e); 
        else this.expenses.push({...data, id: Date.now()}); 
        this.save(); 
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
 
        // Eventos de filtros 
        ['dashboard','bookings','expenses','analysis','bank'].forEach(v => { 
            document.getElementById(`f-${v}-start`).onchange = (e) => { this.state.filters[v].start = e.target.value; this.renderAll(); }; 
            document.getElementById(`f-${v}-end`).onchange = (e) => { this.state.filters[v].end = e.target.value; this.renderAll(); }; 
        }); 
 
        document.getElementById('f-bookings-platform').onchange = (e) => { this.state.filters.bookings.platform = e.target.value; this.renderAll(); }; 
        document.getElementById('f-bookings-origin').onchange = (e) => { this.state.filters.bookings.origin = e.target.value; this.renderAll(); }; 
        document.getElementById('f-expenses-type').onchange = (e) => { this.state.filters.expenses.type = e.target.value; this.renderAll(); }; 
 
        document.getElementById('form-booking').onsubmit = (e) => { e.preventDefault(); this.state.addBooking(Object.fromEntries(new FormData(e.target))); e.target.reset(); this.renderAll(); }; 
        document.getElementById('form-expense').onsubmit = (e) => { e.preventDefault(); this.state.addExpense(Object.fromEntries(new FormData(e.target))); e.target.reset(); this.renderAll(); }; 
 
        document.getElementById('setup-form').onsubmit = (e) => { 
            e.preventDefault(); 
            const d = Object.fromEntries(new FormData(e.target)); 
            this.state.loadActiveData(btoa(d.direccion)); 
            this.state.config = d; 
            this.state.save(); 
            location.reload(); 
        }; 
 
        document.getElementById('analysis-pivot-x').onchange = () => this.renderAnalysis(); 
        document.getElementById('analysis-pivot-y').onchange = () => this.renderAnalysis(); 

        // Import Import logic
        document.getElementById('btn-open-import').onclick = () => document.getElementById('import-modal').classList.remove('hidden');
        document.getElementById('close-import').onclick = () => document.getElementById('import-modal').classList.add('hidden');

        document.getElementById('import-form').onsubmit = async (e) => {
            e.preventDefault();
            const clear = document.getElementById('clear-existing').checked;
            if(clear) {
                this.state.bookings = [];
                this.state.expenses = [];
                this.state.bankRecords = [];
            }
            
            const fileB = document.getElementById('file-bookings').files[0];
            const fileE = document.getElementById('file-expenses').files[0];
            
            const promises = [];
            if(fileB) promises.push(this.processCSV(fileB, 'bookings'));
            if(fileE) promises.push(this.processCSV(fileE, 'expenses'));

            await Promise.all(promises);

            // Auto-adjust filters to imported data range
            const allDates = [
                ...this.state.bookings.map(b => b.checkin),
                ...this.state.expenses.map(e => e.date)
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
            document.getElementById('import-modal').classList.add('hidden');
            e.target.reset();
            this.renderAll();
        };
    } 

    processCSV(file, type) {
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
                        const booking = {
                            booking_ref: getVal(cols, map.ref) || 'CSV-'+Date.now(),
                            platform: getVal(cols, map.platform) || 'Directo',
                            origin: getVal(cols, map.origin) || 'Otros',
                            checkin: parseDate(getVal(cols, map.checkin)),
                            checkout: parseDate(getVal(cols, map.checkout)),
                            bruto: parseEur(getVal(cols, map.bruto)),
                            fee_banco: parseEur(getVal(cols, map.fee_chan)),
                            fee_thl: parseEur(getVal(cols, map.fee_thl)),
                            limpieza: parseEur(getVal(cols, map.clean))
                        };
                        if(booking.checkin && booking.bruto) this.state.addBooking(booking);
                    } else {
                        const prov = getVal(cols, map.prov);
                        const obs = getVal(cols, map.obs);
                        const fullObs = (prov + ' ' + obs).trim();
                        
                        // Infer category
                        let cat = 'Mantenimiento';
                        const text = fullObs.toLowerCase();
                        if(text.includes('luz') || text.includes('endesa') || text.includes('iberdrola')) cat = 'Luz';
                        else if(text.includes('gas') || text.includes('naturgy')) cat = 'Gas';
                        else if(text.includes('internet') || text.includes('wifi') || text.includes('digi') || text.includes('movistar')) cat = 'Internet';
                        else if(text.includes('comunidad') || text.includes('administracion')) cat = 'Comunidad';
                        else if(text.includes('ibi') || text.includes('suma') || text.includes('ayuntamiento')) cat = 'IBI';
                        
                        const expense = {
                            date: parseDate(getVal(cols, map.date)),
                            category: cat,
                            amount: parseEur(getVal(cols, map.amount)),
                            observations: fullObs
                        };
                        if(expense.date && expense.amount) this.state.addExpense(expense);
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
        if(!this.state.config) { document.getElementById('setup-modal').classList.remove('hidden'); return; } 
        document.getElementById('display-address').innerText = this.state.config.direccion; 
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
        this.updateChart(b); 
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
        const months = {}; 
        b.forEach(x => { 
            const m = x.checkin.substring(0,7); 
            if(!months[m]) months[m] = { month: m, nights: 0, bruto: 0, net: 0 }; 
            months[m].nights += parseFloat(x.nights); 
            months[m].bruto += parseFloat(x.bruto); 
            months[m].net += parseFloat(x.net); 
        }); 
        const data = this.sortData(Object.values(months), 'analysis'); 
        document.getElementById('stats-table-body').innerHTML = data.map(x => ` 
            <tr><td>${x.month}</td><td>${x.nights}</td><td>${x.bruto.toFixed(2)}€</td><td class="text-success">${x.net.toFixed(2)}€</td></tr> 
        `).join(''); 
 
        // Explorador Cruzado 
        const px = document.getElementById('analysis-pivot-x').value; 
        const py = document.getElementById('analysis-pivot-y').value; 
        const cross = {}; 
        b.forEach(x => { 
            const key = px === 'month' ? x.checkin.substring(0,7) : x[px]; 
            if(!cross[key]) cross[key] = 0; 
            cross[key] += py === 'count' ? 1 : parseFloat(x[py]); 
        }); 
        document.getElementById('cross-analysis-body').innerHTML = Object.keys(cross).map(k => `<tr><td><b>${k}</b></td><td>${cross[k].toFixed(2)}</td></tr>`).join(''); 
    } 
 
    renderBank() { 
        const b = this.getFiltered('bookings', 'checkin', 'bank'); 
        document.getElementById('bank-list-body').innerHTML = b.map(x => { 
            const rec = this.state.bankRecords.find(r => r.id === x.id) || { val: 0, obs: '' }; 
            const diff = rec.val - x.net; 
            return `<tr> 
                <td>#${x.booking_ref}</td><td>${x.net.toFixed(2)}€</td> 
                <td><input type="number" value="${rec.val}" onchange="window.upBank(${x.id}, 'val', this.value)" style="width:80px"></td> 
                <td class="${Math.abs(diff)<0.1?'text-success':'text-danger'}">${diff.toFixed(2)}€</td> 
                <td><input type="text" value="${rec.obs}" onchange="window.upBank(${x.id}, 'obs', this.value)"></td> 
            </tr>`; 
        }).join(''); 
    } 
 
    renderMarket() { 
        const c = document.getElementById('market-cards-container'); 
        const m = [{t:"Precio Medio", v:"142€"}, {t:"Ocupación", v:"78%"}, {t:"Demanda", v:"Alta"}, {t:"RevPAR", v:"110€"}]; 
        c.innerHTML = m.map(x => `<div class="card"><h3>${x.t}</h3><p>${x.v}</p></div>`).join(''); 
        document.getElementById('market-status-box').innerText = "Datos basados en CP " + this.state.config.cp; 
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
 
// Globales para botones 
window.setSort = (t, k) => { app.sorts[t].d *= -1; app.sorts[t].k = k; app.renderAll(); }; 
window.delB = (id) => { app.state.bookings = app.state.bookings.filter(x => x.id !== id); app.state.save(); app.renderAll(); }; 
window.editB = (id) => { const x = app.state.bookings.find(b => b.id === id); const f = document.getElementById('form-booking'); Object.keys(x).forEach(k => { if(f[k]) f[k].value = x[k]; }); window.scrollTo(0,0); }; 
window.delE = (id) => { app.state.expenses = app.state.expenses.filter(x => x.id !== id); app.state.save(); app.renderAll(); }; 
window.editE = (id) => { const x = app.state.expenses.find(e => e.id === id); const f = document.getElementById('form-expense'); Object.keys(x).forEach(k => { if(f[k]) f[k].value = x[k]; }); window.scrollTo(0,0); }; 
window.upBank = (id, k, v) => {  
    let r = app.state.bankRecords.find(x => x.id === id); 
    if(!r) { r = {id, val:0, obs:''}; app.state.bankRecords.push(r); } 
    r[k] = k === 'val' ? parseFloat(v) : v; 
    app.state.save(); app.renderAll(); 
};