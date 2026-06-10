// supabase-client.js – الإصدار النهائي (متوافق مع جميع الصفحات، لا يحتاج type="module")
(function() {
    // التأكد من تحميل مكتبة Supabase الأساسية قبل هذا الملف
    if (typeof supabase === 'undefined') {
        console.error('❌ خطأ: مكتبة Supabase لم تُحمّل قبل supabase-client.js');
        return;
    }

    const SUPABASE_URL = 'https://serlegwdzjulfcxabxzv.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_4_c97KxnG_7HTvfv-pKeNQ_FTlnK6Yx';
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const BUCKET_NAME = 'ramz-images';

    // ========== دوال مساعدة داخلية ==========
    async function ensureProfile(userId, email, username) {
        const { error } = await supabaseClient
            .from('profiles')
            .upsert({ id: userId, email, username, avatar: username.charAt(0).toUpperCase() });
        if (error) console.warn('⚠️ تحديث الملف الشخصي فشل:', error);
    }

    // ========== واجهة العميل العامة ==========
    window.SupabaseClient = {
        // ----- المصادقة بالهاتف (بريد إلكتروني وهمي) -----
        async signUp(phone, username) {
            const email = `${phone}@ramz.app`;
            const password = `ramz-${phone}`;
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { phone, username } }
            });
            if (error) throw error;
            await ensureProfile(data.user.id, email, username);
            return data.user;
        },

        async signIn(phone) {
            const email = `${phone}@ramz.app`;
            const password = `ramz-${phone}`;
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            return data.user;
        },

        // ----- المصادقة بالبريد الإلكتروني وكلمة مرور عادية -----
        async signUpWithEmail(email, password, username) {
            // محاولة تسجيل الدخول أولاً (في حال كان الحساب موجوداً)
            const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (!signInError) {
                await ensureProfile(signInData.user.id, email, username);
                return signInData.user;
            }
            // التسجيل الجديد
            const { data, error } = await supabaseClient.auth.signUp({
                email,
                password,
                options: { data: { username } }
            });
            if (error) throw error;
            await ensureProfile(data.user.id, email, username);
            return data.user;
        },

        // ----- البحث عن مستخدم -----
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

        // ----- رفع صورة إلى Storage -----
        async uploadImage(file) {
            const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
            const { data, error } = await supabaseClient.storage
                .from(BUCKET_NAME)
                .upload(fileName, file, { cacheControl: '3600', upsert: false });
            if (error) throw error;
            const { data: publicUrlData } = supabaseClient.storage.from(BUCKET_NAME).getPublicUrl(fileName);
            return publicUrlData.publicUrl;
        },

        // ----- دعوة عبر SMS -----
        inviteBySMS(phone) {
            const message = encodeURIComponent('انضم إلي على RamzApp: https://ramzapp.vercel.app');
            window.open(`sms:${phone}?body=${message}`, '_blank');
        }
    };

    console.log('✅ SupabaseClient جاهز للاستخدام');
})();
