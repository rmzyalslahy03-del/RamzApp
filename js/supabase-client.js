// ================================================================
// supabase-client.js – الإصدار النهائي (يدعم Broadcast كخادم وسيط ناقل فقط)
// جميع الدوال جاهزة للاستخدام مع chat.html المعدل.
// ================================================================

(function() {
    // التأكد من تحميل مكتبة Supabase الأساسية قبل هذا الملف
    if (typeof supabase === 'undefined') {
        console.error('❌ خطأ: مكتبة Supabase لم تُحمّل قبل supabase-client.js');
        return;
    }

    // ========== إعدادات الاتصال بـ Supabase ==========
    const SUPABASE_URL = 'https://serlegwdzjulfcxabxzv.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_4_c97KxnG_7HTvfv-pKeNQ_FTlnK6Yx';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const TEMP_BUCKET = 'ramz-temp';   // bucket مخصص للملفات المؤقتة فقط

    // ========== دوال مساعدة داخلية ==========
    async function ensureProfile(userId, email, username) {
        const { error } = await supabaseClient
            .from('profiles')
            .upsert({ id: userId, email, username, avatar: username.charAt(0).toUpperCase() });
        if (error) console.warn('⚠️ تحديث الملف الشخصي فشل:', error);
    }

    // التأكد من وجود bucket مؤقت للملفات (ينشئه تلقائياً إذا لم يكن موجوداً)
    async function ensureTempBucket() {
        try {
            const { data: buckets, error: listError } = await supabaseClient.storage.listBuckets();
            if (listError) throw listError;
            const exists = buckets.some(b => b.name === TEMP_BUCKET);
            if (!exists) {
                const { error: createError } = await supabaseClient.storage.createBucket(TEMP_BUCKET, {
                    public: true,
                    allowedMimeTypes: ['*'],
                    fileSizeLimit: 52428800  // 50 ميجابايت كحد أقصى
                });
                if (createError) throw createError;
                console.log('✅ تم إنشاء bucket مؤقت للملفات:', TEMP_BUCKET);
            }
        } catch (err) {
            console.warn('⚠️ فشل التحقق من bucket المؤقت:', err);
        }
    }

    // ========== واجهة العميل العامة ==========
    window.SupabaseClient = {
        // ----- الحصول على عميل supabase نفسه (للاستخدام المباشر إن لزم) -----
        getClient() {
            return supabaseClient;
        },

        // ========== دوال Realtime Broadcast (الخادم الوسيط الناقل) ==========
        // إنشاء قناة broadcast لغرفة محددة (تحاكي Socket.IO room)
        getRealtimeChannel(channelName) {
            return supabaseClient.channel(channelName, {
                config: { broadcast: { ack: true } }
            });
        },

        // ========== رفع الملفات مؤقتاً (لا تخزين دائم) ==========
        // رفع ملف وإرجاع رابط عام مؤقت واسم الملف
        async uploadTempFile(file) {
            await ensureTempBucket();
            const fileName = `temp/${Date.now()}_${Math.random().toString(36).substr(2, 8)}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { data, error } = await supabaseClient.storage
                .from(TEMP_BUCKET)
                .upload(fileName, file, { cacheControl: '3600', upsert: false });
            if (error) throw error;
            const { data: publicUrlData } = supabaseClient.storage.from(TEMP_BUCKET).getPublicUrl(fileName);
            return { publicUrl: publicUrlData.publicUrl, fileName };
        },

        // حذف ملف من التخزين المؤقت (يُستدعى بعد تسليم الملف للمستلم)
        async deleteTempFile(fileName) {
            if (!fileName) return;
            const { error } = await supabaseClient.storage.from(TEMP_BUCKET).remove([fileName]);
            if (error) console.warn('⚠️ فشل حذف الملف المؤقت:', fileName, error);
            else console.log('🗑️ تم حذف الملف المؤقت:', fileName);
        },

        // ========== المصادقة بالبريد الإلكتروني وكلمة مرور (اختياري، يمكن الاستغناء عنه) ==========
        async signUpWithEmail(email, password, username) {
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { username } }
            });
            if (error) throw error;
            await ensureProfile(data.user.id, email, username);
            return data.user;
        },

        async signInWithEmail(email, password) {
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            return data.user;
        },

        async getCurrentUser() {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return null;
            const { data: profile } = await supabaseClient.from('profiles').select('username').eq('id', user.id).single();
            return {
                id: user.id,
                name: profile?.username || user.email?.split('@')[0],
                email: user.email,
                avatar: profile?.username?.charAt(0) || user.email?.charAt(0).toUpperCase() || 'U'
            };
        },

        async signOut() {
            await supabaseClient.auth.signOut();
        },

        // ========== إدارة جهات الاتصال (تخزين في Supabase Database) ==========
        async addContact(ownerId, contactPhone, contactName) {
            const { error } = await supabaseClient.from('contacts').upsert({
                owner_id: ownerId,
                contact_phone: contactPhone,
                contact_name: contactName,
                registered: false
            }, { onConflict: 'owner_id,contact_phone' });
            if (error) throw error;
        },

        async getContacts(ownerId) {
            const { data, error } = await supabaseClient
                .from('contacts')
                .select('*')
                .eq('owner_id', ownerId);
            if (error) return [];
            return data;
        },

        async updateContactRegistration(contactPhone, registered, supabaseUserId) {
            const { error } = await supabaseClient
                .from('contacts')
                .update({ registered, supabase_user_id: supabaseUserId })
                .eq('contact_phone', contactPhone);
            if (error) console.warn('⚠️ فشل تحديث حالة التسجيل:', error);
        },

        async deleteContact(ownerId, contactPhone) {
            const { error } = await supabaseClient
                .from('contacts')
                .delete()
                .eq('owner_id', ownerId)
                .eq('contact_phone', contactPhone);
            if (error) throw error;
        },

        // ========== البحث عن مستخدمين (لإضافة جهات اتصال) ==========
        async searchByPhone(phone) {
            const email = `${phone}@ramz.app`;
            return this.searchByEmail(email);
        },

        async searchByEmail(email) {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('email', email)
                .single();
            if (error && error.code !== 'PGRST116') throw error;
            return data;
        },

        // ========== دعوة عبر SMS (نفس القديم) ==========
        inviteBySMS(phone) {
            const message = encodeURIComponent('انضم إلي على RamzApp: https://ramzapp.vercel.app');
            window.open(`sms:${phone}?body=${message}`, '_blank');
        },

        // ========== رفع الصور للتخزين الدائم (اختياري، إن أردت) ==========
        async uploadImage(file) {
            const fileName = `images/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { data, error } = await supabaseClient.storage
                .from('ramz-images')
                .upload(fileName, file, { cacheControl: '3600', upsert: false });
            if (error) throw error;
            const { data: publicUrlData } = supabaseClient.storage.from('ramz-images').getPublicUrl(fileName);
            return publicUrlData.publicUrl;
        }
    };

    // تهيئة bucket المؤقت عند التحميل (محاولة غير متزامنة)
    window.SupabaseClient.ensureTempBucket = ensureTempBucket;
    ensureTempBucket().catch(console.warn);

    console.log('✅ SupabaseClient جاهز للاستخدام (بث Broadcast + تخزين مؤقت للملفات)');
})();
