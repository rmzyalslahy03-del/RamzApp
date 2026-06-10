const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// التأكد من وجود المجلدات
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// قاعدة البيانات
const dbPath = path.join(__dirname, 'ramz.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// إنشاء الجداول إذا لم توجد
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    avatar TEXT DEFAULT '',
    online INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pending_messages (
    id TEXT PRIMARY KEY,
    chatId TEXT NOT NULL,
    senderId TEXT NOT NULL,
    senderName TEXT NOT NULL,
    text TEXT,
    mediaUrl TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    delivered INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_pending_chat ON pending_messages(chatId, timestamp);
  CREATE INDEX IF NOT EXISTS idx_pending_delivered ON pending_messages(delivered, timestamp);
`);

console.log('✅ قاعدة البيانات جاهزة');

// Express و Socket.IO
const app = express();
const server = http.createServer(app);

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5500',
  'https://ramz-app-xi.vercel.app'
];

const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ['GET', 'POST'] }
});

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// رفع الملفات
const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.random().toString(36).substr(2, 9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use('/uploads', express.static(uploadsDir));

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لا يوجد ملف' });
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl });
});

app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, username, avatar, online FROM users').all();
  res.json(users);
});

// Socket.IO
io.on('connection', (socket) => {
  let currentUser = null;

  socket.on('login', ({ username }, callback) => {
    if (!username || !username.trim()) return callback({ error: 'اسم المستخدم مطلوب' });

    let user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
      user = {
        id: uuidv4(),
        username: username.trim(),
        avatar: username.trim().charAt(0).toUpperCase(),
        online: 0
      };
      db.prepare('INSERT INTO users (id, username, avatar, online) VALUES (?, ?, ?, ?)')
        .run(user.id, user.username, user.avatar, user.online);
    }
    db.prepare('UPDATE users SET online = 1 WHERE id = ?').run(user.id);
    currentUser = user;
    callback({ user });
    io.emit('users:online', getOnlineUserIds());
  });

  function getOnlineUserIds() {
    return db.prepare('SELECT id FROM users WHERE online = 1').all().map(r => r.id);
  }

  socket.on('chat:join', ({ chatId, userId }) => {
    if (!chatId || !userId) return;
    socket.join(chatId);
    const pendingMessages = db.prepare(
      'SELECT * FROM pending_messages WHERE chatId = ? AND delivered = 0 AND senderId != ? ORDER BY timestamp ASC'
    ).all(chatId, userId);
    if (pendingMessages.length) {
      socket.emit('chat:history', pendingMessages);
      const ids = pendingMessages.map(m => m.id);
      db.prepare(`UPDATE pending_messages SET delivered = 1 WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      db.prepare(`DELETE FROM pending_messages WHERE delivered = 1`).run();
    } else {
      socket.emit('chat:history', []);
    }
  });

  socket.on('message:send', (data, callback) => {
    if (!currentUser) return callback?.({ error: 'غير مصرح' });
    const message = {
      id: uuidv4(),
      chatId: data.chatId,
      senderId: currentUser.id,
      senderName: currentUser.username,
      text: data.text || '',
      mediaUrl: data.mediaUrl || null,
      timestamp: new Date().toISOString(),
      delivered: 0
    };
    db.prepare(`INSERT INTO pending_messages (id, chatId, senderId, senderName, text, mediaUrl, timestamp, delivered) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(message.id, message.chatId, message.senderId, message.senderName, message.text, message.mediaUrl, message.timestamp, 0);
    io.to(data.chatId).emit('message:receive', message);
    callback?.({ success: true });
  });

  socket.on('typing:start', ({ chatId }) => {
    if (currentUser) socket.to(chatId).emit('typing:update', { chatId, username: currentUser.username, typing: true });
  });
  socket.on('typing:stop', ({ chatId }) => {
    if (currentUser) socket.to(chatId).emit('typing:update', { chatId, typing: false });
  });

  socket.on('disconnect', () => {
    if (currentUser) {
      db.prepare('UPDATE users SET online = 0 WHERE id = ?').run(currentUser.id);
      io.emit('users:online', getOnlineUserIds());
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
