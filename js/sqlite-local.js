// ================================================================
// sqlite-local.js – قاعدة بيانات SQLite محلية (SQL.js + OPFS)
// RamzApp – تخزين دائم للمستخدمين، الرسائل، جهات الاتصال، الإعدادات
// ================================================================

let SQL = null;
let db = null;
const DB_FILENAME = '/ramz-messages.db';

// ========== تحميل SQL.js من CDN ==========
async function loadSqlJs() {
    if (SQL) return SQL;
    const module = await import('https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js');
    SQL = await module.default({
        locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });
    return SQL;
}

// ========== فتح/إنشاء قاعدة البيانات في OPFS ==========
async function openDatabase() {
    await loadSqlJs();

    let fileHandle;
    try {
        const root = await navigator.storage.getDirectory();
        fileHandle = await root.getFileHandle(DB_FILENAME, { create: true });
    } catch (e) {
        console.warn('⚠️ OPFS غير متاح – قاعدة البيانات ستعمل في الذاكرة فقط (بدون حفظ)');
        db = new SQL.Database();
        initTables();
        return;
    }

    const file = await fileHandle.getFile();
    const arrayBuffer = await file.arrayBuffer();

    if (arrayBuffer.byteLength > 0) {
        db = new SQL.Database(new Uint8Array(arrayBuffer));
    } else {
        db = new SQL.Database();
    }

    // حفظ تلقائي بعد كل عملية كتابة
    const originalRun = db.run.bind(db);
    db.run = function (sql, params) {
        const result = originalRun(sql, params);
        saveToOPFS(fileHandle);
        return result;
    };

    initTables();
}

// ========== حفظ قاعدة البيانات إلى OPFS ==========
async function saveToOPFS(fileHandle) {
    if (!fileHandle) return;
    try {
        const data = db.export();
        const writable = await fileHandle.createWritable();
        await writable.write(data.buffer);
        await writable.close();
    } catch (e) {
        console.warn('⚠️ فشل حفظ قاعدة البيانات إلى OPFS:', e);
    }
}

// ========== إنشاء جميع الجداول إن لم تكن موجودة ==========
function initTables() {
    db.run(`
        CREATE TABLE IF NOT EXISTS user (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            avatar TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            supabaseId TEXT DEFAULT '',
            isGuest INTEGER DEFAULT 0
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            chatId TEXT NOT NULL,
            senderId TEXT NOT NULL,
            senderName TEXT DEFAULT '',
            text TEXT DEFAULT '',
            mediaUrl TEXT DEFAULT '',
            voiceUrl TEXT DEFAULT '',
            voiceDuration TEXT DEFAULT '',
            replyTo TEXT DEFAULT '',
            timestamp TEXT DEFAULT (datetime('now')),
            status TEXT DEFAULT 'sent'
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
            phone TEXT PRIMARY KEY,
            name TEXT DEFAULT '',
            registered INTEGER DEFAULT 0,
            supabaseId TEXT DEFAULT ''
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )
    `);

    // فهارس لتحسين الأداء
    db.run('CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chatId, timestamp)');
    db.run('CREATE INDEX IF NOT EXISTS idx_contacts_registered ON contacts(registered)');
}

// ================================================================
// دوال المستخدم
// ================================================================

async function saveUser(user) {
    await openDatabase();
    db.run(
        'INSERT OR REPLACE INTO user (id, name, avatar, phone, supabaseId, isGuest) VALUES (?, ?, ?, ?, ?, ?)',
        [user.id, user.name, user.avatar || '', user.phone || '', user.supabaseId || '', user.isGuest ? 1 : 0]
    );
}

async function getUser() {
    await openDatabase();
    const result = db.exec('SELECT * FROM user LIMIT 1');
    if (!result.length || !result[0].values.length) return null;
    const row = result[0].values[0];
    return {
        id: row[0],
        name: row[1],
        avatar: row[2],
        phone: row[3],
        supabaseId: row[4],
        isGuest: row[5] === 1
    };
}

async function deleteUser() {
    await openDatabase();
    db.run('DELETE FROM user');
}

// ================================================================
// دوال الرسائل
// ================================================================

async function saveMessage(msg) {
    await openDatabase();
    db.run(
        `INSERT OR REPLACE INTO messages 
         (id, chatId, senderId, senderName, text, mediaUrl, voiceUrl, voiceDuration, replyTo, timestamp, status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            msg.id,
            msg.chatId,
            msg.senderId,
            msg.senderName || '',
            msg.text || '',
            msg.mediaUrl || '',
            msg.voiceUrl || '',
            msg.voiceDuration || '',
            msg.replyTo || '',
            msg.timestamp || new Date().toISOString(),
            msg.status || 'sent'
        ]
    );
}

async function getMessages(chatId) {
    await openDatabase();
    const result = db.exec(
        'SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp ASC',
        [chatId]
    );
    if (!result.length) return [];
    return result[0].values.map(row => ({
        id: row[0],
        chatId: row[1],
        senderId: row[2],
        senderName: row[3],
        text: row[4],
        mediaUrl: row[5],
        voiceUrl: row[6],
        voiceDuration: row[7],
        replyTo: row[8],
        timestamp: row[9],
        status: row[10]
    }));
}

async function deleteMessages(chatId) {
    await openDatabase();
    db.run('DELETE FROM messages WHERE chatId = ?', [chatId]);
}

async function getAllChats() {
    await openDatabase();
    const result = db.exec(
        `SELECT chatId, 
                MAX(timestamp) as lastTime, 
                COUNT(*) as totalMessages,
                SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as unread
         FROM messages 
         GROUP BY chatId 
         ORDER BY lastTime DESC`
    );
    if (!result.length) return [];
    return result[0].values.map(row => ({
        chatId: row[0],
        lastTime: row[1],
        totalMessages: row[2],
        unread: row[3]
    }));
}

// ================================================================
// دوال جهات الاتصال
// ================================================================

async function addContact(phone, name) {
    await openDatabase();
    db.run(
        'INSERT OR REPLACE INTO contacts (phone, name, registered, supabaseId) VALUES (?, ?, ?, ?)',
        [phone, name || '', 0, '']
    );
}

async function updateContactRegistration(phone, registered, supabaseId) {
    await openDatabase();
    db.run(
        'UPDATE contacts SET registered = ?, supabaseId = ? WHERE phone = ?',
        [registered ? 1 : 0, supabaseId || '', phone]
    );
}

async function getAllContacts() {
    await openDatabase();
    const result = db.exec('SELECT * FROM contacts');
    if (!result.length || !result[0].values.length) return [];
    return result[0].values.map(row => ({
        phone: row[0],
        name: row[1],
        registered: row[2] === 1,
        supabaseId: row[3]
    }));
}

async function deleteContact(phone) {
    await openDatabase();
    db.run('DELETE FROM contacts WHERE phone = ?', [phone]);
}

// ================================================================
// دوال الإعدادات
// ================================================================

async function getSetting(key) {
    await openDatabase();
    const result = db.exec('SELECT value FROM settings WHERE key = ?', [key]);
    if (!result.length || !result[0].values.length) return null;
    return result[0].values[0][0];
}

async function setSetting(key, value) {
    await openDatabase();
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

async function deleteSetting(key) {
    await openDatabase();
    db.run('DELETE FROM settings WHERE key = ?', [key]);
}

// ================================================================
// دوال إضافية (إدارة شاملة)
// ================================================================

// حذف جميع البيانات (لإزالة الحساب)
async function deleteAllData() {
    await openDatabase();
    db.run('DELETE FROM messages');
    db.run('DELETE FROM contacts');
    db.run('DELETE FROM settings');
    db.run('DELETE FROM user');
}

// تصدير قاعدة البيانات كملف .sqlite
async function exportDatabase() {
    await openDatabase();
    const data = db.export();
    const blob = new Blob([data.buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ramzapp_backup_${new Date().toISOString().slice(0, 10)}.sqlite`;
    a.click();
    URL.revokeObjectURL(url);
}

// استيراد قاعدة البيانات من ملف .sqlite
async function importDatabase(file) {
    const buffer = await file.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buffer));
    // حفظ في OPFS
    try {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(DB_FILENAME, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(buffer);
        await writable.close();
    } catch (e) {
        console.warn('⚠️ فشل حفظ قاعدة البيانات المستوردة إلى OPFS');
    }
    initTables();
}

// ================================================================
// تصدير الدوال للاستخدام العام
// ================================================================
window.RamzDB = {
    // إدارة قاعدة البيانات
    openDatabase,
    exportDatabase,
    importDatabase,
    deleteAllData,

    // المستخدم
    saveUser,
    getUser,
    deleteUser,

    // الرسائل
    saveMessage,
    getMessages,
    deleteMessages,
    getAllChats,

    // جهات الاتصال
    addContact,
    updateContactRegistration,
    getAllContacts,
    deleteContact,

    // الإعدادات
    getSetting,
    setSetting,
    deleteSetting
};
