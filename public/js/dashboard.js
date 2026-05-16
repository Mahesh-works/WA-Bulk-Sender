const currentUser = localStorage.getItem('wa_user');
const currentName = localStorage.getItem('wa_name');

if (!currentUser) {
  window.location.href = '/';
}

const socket = io();
socket.emit('init-wa', { userId: currentUser });

// State
let numbers = [];
const savedTemplates = localStorage.getItem('wa_templates');
let templates = savedTemplates ? JSON.parse(savedTemplates) : [
  "Hi! Check out our latest offers 🎉",
  "Hello! We have something special for you today 🌟"
];
let isRunning = false;

// DOM Elements
const fileInput = document.getElementById('file-input');
const uploadStatus = document.getElementById('upload-status');
const templatesContainer = document.getElementById('templates-container');
const addTemplateBtn = document.getElementById('add-template-btn');
const minDelayInput = document.getElementById('min-delay-input');
const maxDelayInput = document.getElementById('max-delay-input');
const startBtn = document.getElementById('start-btn');
const startText = document.getElementById('start-text');
const startIcon = document.getElementById('start-icon');
const activityLog = document.getElementById('activity-log');
const disconnectWaBtn = document.getElementById('disconnect-wa-btn');

// Tab Elements
const tabUpload = document.getElementById('tab-upload');
const tabPaste = document.getElementById('tab-paste');
const viewUpload = document.getElementById('view-upload');
const viewPaste = document.getElementById('view-paste');
const pasteInput = document.getElementById('paste-input');
const parseBtn = document.getElementById('parse-btn');

// Stat Elements
const statTotal = document.getElementById('stat-total');
const statSent = document.getElementById('stat-sent');
const statFailed = document.getElementById('stat-failed');
const statRemaining = document.getElementById('stat-remaining');
const statCurrent = document.getElementById('stat-current');
const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');
const userDisplayName = document.getElementById('user-display-name');

if (userDisplayName && currentName) {
  userDisplayName.innerText = currentName;
}

// Tabs Logic
if (tabUpload && tabPaste) {
  tabUpload.addEventListener('click', () => {
    tabUpload.style.background = 'rgba(16, 185, 129, 0.1)';
    tabUpload.style.color = '#10b981';
    tabPaste.style.background = 'transparent';
    tabPaste.style.color = '#9ca3af';
    viewUpload.style.display = 'block';
    viewPaste.style.display = 'none';
  });

  tabPaste.addEventListener('click', () => {
    tabPaste.style.background = 'rgba(16, 185, 129, 0.1)';
    tabPaste.style.color = '#10b981';
    tabUpload.style.background = 'transparent';
    tabUpload.style.color = '#9ca3af';
    viewPaste.style.display = 'flex';
    viewUpload.style.display = 'none';
  });
}

// Render Templates
const renderTemplates = () => {
  templatesContainer.innerHTML = '';
  templates.forEach((tpl, i) => {
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '10px';
    
    const textarea = document.createElement('textarea');
    textarea.value = tpl;
    textarea.style.cssText = 'flex: 1; background: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 15px; color: #e2e8f0; resize: none; height: 80px; font-family: inherit; box-sizing: border-box;';
    textarea.addEventListener('input', (e) => {
      templates[i] = e.target.value;
      localStorage.setItem('wa_templates', JSON.stringify(templates));
    });

    const delBtn = document.createElement('button');
    delBtn.style.cssText = 'background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; width: 50px; display: flex; align-items: center; justify-content: center; color: #ef4444; cursor: pointer;';
    delBtn.innerHTML = '<i data-lucide="trash-2"></i>';
    delBtn.addEventListener('click', () => {
      templates.splice(i, 1);
      localStorage.setItem('wa_templates', JSON.stringify(templates));
      renderTemplates();
    });

    div.appendChild(textarea);
    div.appendChild(delBtn);
    templatesContainer.appendChild(div);
  });
  lucide.createIcons();
};

addTemplateBtn.addEventListener('click', () => {
  templates.push('');
  localStorage.setItem('wa_templates', JSON.stringify(templates));
  renderTemplates();
});

// File Upload
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    const bstr = evt.target.result;
    const wb = XLSX.read(bstr, { type: 'binary' });
    const wsname = wb.SheetNames[0];
    const ws = wb.Sheets[wsname];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
    
    const extractedNumbers = [];
    data.forEach(row => {
      row.forEach(cell => {
        if (cell) {
          let strCell = String(cell).replace(/\D/g, '');
          if (strCell.length === 10) {
            strCell = '91' + strCell;
          }
          if (strCell.length >= 10) extractedNumbers.push(strCell);
        }
      });
    });

    numbers = extractedNumbers;
    statTotal.innerText = numbers.length;
    statRemaining.innerText = numbers.length;
    uploadStatus.innerHTML = `<span style="color: #fff; font-weight: bold;">${file.name}</span>`;
    
    const uploadSuccessBox = document.getElementById('upload-success-box');
    const successCount = document.getElementById('success-count');
    const successPreview = document.getElementById('success-preview');
    
    if (uploadSuccessBox) {
      uploadSuccessBox.style.display = 'block';
      successCount.innerText = `${numbers.length} numbers loaded`;
      
      let previewStr = '';
      const maxPreview = 4;
      const previewNums = numbers.slice(0, maxPreview);
      previewStr = previewNums.map(n => `+${n}`).join(', ');
      if (numbers.length > maxPreview) {
        previewStr += ` ... and ${numbers.length - maxPreview} more`;
      }
      successPreview.innerText = previewStr;
      lucide.createIcons();
    }
    
    appendLog('info', `Extracted ${numbers.length} numbers from ${file.name}.`);
  };
  reader.readAsBinaryString(file);
});

// Parse Pasted Text
if (parseBtn) {
  parseBtn.addEventListener('click', () => {
    const text = pasteInput.value;
    // Split by comma or newline, so spaces within numbers (e.g. +91 98765) don't split the number
    const entries = text.split(/[,\n]+/);
    const extractedNumbers = [];
    
    entries.forEach(entry => {
      let clean = entry.replace(/\D/g, '');
      if (clean.length === 10) {
        clean = '91' + clean;
      }
      if (clean.length >= 10 && clean.length <= 15) {
        extractedNumbers.push(clean);
      }
    });

    numbers = extractedNumbers;
    statTotal.innerText = numbers.length;
    statRemaining.innerText = numbers.length;
    uploadStatus.innerHTML = `<span style="color: #fff; font-weight: bold;">[Pasted Text]</span>`;
    
    const uploadSuccessBox = document.getElementById('upload-success-box');
    const successCount = document.getElementById('success-count');
    const successPreview = document.getElementById('success-preview');
    
    if (uploadSuccessBox) {
      uploadSuccessBox.style.display = 'block';
      successCount.innerText = `${numbers.length} numbers loaded`;
      
      let previewStr = '';
      const maxPreview = 4;
      const previewNums = numbers.slice(0, maxPreview);
      previewStr = previewNums.map(n => `+${n}`).join(', ');
      if (numbers.length > maxPreview) {
        previewStr += ` ... and ${numbers.length - maxPreview} more`;
      }
      successPreview.innerText = previewStr;
      lucide.createIcons();
    }
    
    appendLog('info', `Extracted ${numbers.length} numbers from pasted text.`);
    
    // Switch to upload view to show the success message
    tabUpload.click();
  });
}

// Append Log
const appendLog = (type, msg, exactTime) => {
  const time = exactTime || new Date().toLocaleTimeString();
  const div = document.createElement('div');
  div.style.marginBottom = '8px';
  
  if (type === 'error') div.style.color = '#ef4444';
  else if (type === 'wait') div.style.color = '#f59e0b';
  else if (type === 'success') div.style.color = '#10b981';
  else div.style.color = '#e2e8f0';

  div.innerHTML = `<span style="color: #64748b;">[${time}]</span> ${msg}`;
  activityLog.appendChild(div);
  activityLog.scrollTop = activityLog.scrollHeight;
};

const setButtonToStart = () => {
  isRunning = false;
  startBtn.style.background = '#10b981';
  startBtn.style.border = 'none';
  startBtn.style.color = '#000';
  startBtn.style.cursor = 'pointer';
  startBtn.style.boxShadow = '0 4px 14px rgba(16, 185, 129, 0.4)';
  startIcon.setAttribute('data-lucide', 'play');
  startText.innerText = 'Start New Campaign';
  lucide.createIcons();
};

const setButtonToStop = () => {
  isRunning = true;
  startBtn.style.background = 'rgba(239, 68, 68, 0.2)';
  startBtn.style.border = '1px solid #ef4444';
  startBtn.style.color = '#ef4444';
  startBtn.style.cursor = 'pointer';
  startBtn.style.boxShadow = '0 4px 14px rgba(239, 68, 68, 0.2)';
  startIcon.setAttribute('data-lucide', 'square');
  startText.innerText = 'Stop Campaign';
  lucide.createIcons();
};

// Start / Stop Campaign
startBtn.addEventListener('click', () => {
  if (isRunning) {
    socket.emit('stop-campaign');
    setButtonToStart();
    appendLog('wait', '🛑 Campaign stopped manually.');
    return;
  }
  
  if (numbers.length === 0) {
    alert("Please upload or paste numbers first!");
    return;
  }
  const validTemplates = templates.filter(t => t.trim() !== '');
  if (validTemplates.length === 0) {
    alert("Please add at least one message template!");
    return;
  }

  setButtonToStop();
  
  socket.emit('start-campaign', {
    numbers,
    templates: validTemplates,
    minDelay: Number(minDelayInput.value),
    maxDelay: Number(maxDelayInput.value)
  });
});

// Disconnect WA
if (disconnectWaBtn) {
  disconnectWaBtn.addEventListener('click', () => {
    socket.emit('logout-wa', { userId: currentUser });
    disconnectWaBtn.innerHTML = 'Disconnecting...';
    localStorage.removeItem('wa_user');
    localStorage.removeItem('wa_name');
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  });
}

// Socket Events
socket.on('sync-state', (state) => {
  if (state.numbers && state.numbers.length > 0) {
    numbers = state.numbers;
    templates = state.templates;
    if (state.minDelay) minDelayInput.value = state.minDelay;
    if (state.maxDelay) maxDelayInput.value = state.maxDelay;

    statTotal.innerText = numbers.length;
    uploadStatus.innerHTML = `<span style="color: #fff; font-weight: bold;">[Restored Session]</span> <br/> <span style="color:#10b981;">✅ ${numbers.length} numbers loaded</span>`;
    renderTemplates();

    if (state.isRunning) {
      setButtonToStop();
    } else {
      setButtonToStart();
    }

    activityLog.innerHTML = '';
    if (state.logs) {
      state.logs.forEach(log => {
        appendLog(log.type, log.msg, log.time);
      });
    }

    // Render current stats
    if (state.stats) {
      const data = state.stats;
      statTotal.innerText = data.total;
      statSent.innerText = data.sent;
      statFailed.innerText = data.failed;
      statRemaining.innerText = data.remaining;
      statCurrent.innerText = data.currentNum > 0 ? `#${data.currentNum}` : '-';
      progressText.innerText = `${data.sent + data.failed}/${data.total}`;
      const pct = data.total === 0 ? 0 : ((data.sent + data.failed) / data.total) * 100;
      progressBar.style.width = `${pct}%`;
    }
  }
});

socket.on('log', (data) => {
  appendLog(data.type, data.msg, data.time);
});

socket.on('stat-update', (data) => {
  statTotal.innerText = data.total;
  statSent.innerText = data.sent;
  statFailed.innerText = data.failed;
  statRemaining.innerText = data.remaining;
  statCurrent.innerText = data.currentNum > 0 ? `#${data.currentNum}` : '-';
  
  progressText.innerText = `${data.sent + data.failed}/${data.total}`;
  const pct = data.total === 0 ? 0 : ((data.sent + data.failed) / data.total) * 100;
  progressBar.style.width = `${pct}%`;
});

socket.on('campaign-finished', () => {
  setButtonToStart();
});

// Init
renderTemplates();
