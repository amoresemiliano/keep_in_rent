export const renderMarketData = (container, statusBox, cp) => {
    // Simulación de métricas por zona
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
    
    statusBox.innerText = `Datos analizados para el CP: ${cp}`;
};