export const initChart = (canvasId, data) => {
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    return new Chart(ctx, {
        type: 'line', // Cambiamos 'bar' por 'line'
        data: {
            labels: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
            datasets: [
                { 
                    label: 'Bruto', 
                    data: data.bruto, 
                    borderColor: '#0ea5e9', // Azul
                    backgroundColor: 'rgba(14, 165, 233, 0.1)', 
                    tension: 0.3, // Suaviza la curva de la línea
                    fill: false,
                    borderWidth: 3
                },
                { 
                    label: 'Neto', 
                    data: data.net, 
                    borderColor: '#10b981', // Verde
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.3,
                    fill: false,
                    borderWidth: 3
                },
                { 
                    label: 'Limpieza', 
                    data: data.clean, 
                    borderColor: '#f59e0b', // Naranja
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    borderDash: [5, 5], // Línea punteada para diferenciar
                    fill: false
                },
                { 
                    label: 'Comisiones', 
                    data: data.fee, 
                    borderColor: '#f43f5e', // Rojo
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    borderDash: [5, 5], 
                    fill: false
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, padding: 20 }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) { return value + '€'; }
                    }
                }
            }
        }
    });
};