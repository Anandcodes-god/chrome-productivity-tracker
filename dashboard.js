document.addEventListener('DOMContentLoaded', () => {
    // Request full data (Today + History) from Background
    chrome.runtime.sendMessage({ action: "getData" }, (response) => {
        if (response) {
            initDashboard(response);
        }
    });
});

let hoverData = []; // Store chart coordinates for interactivity

function initDashboard(data) {
    const todayData = data.today || {};
    const historyData = data.history || {};
    
    // 1. Process "Today"
    const todayItems = Object.entries(todayData)
        .map(([domain, seconds]) => ({ domain, seconds }))
        .sort((a, b) => b.seconds - a.seconds);
        
    const totalSecondsToday = todayItems.reduce((sum, item) => sum + item.seconds, 0);
    document.getElementById('today-total').textContent = formatTimeShort(totalSecondsToday);

    // 2. Process "History" (Last 7 Days)
    const historyArray = processHistory(historyData);
    
    // 3. Render Components
    drawWeeklyChart(historyArray);
    drawTodayDonut(todayItems, totalSecondsToday);
    renderTable(todayItems);
}

// --- DATA PROCESSING ---

function processHistory(historyData) {
    const days = [];
    const todayStr = new Date().toISOString().split("T")[0];
    
    // Generate last 7 days keys
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        
        // Sum total seconds for that day
        const dayRecord = historyData[key] || {};
        const total = Object.values(dayRecord).reduce((a, b) => a + b, 0);
        
        days.push({
            date: key === todayStr ? "Today" : d.toLocaleDateString('en-US', {weekday:'short'}),
            totalSeconds: total,
            fullDate: key
        });
    }
    return days;
}

// --- CHARTS ---

function drawWeeklyChart(data) {
    const canvas = document.getElementById('weeklyChart');
    const ctx = canvas.getContext('2d');
    setupCanvas(canvas, ctx);
    
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;
    const padding = 30;
    
    const maxVal = Math.max(...data.map(d => d.totalSeconds)) || 1;
    const barWidth = (w - (padding * 2)) / data.length;
    
    ctx.clearRect(0,0,w,h);
    
    data.forEach((day, i) => {
        const barHeight = (day.totalSeconds / maxVal) * (h - padding - 20);
        const x = padding + (i * barWidth) + 10;
        const y = h - padding - barHeight;
        
        // Draw Bar
        ctx.fillStyle = i === data.length - 1 ? '#8ab4f8' : '#3c4043'; // Highlight Today
        ctx.fillRect(x, y, barWidth - 20, barHeight);
        
        // Draw Label
        ctx.fillStyle = '#9aa0a6';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(day.date, x + (barWidth - 20)/2, h - 10);

        // Hover Area Registration (Simple box detection)
        // (For advanced interactivity, we would add event listeners here similar to the Donut chart)
    });
}

function drawTodayDonut(items, total) {
    const canvas = document.getElementById('todayChart');
    const ctx = canvas.getContext('2d');
    setupCanvas(canvas, ctx);
    
    const w = canvas.width / window.devicePixelRatio;
    const h = canvas.height / window.devicePixelRatio;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 20;
    const thickness = 20;
    
    let startAngle = -Math.PI / 2;
    const colors = ['#8ab4f8', '#f28b82', '#fdd663', '#81c995', '#c58af9', '#dadce0'];
    
    // Group small items into "Other" for the chart
    let chartItems = items.slice(0, 5);
    const otherSec = items.slice(5).reduce((s, i) => s + i.seconds, 0);
    if(otherSec > 0) chartItems.push({ domain: 'Other', seconds: otherSec });

    hoverData = []; // Clear old data

    chartItems.forEach((item, i) => {
        const sliceAngle = (item.seconds / total) * 2 * Math.PI;
        const endAngle = startAngle + sliceAngle;
        const color = colors[i % colors.length];
        
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.arc(cx, cy, r - thickness, endAngle, startAngle, true);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.stroke(); // Gap
        
        // Store for Hover
        hoverData.push({ start: startAngle, end: endAngle, label: item.domain, value: item.seconds });
        
        startAngle += sliceAngle;
    });
    
    attachHover(canvas, cx, cy, r, thickness);
}

// --- UTILS & TABLE ---

function renderTable(items) {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    
    items.forEach(item => {
        const tr = document.createElement('tr');
        const icon = `https://www.google.com/s2/favicons?domain=${item.domain}&sz=32`;
        
        tr.innerHTML = `
            <td>
                <div class="site-cell">
                    <img class="favicon" src="${icon}">
                    ${item.domain}
                </div>
            </td>
            <td style="text-align:right">${formatTimeDetailed(item.seconds)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function setupCanvas(canvas, ctx) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1e1f24';
}

function attachHover(canvas, cx, cy, r, thickness) {
    const tooltip = document.getElementById('tooltip');
    
    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        const dx = e.clientX - rect.left - cx;
        const dy = e.clientY - rect.top - cy;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        // normalize angle
        let angle = Math.atan2(dy, dx) - (-Math.PI/2);
        if (angle < 0) angle += 2*Math.PI;

        if (dist >= r - thickness && dist <= r) {
            const slice = hoverData.find(s => {
                let sStart = normalize(s.start);
                let sEnd = normalize(s.end);
                if (sEnd < sStart) return angle >= sStart || angle <= sEnd;
                return angle >= sStart && angle <= sEnd;
            });
            
            if (slice) {
                tooltip.textContent = `${slice.label}: ${formatTimeDetailed(slice.value)}`;
                tooltip.style.left = e.clientX + 10 + "px";
                tooltip.style.top = e.clientY + 10 + "px";
                tooltip.classList.remove('hidden');
            }
        } else {
            tooltip.classList.add('hidden');
        }
    });
    canvas.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
}

function normalize(angle) {
    let a = angle - (-Math.PI/2);
    if(a < 0) a += 2*Math.PI;
    return a;
}

function formatTimeShort(s) {
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatTimeDetailed(s) {
    const h = Math.floor(s/3600);
    const m = Math.floor((s%3600)/60);
    const sec = s%60;
    if(h>0) return `${h}h ${m}m`;
    if(m>0) return `${m}m ${sec}s`;
    return `${sec}s`;
}