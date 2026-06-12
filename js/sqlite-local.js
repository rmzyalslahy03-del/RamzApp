// ================================================================
// sqlite-local.js – قاعدة بيانات محلية متقدمة (SQLite مع OPFS أو IndexedDB)
// RamzApp – تخزين دائم موحد لجميع البيانات (بدون localStorage)
// ================================================================

let SQL = null;
let db = null;
let usingIndexedDB = false;
let indexedDBReady = false;
let opfsAvailable = false;

const DB_FILENAME = '/ramz-messages.db';
const IDB_NAME = 'RamzAppDB';
const IDB_STORE = 'ramz_data';

// ========== التحقق من دعم OPFS ==========
async function checkOPFSSupport() {
    try {
        const root = await navigator.storage.getDirectory();
        opfsAvailable = true;
        return true;
    } catch (e) {
        console.warn('⚠️ OPFS غير مدعوم، سيتم استخدام IndexedDB');
        opfsAvailable = false;
        return false;
    }
}

// ========== تحميل SQL.js مع fallback متعدد ==========
async function loadSqlJsWithRetry() {
    const cdnList = [
        {
            name: 'jsdelivr',
            url: 'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.js',
            locate: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/${file}`
        },
        {
            name: 'unpkg',
            url: 'https://unpkg.com/sql.js@1.8.0/dist/sql-wasm.js',
            locate: (file) => `https://unpkg.com/sql.js@1.8.0/dist/${file}`
        },
        {
            name: 'cdnjs',
            url: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js',
            locate: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        }
    ];

    for (const cdn of cdnList) {
        try {
            console.log(`محاولة تحميل sql.js من ${cdn.name}...`);
            const module = await import(cdn.url);
            const sqlModule = await module.default({
                locateFile: cdn.locate
            });
            console.log(`✅ تم تحميل sql.js بنجاح من ${cdn.name}`);
            return sqlModule;
        } catch (err) {
            console.warn(`فشل التحميل من ${cdn.name}:`, err.message);
        }
    }
    throw new Error('تعذر تحميل sql.js من جميع CDNs');
}

// ========== فتح SQLite على OPFS ==========
async function initSQLiteOnOPFS() {
    if (!SQL) {
        SQL = await loadSqlJsWithRetry();
    }

    let fileHandle;
    try {
        const root = await navigator.storage.getDirectory();
        fileHandle = await root.getFileHandle(DB_FILENAME, { create: true });
    } catch (e) {
        console.warn('⚠️ OPFS غير متاح، التحول إلى IndexedDB');
        return false;
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
        saveSQLiteToOPFS(fileHandle).catch(console.warn);
        return result;
    };
    const originalExec = db.exec.bind(db);
    db.exec = function (sql, params) {
        const result = originalExec(sql, params);
        if (sql.trim().toUpperCase().startsWith('INSERT') ||
            sql.trim().toUpperCase().startsWith('UPDATE') ||
            sql.trim().toUpperCase().startsWith('DELETE') ||
            sql.trim().toUpperCase().startsWith('CREATE') ||
            sql.trim().toUpperCase().startsWith('DROP')) {
            saveSQLiteToOPFS(fileHandle).catch(console.warn);
        }
        return result;
    };

    initTablesSQLite();
    return true;
}

async function saveSQLiteToOPFS(fileHandle) {
    if (!fileHandle || !db) return;
    try {
        const data = db.export();
        const writable = await fileHandle.createWritable();
        await writable.write(data.buffer);
        await writable.close();
    } catch (e) {
        console.warn('⚠️ فشل حفظ SQLite إلى OPFS:', e);
    }
}

function initTablesSQLite() {
    // جدول المستخدم الحالي
    db.run(`
        CREATE TABLE IF NOT EXISTS user (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            avatar TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            email TEXT DEFAULT '',
            supabaseId TEXT DEFAULT '',
            isGuest INTEGER DEFAULT 0
        )
    `);
    // جدول الرسائل
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
    // جدول جهات الاتصال
    db.run(`
        CREATE TABLE IF NOT EXISTS contacts (
            phone TEXT PRIMARY KEY,
            name TEXT DEFAULT '',
            registered INTEGER DEFAULT 0,
            supabaseId TEXT DEFAULT ''
        )
    `);
    // جدول الإعدادات
    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT DEFAULT ''
        )
    `);
    // فهارس
    db.run('CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chatId, timestamp)');
    db.run('CREATE INDEX IF NOT EXISTS idx_contacts_registered ON contacts(registered)');
}

// ========== IndexedDB (البديل) ==========
async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, 2);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            indexedDBReady = true;
            resolve(request.result);
        };
        request.onupgradeneeded = (event) => {
            const idb = event.target.result;
            if (!idb.objectStoreNames.contains(IDB_STORE)) {
                const store = idb.createObjectStore(IDB_STORE, { keyPath: 'key' });
                store.createIndex('type', 'type', { unique: false });
            }
            // تحديث الإصدار 2: إضافة فهارس إضافية
            if (event.oldVersion < 2) {
                const store = event.target.transaction.objectStore(IDB_STORE);
                if (!store.indexNames.contains('type_key')) {
                    store.createIndex('type_key', ['type', 'key']);
                }
            }
        };
    });
}

async function getIDBData(key, type) {
    if (!indexedDBReady) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, 2);
        request.onsuccess = () => {
            const idb = request.result;
            const tx = idb.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const getReq = store.get(key);
            getReq.onsuccess = () => resolve(getReq.result ? getReq.result.value : null);
            getReq.onerror = () => reject(getReq.error);
            tx.oncomplete = () => idb.close();
        };
        request.onerror = () => reject(request.error);
    });
}

async function setIDBData(key, value, type) {
    if (!indexedDBReady) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, 2);
        request.onsuccess = () => {
            const idb = request.result;
            const tx = idb.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            const putReq = store.put({ key, value, type });
            putReq.onsuccess = () => resolve();
            putReq.onerror = () => reject(putReq.error);
            tx.oncomplete = () => idb.close();
        };
        request.onerror = () => reject(request.error);
    });
}

async function deleteIDBData(key) {
    if (!indexedDBReady) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, 2);
        request.onsuccess = () => {
            const idb = request.result;
            const tx = idb.transaction(IDB_STORE, 'readwrite');
            const store = tx.objectStore(IDB_STORE);
            const delReq = store.delete(key);
            delReq.onsuccess = () => resolve();
            delReq.onerror = () => reject(delReq.error);
            tx.oncomplete = () => idb.close();
        };
        request.onerror = () => reject(request.error);
    });
}

async function getAllIDBDataByType(type) {
    if (!indexedDBReady) await initIndexedDB();
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, 2);
        request.onsuccess = () => {
            const idb = request.result;
            const tx = idb.transaction(IDB_STORE, 'readonly');
            const store = tx.objectStore(IDB_STORE);
            const index = store.index('type');
            const items = [];
            const cursorReq = index.openCursor(IDBKeyRange.only(type));
            cursorReq.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    items.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(items);
                }
            };
            cursorReq.onerror = () => reject(cursorReq.error);
            tx.oncomplete = () => idb.close();
        };
        request.onerror = () => reject(request.error);
    });
}

// ========== الواجهة الموحدة ==========
async function openDatabase() {
    // التحقق من OPFS أولاً
    await checkOPFSSupport();
    if (opfsAvailable) {
        try {
            const success = await initSQLiteOnOPFS();
            if (success) {
                usingIndexedDB = false;
                console.log('✅ باستخدام SQLite على OPFS');
                return;
            }
        } catch (err) {
            console.warn('⚠️ فشل SQLite على OPFS، التحول إلى IndexedDB:', err);
        }
    }
    // البديل: IndexedDB
    usingIndexedDB = true;
    await initIndexedDB();
    console.log('✅ باستخدام IndexedDB (بديل آمن)');
}

// ========== دوال المستخدم ==========
async function saveUser(user) {
    if (!usingIndexedDB && db) {
        db.run(
            `INSERT OR REPLACE INTO user (id, name, avatar, phone, email, supabaseId, isGuest)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user.id, user.name, user.avatar || '', user.phone || '', user.email || '', user.supabaseId || '', user.isGuest ? 1 : 0]
        );
    } else {
        await setIDBData('user', user, 'user');
    }
}

async function getUser() {
    if (!usingIndexedDB && db) {
        const result = db.exec('SELECT * FROM user LIMIT 1');
        if (!result.length || !result[0].values.length) return null;
        const row = result[0].values[0];
        return {
            id: row[0],
            name: row[1],
            avatar: row[2],
            phone: row[3],
            email: row[4],
            supabaseId: row[5],
            isGuest: row[6] === 1
        };
    } else {
        return await getIDBData('user', 'user');
    }
}

async function deleteUser() {
    if (!usingIndexedDB && db) {
        db.run('DELETE FROM user');
    } else {
        await deleteIDBData('user');
    }
}

// ========== دوال الرسائل ==========
async function saveMessage(msg) {
    if (!usingIndexedDB && db) {
        db.run(
            `INSERT OR REPLACE INTO messages
             (id, chatId, senderId, senderName, text, mediaUrl, voiceUrl, voiceDuration, replyTo, timestamp, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                msg.id, msg.chatId, msg.senderId, msg.senderName || '', msg.text || '',
                msg.mediaUrl || '', msg.voiceUrl || '', msg.voiceDuration || '',
                msg.replyTo || '', msg.timestamp || new Date().toISOString(), msg.status || 'sent'
            ]
        );
    } else {
        let messages = await getIDBData(`messages_${msg.chatId}`, 'messages') || [];
        // تجنب التكرار
        const existingIndex = messages.findIndex(m => m.id === msg.id);
        if (existingIndex !== -1) {
            messages[existingIndex] = msg;
        } else {
            messages.push(msg);
        }
        await setIDBData(`messages_${msg.chatId}`, messages, 'messages');
    }
}

async function getMessages(chatId) {
    if (!usingIndexedDB && db) {
        const result = db.exec('SELECT * FROM messages WHERE chatId = ? ORDER BY timestamp ASC', [chatId]);
        if (!result.length) return [];
        return result[0].values.map(row => ({
            id: row[0], chatId: row[1], senderId: row[2], senderName: row[3],
            text: row[4], mediaUrl: row[5], voiceUrl: row[6], voiceDuration: row[7],
            replyTo: row[8], timestamp: row[9], status: row[10]
        }));
    } else {
        return await getIDBData(`messages_${chatId}`, 'messages') || [];
    }
}

async function deleteMessages(chatId) {
    if (!usingIndexedDB && db) {
        db.run('DELETE FROM messages WHERE chatId = ?', [chatId]);
    } else {
        await deleteIDBData(`messages_${chatId}`);
    }
}

async function getAllChats() {
    if (!usingIndexedDB && db) {
        const result = db.exec(
            `SELECT chatId, MAX(timestamp) as lastTime, COUNT(*) as totalMessages,
                    SUM(CASE WHEN status = 'sent' AND senderId != (SELECT id FROM user LIMIT 1) THEN 1 ELSE 0 END) as unread
             FROM messages GROUP BY chatId ORDER BY lastTime DESC`
        );
        if (!result.length) return [];
        return result[0].values.map(row => ({
            chatId: row[0],
            lastTime: row[1],
            totalMessages: row[2],
            unread: row[3] || 0
        }));
    } else {
        const allItems = await getAllIDBDataByType('messages');
        const chatsMap = new Map();
        const currentUser = await getUser();
        const currentUserId = currentUser ? currentUser.id : null;
        for (const item of allItems) {
            const messages = item.value;
            if (messages && messages.length) {
                const lastMsg = messages[messages.length - 1];
                const unread = messages.filter(m => m.status === 'sent' && m.senderId !== currentUserId).length;
                chatsMap.set(item.key.replace('messages_', ''), {
                    chatId: item.key.replace('messages_', ''),
                    lastTime: lastMsg.timestamp,
                    totalMessages: messages.length,
                    unread: unread
                });
            }
        }
        return Array.from(chatsMap.values()).sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));
    }
}

// ========== دوال جهات الاتصال ==========
async function addContact(phone, name, registered = false, supabaseId = '') {
    if (!usingIndexedDB && db) {
        db.run('INSERT OR REPLACE INTO contacts (phone, name, registered, supabaseId) VALUES (?, ?, ?, ?)',
            [phone, name || '', registered ? 1 : 0, supabaseId]);
    } else {
        let contacts = await getIDBData('contacts', 'contacts') || [];
        const existing = contacts.find(c => c.phone === phone);
        if (existing) {
            existing.name = name || existing.name;
            existing.registered = registered;
            existing.supabaseId = supabaseId;
        } else {
            contacts.push({ phone, name: name || '', registered, supabaseId });
        }
        await setIDBData('contacts', contacts, 'contacts');
    }
}

async function getAllContacts() {
    if (!usingIndexedDB && db) {
        const result = db.exec('SELECT * FROM contacts');
        if (!result.length || !result[0].values.length) return [];
        return result[0].values.map(row => ({
            phone: row[0], name: row[1], registered: row[2] === 1, supabaseId: row[3]
        }));
    } else {
        return await getIDBData('contacts', 'contacts') || [];
    }
}

async function updateContactRegistration(phone, registered, supabaseId) {
    if (!usingIndexedDB && db) {
        db.run('UPDATE contacts SET registered = ?, supabaseId = ? WHERE phone = ?',
            [registered ? 1 : 0, supabaseId || '', phone]);
    } else {
        let contacts = await getIDBData('contacts', 'contacts') || [];
        const index = contacts.findIndex(c => c.phone === phone);
        if (index !== -1) {
            contacts[index].registered = registered;
            contacts[index].supabaseId = supabaseId;
            await setIDBData('contacts', contacts, 'contacts');
        }
    }
}

async function deleteContact(phone) {
    if (!usingIndexedDB && db) {
        db.run('DELETE FROM contacts WHERE phone = ?', [phone]);
    } else {
        let contacts = await getIDBData('contacts', 'contacts') || [];
        contacts = contacts.filter(c => c.phone !== phone);
        await setIDBData('contacts', contacts, 'contacts');
    }
}

// ========== دوال الإعدادات ==========
async function getSetting(key) {
    if (!usingIndexedDB && db) {
        const result = db.exec('SELECT value FROM settings WHERE key = ?', [key]);
        if (!result.length || !result[0].values.length) return null;
        return result[0].values[0][0];
    } else {
        const settings = await getIDBData('settings', 'settings') || {};
        return settings[key] || null;
    }
}

async function setSetting(key, value) {
    if (!usingIndexedDB && db) {
        db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
    } else {
        let settings = await getIDBData('settings', 'settings') || {};
        settings[key] = value;
        await setIDBData('settings', settings, 'settings');
    }
}

async function deleteSetting(key) {
    if (!usingIndexedDB && db) {
        db.run('DELETE FROM settings WHERE key = ?', [key]);
    } else {
        let settings = await getIDBData('settings', 'settings') || {};
        delete settings[key];
        await setIDBData('settings', settings, 'settings');
    }
}

// ========== دوال إضافية ==========
async function deleteAllData() {
    if (!usingIndexedDB && db) {
        db.run('DELETE FROM messages');
        db.run('DELETE FROM contacts');
        db.run('DELETE FROM settings');
        db.run('DELETE FROM user');
    } else {
        await deleteIDBData('user');
        const allItems = await getAllIDBDataByType('messages');
        for (const item of allItems) {
            await deleteIDBData(item.key);
        }
        await deleteIDBData('contacts');
        await deleteIDBData('settings');
    }
}

async function exportDatabase() {
    if (!usingIndexedDB && db) {
        const data = db.export();
        const blob = new Blob([data.buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ramzapp_backup_${new Date().toISOString().slice(0, 10)}.sqlite`;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    } else {
        const user = await getIDBData('user', 'user');
        const contacts = await getIDBData('contacts', 'contacts');
        const settings = await getIDBData('settings', 'settings');
        const allMessages = await getAllIDBDataByType('messages');
        const exportData = { user, contacts, settings, messages: allMessages.map(m => ({ key: m.key, value: m.value })) };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ramzapp_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        return true;
    }
}

async function importDatabase(file) {
    if (!usingIndexedDB && db) {
        const buffer = await file.arrayBuffer();
        db = new SQL.Database(new Uint8Array(buffer));
        // حفظ في OPFS
        if (opfsAvailable) {
            try {
                const root = await navigator.storage.getDirectory();
                const fileHandle = await root.getFileHandle(DB_FILENAME, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(buffer);
                await writable.close();
            } catch (e) { console.warn(e); }
        }
        initTablesSQLite();
    } else {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.user) await setIDBData('user', data.user, 'user');
        if (data.contacts) await setIDBData('contacts', data.contacts, 'contacts');
        if (data.settings) await setIDBData('settings', data.settings, 'settings');
        if (data.messages) {
            for (const msgItem of data.messages) {
                await setIDBData(msgItem.key, msgItem.value, 'messages');
            }
        }
    }
}

// ========== تصدير الواجهة العامة ==========
window.RamzDB = {
    openDatabase,
    exportDatabase,
    importDatabase,
    deleteAllData,
    saveUser,
    getUser,
    deleteUser,
    saveMessage,
    getMessages,
    deleteMessages,
    getAllChats,
    addContact,
    updateContactRegistration,
    getAllContacts,
    deleteContact,
    getSetting,
    setSetting,
    deleteSetting
};

console.log('✅ RamzDB جاهز (SQLite/IndexedDB)');
