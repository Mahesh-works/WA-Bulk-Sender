const { Client, LocalAuth } = require('whatsapp-web.js');

console.log('Testing WA Init...');
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'test_user', dataPath: './.wwebjs_auth_test' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('QR Received!');
  process.exit(0);
});

client.on('ready', () => {
  console.log('Client is ready!');
  process.exit(0);
});

client.initialize().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
