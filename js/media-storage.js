// media-storage.js – حفظ الوسائط في مجلد مرئي (RamzApp Media)
let directoryHandle = null;

async function getMediaFolder() {
  if (directoryHandle) return directoryHandle;
  try {
    directoryHandle = await window.showDirectoryPicker({
      id: 'ramz-media-folder',
      mode: 'readwrite',
      startIn: 'documents'
    });
  } catch (e) {
    console.warn('لم يتم اختيار مجلد للوسائط');
    return null;
  }
  return directoryHandle;
}

async function saveMediaToFolder(fileName, blob) {
  const handle = await getMediaFolder();
  if (!handle) return false;
  const fileHandle = await handle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(blob);
  await writable.close();
  return true;
}

async function autoSaveMedia(url, senderName) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const ext = url.split('.').pop().split('?')[0] || 'file';
    const fileName = `RamzApp_${senderName}_${Date.now()}.${ext}`;
    await saveMediaToFolder(fileName, blob);
  } catch (e) {
    console.warn('حفظ الوسائط تلقائياً فشل:', e);
  }
}

window.RamzMedia = { getMediaFolder, saveMediaToFolder, autoSaveMedia };
