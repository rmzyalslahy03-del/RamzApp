// supabase-client.js – عميل Supabase لـ RamzApp (الإصدار النهائي)
// يدعم: التسجيل بالهاتف، البريد الإلكتروني، البحث، رفع الصور، الدعوة

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://serlegwdzjulfcxabxzv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_4_c97KxnG_7HTvfv-pKeNQ_FTlnK6Yx';
const BUCKET_NAME = 'ramz-images';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ========== المصادقة (Auth) ==========

async function signUp(phone, username) {
  const email = `${phone}@ramz.app`;
  const password = `ramz-${phone}`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { phone, username } }
  });

  if (error) throw error;

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: data.user.id,
      phone,
      username,
      avatar: username.charAt(0).toUpperCase()
    });

  if (profileError) console.warn('تعذر حفظ الملف الشخصي:', profileError);

  return data.user;
}

async function signIn(phone) {
  const email = `${phone}@ramz.app`;
  const password = `ramz-${phone}`;

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

async function signUpWithEmail(email, password, username) {
  // محاولة تسجيل الدخول أولاً
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (!signInError) {
    // تحديث الملف الشخصي
    await supabase.from('profiles').upsert({
      id: signInData.user.id,
      email,
      username,
      avatar: username.charAt(0).toUpperCase()
    });
    return signInData.user;
  }

  // إذا فشل الدخول، حاول التسجيل
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });

  if (error) throw error;

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: data.user.id,
      email,
      username,
      avatar: username.charAt(0).toUpperCase()
    });

  if (profileError) console.warn('تعذر حفظ الملف الشخصي:', profileError);

  return data.user;
}

// ========== الملف الشخصي (Profiles) ==========

async function searchByPhone(phone) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('phone', phone)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function searchByEmail(email) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ========== التخزين (Storage) ==========

async function uploadImage(file) {
  const fileName = `${Date.now()}_${file.name}`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });

  if (error) throw error;

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(fileName);

  return publicUrlData.publicUrl;
}

// ========== دعوة (Invite) ==========

function inviteBySMS(phone) {
  const message = encodeURIComponent('انضم إلى RamzApp للتواصل معي: https://ramzapp.vercel.app');
  const smsLink = `sms:${phone}?body=${message}`;
  window.open(smsLink, '_blank');
}

// ========== تصدير ==========

window.SupabaseClient = {
  signUp,
  signIn,
  signUpWithEmail,
  searchByPhone,
  searchByEmail,
  uploadImage,
  inviteBySMS
};
