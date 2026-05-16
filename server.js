require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Client, LocalAuth } = require('whatsapp-web.js');
const cors = require('cors');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const User = require('./models/User');
const History = require('./models/History');
const Message = require('./models/Message');

// Prevent Node from crashing on unhandled Puppeteer errors
process.on('uncaughtException', (err) => {
  console.error('Caught exception: ', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

const app = express();
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

let client = null;
let isClientReady = false;
let currentQR = null;
let activeUserId = null;

let activeCampaign = {
  isRunning: false,
  numbers: [],
  templates: [],
  minDelay: 1,
  maxDelay: 3,
  stats: { total: 0, sent: 0, failed: 0, remaining: 0, currentNum: 0 },
  logs: []
};

// --- USER MANAGEMENT ---
function getSanitizedUserId(userId) {
  return userId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

app.post('/api/register', async (req, res) => {
  try {
    const { name, username, password } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    await User.create({ name, username, password });
    res.json({ success: true, username, name });
  } catch (err) {
    res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    res.json({ success: true, username: user.username, name: user.name });
  } catch (err) {
    res.status(500).json({ error: 'Server error during login' });
  }
});

// --- WHATSAPP CLIENT ---
function initializeWhatsAppClient(userId, socket) {
  console.log(`Initializing WA for user: ${userId}`);
  
  if (client) {
    if (activeUserId === userId) {
      if (isClientReady) socket.emit('ready');
      else if (currentQR) socket.emit('qr', currentQR);
      return;
    } else {
      console.log(`Destroying previous client for ${activeUserId}...`);
      client.destroy();
    }
  }

  activeUserId = userId;
  isClientReady = false;
  currentQR = null;

  const sanitizedUserId = getSanitizedUserId(userId);

  client = new Client({
    authStrategy: new LocalAuth({ clientId: sanitizedUserId, dataPath: './.wwebjs_session' }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    }
  });

  client.on('qr', async (qr) => {
    console.log(`QR RECEIVED FOR ${userId}`);
    try {
      currentQR = await qrcode.toDataURL(qr);
      io.emit('qr', currentQR);
    } catch (err) {
      console.error('Error generating QR code data URL', err);
    }
  });

  client.on('ready', () => {
    console.log(`WhatsApp Client is ready for ${userId}!`);
    isClientReady = true;
    currentQR = null;
    io.emit('ready');
  });

  client.on('disconnected', (reason) => {
    console.log(`Client ${userId} was logged out`, reason);
    isClientReady = false;
    currentQR = null;
    io.emit('disconnected', reason);
  });

  client.initialize().catch(err => {
    console.error('Client Init Error:', err);
  });
}

function broadcastLog(type, msg) {
  const logEntry = { type, msg, time: new Date().toLocaleTimeString() };
  if (activeCampaign.isRunning) {
    activeCampaign.logs.push(logEntry);
  }
  io.emit('log', logEntry);
}

function broadcastStats(stats) {
  if (activeCampaign.isRunning) {
    activeCampaign.stats = stats;
  }
  io.emit('stat-update', stats);
}

async function saveHistory(campaignData) {
  try {
    await History.create(campaignData);
  } catch (err) {
    console.error('Failed to save history', err);
  }
}

async function saveMessageLog(logData) {
  try {
    await Message.create(logData);
  } catch (err) {
    console.error('Failed to save message log', err);
  }
}

io.on('connection', (socket) => {
  console.log('A client connected');
  
  socket.on('init-wa', (data) => {
    if (!data.userId) return;
    initializeWhatsAppClient(data.userId, socket);
  });

  // If a campaign exists, immediately sync the client (even if stopped)
  if (activeCampaign && activeCampaign.numbers && activeCampaign.numbers.length > 0) {
    socket.emit('sync-state', activeCampaign);
  }

  socket.on('start-campaign', async (data) => {
    if (activeCampaign.isRunning) {
      socket.emit('log', { type: 'error', msg: 'A campaign is already running!' });
      return;
    }

    const { numbers, templates, minDelay, maxDelay } = data;
    
    if (!isClientReady || !client) {
      socket.emit('log', { type: 'error', msg: 'WhatsApp client is not ready. Please authenticate first.' });
      return;
    }

    if (!numbers || numbers.length === 0 || !templates || templates.length === 0) {
      socket.emit('log', { type: 'error', msg: 'Missing numbers or templates.' });
      return;
    }

    // Initialize state
    activeCampaign = {
      isRunning: true,
      numbers,
      templates,
      minDelay,
      maxDelay,
      stats: { total: numbers.length, sent: 0, failed: 0, remaining: numbers.length, currentNum: 0 },
      logs: []
    };
    
    broadcastLog('info', `Starting campaign for ${numbers.length} numbers.`);
    io.emit('sync-state', activeCampaign);

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < numbers.length; i++) {
      if (!activeCampaign.isRunning) break; // manual stop

      const number = numbers[i];
      const template = templates[Math.floor(Math.random() * templates.length)];
      let messageFailed = false;
      
      try {
        const cleanNumber = number.replace(/\D/g, '');
        const chatId = `${cleanNumber}@c.us`;
        
        await client.sendMessage(chatId, template);
        sentCount++;
        broadcastLog('success', `[${i+1}/${numbers.length}] Sent -> +${cleanNumber}`);
        
        saveMessageLog({
            user: activeUserId,
            phone: `+${cleanNumber}`,
            message: template,
            status: 'Sent',
            date: new Date().toISOString()
        });
      } catch (err) {
        console.error('Failed to send message to ' + number, err);
        failedCount++;
        broadcastLog('error', `[${i+1}/${numbers.length}] Failed -> ${number}`);
        messageFailed = true;
        
        saveMessageLog({
            user: activeUserId,
            phone: number,
            message: template,
            status: 'Failed',
            date: new Date().toISOString()
        });
      }

      broadcastStats({
        total: numbers.length,
        sent: sentCount,
        failed: failedCount,
        remaining: numbers.length - (sentCount + failedCount),
        currentNum: i + 1
      });

      if (i < numbers.length - 1) {
        if (messageFailed) {
          broadcastLog('wait', `⏭️ Skipping delay because previous message failed...`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1s safety delay
        } else {
          // Calculate random delay between min and max (inclusive)
          const currentDelayMinutes = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
          const delayMs = currentDelayMinutes * 60 * 1000;
          broadcastLog('wait', `⏳ Waiting ${currentDelayMinutes} minutes before next message...`);
          await new Promise(resolve => setTimeout(resolve, Math.max(delayMs, 1000))); 
        }
      }
    }

    broadcastLog('success', `✅ Campaign completed! 🟢 ${sentCount} 🔴 ${failedCount}`);
    io.emit('campaign-finished');
    
    // Save to history
    saveHistory({
      date: new Date().toISOString(),
      user: activeUserId,
      total: numbers.length,
      sent: sentCount,
      failed: failedCount,
      delayMinutes: `${minDelay}-${maxDelay}`
    });

    activeCampaign.isRunning = false;
  });

  socket.on('stop-campaign', () => {
    if (activeCampaign.isRunning) {
      activeCampaign.isRunning = false;
      broadcastLog('wait', '🛑 Campaign stopped manually by user.');
    }
  });

  socket.on('logout-wa', async (data) => {
    console.log('Frontend requested WA logout for user:', data.userId);
    try {
      if (client && activeUserId === data.userId) {
        await client.destroy();
        isClientReady = false;
        currentQR = null;
        
        setTimeout(() => {
          try {
            // Delete specific user's session folder
            const sanitizedUserId = getSanitizedUserId(data.userId);
            fs.rmSync(`./.wwebjs_session/session-${sanitizedUserId}`, { recursive: true, force: true });
            console.log(`Cleared previous session data for ${data.userId}.`);
          } catch (e) {
            console.error('Failed to delete session folder, retrying in 2s...', e);
            setTimeout(() => {
              try { 
                const sanitizedUserId = getSanitizedUserId(data.userId);
                fs.rmSync(`./.wwebjs_session/session-${sanitizedUserId}`, { recursive: true, force: true }); 
              } 
              catch(e2) { console.error('Still failed.', e2); }
            }, 2000);
          }
        }, 1500);
      }
    } catch (err) {
      console.error('Error during client destruction', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/history', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

app.get('/api/history', async (req, res) => {
  try {
    const history = await History.find().sort({ date: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.get('/api/messages', async (req, res) => {
  try {
    const messages = await Message.find().sort({ date: -1 });
    // Transform _id to id for frontend compatibility
    const formattedMessages = messages.map(msg => {
      const obj = msg.toObject();
      obj.id = obj._id;
      delete obj._id;
      return obj;
    });
    res.json(formattedMessages);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.delete('/api/messages/:id', async (req, res) => {
  try {
    await Message.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Backend and Frontend running on http://localhost:${PORT}`);
});
