export class AppState {
    constructor() {
        this.currentActiveId = localStorage.getItem('last_active_id') || null;
        this.config = null;
        this.bookings = [];
        this.expenses = [];
        this.bankRecords = [];
        this.filters = {
            dashboard: { start: '2025-01-01', end: '2025-12-31' }
        };
        
        if (this.currentActiveId) {
            this.loadActiveData(this.currentActiveId);
        }
    }

    loadActiveData(id) {
        if (!id) return;
        this.currentActiveId = id;
        localStorage.setItem('last_active_id', id);
        
        const safeParse = (key) => {
            const data = localStorage.getItem(key);
            try { return data ? JSON.parse(data) : null; } catch(e) { return null; }
        };

        this.config = safeParse(`conf_${id}`);
        this.bookings = safeParse(`res_${id}`) || [];
        this.expenses = safeParse(`gas_${id}`) || [];
        this.bankRecords = safeParse(`bnk_${id}`) || [];
    }

    save() {
        const id = this.currentActiveId;
        if (!id) return;
        localStorage.setItem(`conf_${id}`, JSON.stringify(this.config));
        localStorage.setItem(`res_${id}`, JSON.stringify(this.bookings));
        localStorage.setItem(`gas_${id}`, JSON.stringify(this.expenses));
        localStorage.setItem(`bnk_${id}`, JSON.stringify(this.bankRecords));
    }
}