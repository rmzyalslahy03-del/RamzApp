// ============================================================
// common.js – RamzApp (SQLite + أيقونات + دوال مساعدة)
// لا يستخدم localStorage إطلاقاً. يعتمد على RamzDB.
// ============================================================

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
    link.onload = function () {
        fontAwesomeLoaded = true;
        document.body.classList.remove('no-fontawesome');
    };
    link.onerror = function () {
        // في حالة فشل البديل أيضاً، نترك الأيقونات الاحتياطية (Unicode) تعمل
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

    // فحص إضافي متأخر
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

// ---------- دوال الجلسة (تعتمد على SQLite المحلية) ----------
async function getSessionUser() {
    try {
        if (typeof RamzDB === 'undefined') {
            console.error('RamzDB غير معرف. تأكد من تحميل sqlite-local.js قبل common.js');
            window.location.href = 'login.html';
            return null;
        }
        const user = await RamzDB.getUser();
        if (!user) {
            window.location.href = 'login.html';
            return null;
        }
        return user;
    } catch (e) {
        console.error('فشل في قراءة المستخدم من SQLite:', e);
        window.location.href = 'login.html';
        return null;
    }
}

async function logoutUser() {
    try {
        await RamzDB.deleteUser();
    } catch (e) {}
    window.location.href = 'login.html';
}

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
