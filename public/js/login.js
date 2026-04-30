const socket = io();

// DOM Elements
const authFormView = document.getElementById('auth-form-view');
const qrView = document.getElementById('qr-view');
const authToggle = document.getElementById('toggle-auth-btn');
const loginForm = document.getElementById('login-form');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authBtnText = document.getElementById('auth-btn-text');
const nameGroup = document.getElementById('name-field-container');

const qrImage = document.getElementById('qr-image');
const qrLoader = document.getElementById('qr-loader');
const qrStatus = document.getElementById('qr-status');

// Form state
let isLoginMode = true;
let currentUserId = null;

// Ensure local storage is clear on load to prevent stale states
localStorage.removeItem('wa_user');
localStorage.removeItem('wa_name');

// Reveal Animation
setTimeout(() => {
  const container = document.getElementById('login-container');
  if (container) {
    container.style.opacity = '1';
    container.style.transform = 'rotateX(0) translateY(0)';
  }
}, 100);

authToggle.addEventListener('click', (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  
  if (isLoginMode) {
    nameGroup.style.display = 'none';
    const nameInput = document.getElementById('name-input');
    if (nameInput) nameInput.required = false;
    authBtnText.innerText = 'Login to Node';
    authToggle.innerHTML = `Don't have an account? <span style="color: #00ff88; text-decoration: underline;">Create Account</span>`;
  } else {
    nameGroup.style.display = 'block';
    const nameInput = document.getElementById('name-input');
    if (nameInput) nameInput.required = true;
    authBtnText.innerText = 'Create Account';
    authToggle.innerHTML = `Already have an account? <span style="color: #00ff88; text-decoration: underline;">Login to Node</span>`;
  }
});

// Submit Handler
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  authBtnText.innerText = isLoginMode ? 'Authenticating...' : 'Registering...';
  authSubmitBtn.disabled = true;
  authSubmitBtn.style.opacity = '0.7';

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const nameInput = document.getElementById('name-input');
  const name = nameInput ? nameInput.value : '';

  const endpoint = isLoginMode ? '/api/login' : '/api/register';
  const body = isLoginMode ? { username, password } : { name, username, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    
    if (!res.ok) {
      alert(data.error || 'Authentication failed');
      authBtnText.innerText = isLoginMode ? 'Login to Node' : 'Create Account';
      authSubmitBtn.disabled = false;
      authSubmitBtn.style.opacity = '1';
      return;
    }

    // Success! Save to local storage
    localStorage.setItem('wa_user', data.username);
    localStorage.setItem('wa_name', data.name || data.username);
    currentUserId = data.username;

    // Show QR loader and init WA specific to this user
    authFormView.style.display = 'none';
    qrView.style.display = 'block';
    qrLoader.style.display = 'flex';
    qrImage.style.display = 'none';
    qrStatus.innerText = 'Booting up WhatsApp Session...';

    socket.emit('init-wa', { userId: data.username });

  } catch (err) {
    console.error(err);
    alert('Failed to connect to server');
    authBtnText.innerText = isLoginMode ? 'Login to Node' : 'Create Account';
    authSubmitBtn.disabled = false;
    authSubmitBtn.style.opacity = '1';
  }
});

socket.on('qr', (qrData) => {
  if (currentUserId) {
    qrLoader.style.display = 'none';
    qrImage.src = qrData;
    qrImage.style.display = 'block';
    qrStatus.innerText = 'Scan QR to authenticate...';
  }
});

socket.on('ready', () => {
  if (currentUserId) {
    qrStatus.innerText = 'Authentication successful!';
    qrStatus.style.color = '#00ff88';
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 1000);
  }
});
