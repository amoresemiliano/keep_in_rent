export const renderBookingRows = (container, bookings, onEdit, onDelete) => {
    container.innerHTML = bookings.map(x => `
        <tr>
            <td>${x.checkin}</td>
            <td>${x.platform}</td>
            <td>${x.origin}</td>
            <td>${parseFloat(x.bruto).toFixed(2)}€</td>
            <td class="text-success">${parseFloat(x.net).toFixed(2)}€</td>
            <td>
                <button class="icon-btn edit-b" data-id="${x.id}"><i class="fa fa-pencil text-accent"></i></button>
                <button class="icon-btn del-b" data-id="${x.id}"><i class="fa fa-trash text-danger"></i></button>
            </td>
        </tr>
    `).join('');
    
    container.querySelectorAll('.edit-b').forEach(btn => btn.onclick = () => onEdit(btn.dataset.id));
    container.querySelectorAll('.del-b').forEach(btn => btn.onclick = () => onDelete(btn.dataset.id));
};

export const renderExpenseRows = (container, expenses, onEdit, onDelete) => {
    container.innerHTML = expenses.map(x => `
        <tr>
            <td>${x.date}</td>
            <td>${x.category}</td>
            <td>${parseFloat(x.amount).toFixed(2)}€</td>
            <td>
                <button class="icon-btn edit-e" data-id="${x.id}"><i class="fa fa-pencil text-accent"></i></button>
                <button class="icon-btn del-e" data-id="${x.id}"><i class="fa fa-trash text-danger"></i></button>
            </td>
        </tr>
    `).join('');
    
    container.querySelectorAll('.edit-e').forEach(btn => btn.onclick = () => onEdit(btn.dataset.id));
    container.querySelectorAll('.del-e').forEach(btn => btn.onclick = () => onDelete(btn.dataset.id));
};

export const renderBankRows = (container, bookings, bankRecords, onUpdate) => {
    container.innerHTML = bookings.map(x => {
        const rec = bankRecords.find(r => r.id == x.id) || { val: 0, obs: '' };
        const diff = rec.val - x.net;
        return `
            <tr>
                <td>#${x.booking_ref}</td>
                <td>${x.net.toFixed(2)}€</td>
                <td><input type="number" class="bank-val" data-id="${x.id}" value="${rec.val}" style="width:80px"></td>
                <td class="${Math.abs(diff) < 0.1 ? 'text-success' : 'text-danger'}">${diff.toFixed(2)}€</td>
                <td><input type="text" class="bank-obs" data-id="${x.id}" value="${rec.obs}"></td>
            </tr>`;
    }).join('');

    container.querySelectorAll('.bank-val, .bank-obs').forEach(input => {
        input.onchange = (e) => onUpdate(input.dataset.id, input.classList.contains('bank-val') ? 'val' : 'obs', e.target.value);
    });
};


export const renderMarketData = (container, statusBox, cp) => {
    const metrics = [
        { t: "Precio Medio Zona", v: "142€" },
        { t: "Ocupación Media", v: "78%" },
        { t: "Tendencia Demanda", v: "Alta" },
        { t: "RevPAR Estimado", v: "110€" }
    ];
    
    container.innerHTML = metrics.map(x => `
        <div class="card">
            <h3>${x.t}</h3>
            <p>${x.v}</p>
        </div>
    `).join('');
    
    if (statusBox) {
        statusBox.innerText = `Datos analizados para el CP: ${cp}`;
    }
};