const tbody = document.getElementById('history-tbody');
const refreshBtn = document.getElementById('refresh-btn');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');
const uniqueFilter = document.getElementById('unique-filter');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const exportExcelBtn = document.getElementById('export-excel-btn');

let allMessages = [];

async function loadHistory() {
  tbody.innerHTML = '<tr><td colspan="6" style="padding: 40px; text-align: center; color: var(--text-muted);"><i data-lucide="loader-2" class="spin" style="margin-bottom: 10px;"></i><br>Loading history...</td></tr>';
  lucide.createIcons();
  
  try {
    const res = await fetch('/api/messages');
    allMessages = await res.json();
    renderTable();
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 40px; text-align: center; color: var(--danger-color);">Failed to load history.</td></tr>';
  }
}

function renderTable() {
  let filtered = [...allMessages];

  // Search
  const query = searchInput.value.toLowerCase().trim();
  if (query) {
    filtered = filtered.filter(m => m.phone.toLowerCase().includes(query));
  }

  // Status
  const status = statusFilter.value;
  if (status !== 'all') {
    filtered = filtered.filter(m => m.status.toLowerCase() === status);
  }

  // Unique
  if (uniqueFilter.checked) {
    const seen = new Set();
    filtered = filtered.filter(m => {
      if (seen.has(m.phone)) return false;
      seen.add(m.phone);
      return true;
    });
  }

  tbody.innerHTML = '';
  
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding: 40px; text-align: center; color: var(--text-muted);">No messages found matching criteria.</td></tr>';
    return;
  }
  
  filtered.forEach((msg, index) => {
    const tr = document.createElement('tr');
    
    const date = new Date(msg.date).toLocaleString();
    const statusColor = msg.status.toLowerCase() === 'sent' ? 'var(--accent-color)' : 'var(--danger-color)';
    const statusIcon = msg.status.toLowerCase() === 'sent' ? 'check-circle-2' : 'x-circle';
    
    // truncate message for display
    const shortMsg = msg.message.length > 50 ? msg.message.substring(0, 50) + '...' : msg.message;

    tr.innerHTML = `
      <td style="color: var(--text-muted);">${index + 1}</td>
      <td style="font-weight: 500; color: #fff;">
        <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: ${statusColor}; margin-right: 6px;"></span>
        ${msg.phone}
      </td>
      <td style="color: var(--text-dark); max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${msg.message.replace(/"/g, '&quot;')}">${shortMsg}</td>
      <td>
        <span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; background: ${msg.status.toLowerCase() === 'sent' ? 'rgba(109, 165, 192, 0.1)' : 'rgba(244, 63, 94, 0.1)'}; color: ${statusColor}; border: 1px solid ${statusColor}33;">
          <i data-lucide="${statusIcon}" style="width: 12px; height: 12px;"></i> ${msg.status}
        </span>
      </td>
      <td style="color: var(--text-muted); font-size: 13px;">${date}</td>
      <td style="text-align: right;">
        <div style="display: flex; gap: 8px; justify-content: flex-end;">
          <button onclick="deleteLog('${msg.id}')" style="background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); padding: 6px; border-radius: 6px; color: var(--text-muted); cursor: pointer; transition: all 0.2s;" onmouseover="this.style.color='var(--danger-color)'" onmouseout="this.style.color='var(--text-muted)'">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </div>
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  lucide.createIcons();
}

window.deleteLog = async function(id) {
  if (!confirm('Are you sure you want to delete this log entry?')) return;
  
  try {
    const res = await fetch(`/api/messages/${id}`, { method: 'DELETE' });
    if (res.ok) {
      allMessages = allMessages.filter(m => m.id !== id);
      renderTable();
    } else {
      alert('Failed to delete log.');
    }
  } catch(e) {
    console.error(e);
  }
};

// Listeners
refreshBtn.addEventListener('click', () => {
  loadHistory();
  const icon = refreshBtn.querySelector('i');
  icon.classList.add('spin');
  setTimeout(() => icon.classList.remove('spin'), 500);
});

searchInput.addEventListener('input', renderTable);
statusFilter.addEventListener('change', renderTable);
uniqueFilter.addEventListener('change', renderTable);

// Exports
exportExcelBtn.addEventListener('click', () => {
  if(allMessages.length === 0) return alert('No data to export');
  
  const data = allMessages.map((m, i) => ({
    '#': i + 1,
    'Phone Number': m.phone,
    'Message': m.message,
    'Status': m.status,
    'Date & Time': new Date(m.date).toLocaleString()
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "History");
  XLSX.writeFile(wb, "WA_Message_History.xlsx");
});

exportPdfBtn.addEventListener('click', () => {
  if(allMessages.length === 0) return alert('No data to export');
  
  // Create a temporary container for html2pdf
  const container = document.createElement('div');
  container.style.padding = '20px';
  container.style.fontFamily = 'sans-serif';
  container.style.color = '#000';
  
  const title = document.createElement('h2');
  title.innerText = 'WA Message History';
  title.style.marginBottom = '20px';
  title.style.color = '#000';
  container.appendChild(title);

  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '12px';
  
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr style="background: #0f969c; color: white;">
      <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">#</th>
      <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Phone Number</th>
      <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Message</th>
      <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Status</th>
      <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Date & Time</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  allMessages.forEach((m, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding: 8px; border: 1px solid #ddd;">${i + 1}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${m.phone}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${m.message.length > 40 ? m.message.substring(0, 40) + '...' : m.message}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; color: ${m.status.toLowerCase() === 'sent' ? '#10b981' : '#ef4444'};">${m.status}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${new Date(m.date).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);

  const opt = {
    margin:       0.5,
    filename:     'WA_Message_History.pdf',
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  html2pdf().set(opt).from(container).save();
});

// Init
loadHistory();
