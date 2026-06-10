// common.js – RamzApp (الإصدار النهائي – مع احتياطي localStorage)
// رابط الخادم: https://ramzapp.onrender.com

// ---------- نظام الأيقونات الاحتياطي ----------
let fontAwesomeLoaded = false;
let fallbackCDNTried = false;

function onFontAwesomeLoad() {
    fontAwesomeLoaded = true;
    document.body.classList.remove('no-fontawesome');
}

function loadFallbackCDN() {
    if (fallbackCDNTried) return;
    fallbackCDNTried = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.0.0/css/all.min.css';
    link.onload = function() {
        fontAwesomeLoaded = true;
        document.body.classList.remove('no-fontawesome');
    };
    link.onerror = function() {
        document.body.classList.add('no-fontawesome');
    };
    document.head.appendChild(link);
}

function detectFontAwesome() {
    setTimeout(() => {
        const testEl = document.querySelector('.fa, .fas, .far, .fab');
        if (testEl) {
            const style = window.getComputedStyle(testEl, '::before');
            const content = style.content;
            if (!content || content === 'none' || content === '""') {
                if (!fallbackCDNTried) {
                    loadFallbackCDN();
                } else {
                    document.body.classList.add('no-fontawesome');
                }
            } else {
                fontAwesomeLoaded = true;
                document.body.classList.remove('no-fontawesome');
            }
        }
    }, 1500);
    setTimeout(() => {
        if (!fontAwesomeLoaded && !fallbackCDNTried) {
            loadFallbackCDN();
        } else if (!fontAwesomeLoaded) {
            document.body.classList.add('no-fontawesome');
        }
    }, 4000);
}

// ---------- دوال الوقت والتاريخ ----------
function timeAgo(date) {
    const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return Math.floor(diff / 60) + ' د';
    if (diff < 86400) return Math.floor(diff / 3600) + ' س';
    return Math.floor(diff / 86400) + ' يوم';
}

function fmtTime(date) {
    return new Date(date).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(date) {
    return new Date(date).toLocaleDateString('ar-SA', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ---------- دوال النص ----------
function esc(str) {
    return str ? str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]) : '';
}

function genId() {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

// ---------- الإشعارات (Toast) ----------
function toast(msg, duration = 2000) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), duration);
}

// ---------- دوال الجلسة (SQLite أولاً، ثم localStorage) ----------
async function getSessionUser() {
    // 1. نحاول من SQLite (إذا كان RamzDB معرّفاً)
    if (typeof RamzDB !== 'undefined' && RamzDB.getUser) {
        try {
            const user = await RamzDB.getUser();
            if (user && user.id) return user;
        } catch (e) {
            console.warn('⚠️ فشلت قراءة المستخدم من SQLite، سنحاول localStorage');
        }
    }

    // 2. إذا لم نجد، نقرأ من localStorage (الذي حفظه login.html)
    const saved = localStorage.getItem('ramz_user');
    if (saved) {
        try {
            const user = JSON.parse(saved);
            if (user && user.name) {
                // نحاول حفظه في SQLite الآن (للمرات القادمة)
                if (typeof RamzDB !== 'undefined' && RamzDB.saveUser) {
                    try {
                        await RamzDB.saveUser({
                            id: user.id,
                            name: user.name,
                            avatar: user.avatar || user.name.charAt(0).toUpperCase(),
                            phone: user.phone || '',
                            email: user.email || '',
                            supabaseId: user.id,
                            isGuest: user.isGuest || false
                        });
                        await RamzDB.setSetting('theme', 'dark');
                        await RamzDB.setSetting('notifications', 'true');
                        console.log('✅ تم نقل المستخدم من localStorage إلى SQLite');
                    } catch (e) {
                        console.warn('⚠️ لم يتم نقل المستخدم إلى SQLite:', e);
                    }
                }
                return user;
            }
        } catch (e) {}
    }

    // 3. لا مستخدم في أي مكان → العودة إلى login
    window.location.href = 'login.html';
    return null;
}

async function logoutUser() {
    try {
        if (typeof RamzDB !== 'undefined' && RamzDB.deleteUser) {
            await RamzDB.deleteUser();
        }
    } catch (e) {}
    localStorage.removeItem('ramz_user');
    window.location.href = 'login.html';
}

// ========== إعدادات الخادم (للتشغيل المباشر مع Render) ==========
window.RAMZ_SERVER_URL = 'https://ramzapp.onrender.com';

// ---------- تصدير الدوال للاستخدام العام ----------
window.timeAgo = timeAgo;
window.fmtTime = fmtTime;
window.fmtDate = fmtDate;
window.esc = esc;
window.genId = genId;
window.toast = toast;
window.getSessionUser = getSessionUser;
window.logoutUser = logoutUser;
window.onFontAwesomeLoad = onFontAwesomeLoad;
window.loadFallbackCDN = loadFallbackCDN;
window.detectFontAwesome = detectFontAwesome;

// ---------- تشغيل كشف الأيقونات تلقائياً ----------
document.addEventListener('DOMContentLoaded', detectFontAwesome);
window.addEventListener('load', () => {
    setTimeout(() => {
        if (!fontAwesomeLoaded && !fallbackCDNTried) {
            loadFallbackCDN();
        } else if (!fontAwesomeLoaded) {
            document.body.classList.add('no-fontawesome');
        }
    }, 800);
});
