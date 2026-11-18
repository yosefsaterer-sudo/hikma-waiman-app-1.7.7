import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { MediaKind } from "@/lib/messenger-models";

// ==========================================
// ثوابت التخزين
// ==========================================

export const STORAGE_ROOT = `${FileSystem.documentDirectory}HikmaWaiman/`;

export const MEDIA_DIRECTORIES: Record<MediaKind, string> = {
  image: `${STORAGE_ROOT}Media/Images/`,
  video: `${STORAGE_ROOT}Media/Videos/`,
  audio: `${STORAGE_ROOT}Media/Audio/`,
  file: `${STORAGE_ROOT}Media/Documents/`,
};

export const VOICE_NOTES_DIR = `${STORAGE_ROOT}Media/Voice Notes/`;
export const PROFILE_DIR = `${STORAGE_ROOT}profile/`;

const DOWNLOADED_MEDIA_KEY = "messenger.downloaded.media";
const PUBLIC_TREE_KEY = "messenger.public.storage.tree";

// ==========================================
// أنواع البيانات
// ==========================================

export type DownloadedMedia = {
  mediaId: string;
  localUri: string;
  remoteUrl: string;
  mimeType: string;
  name: string;
  size: number;
  downloadedAt: string;
};

// ==========================================
// إنشاء المجلدات
// ==========================================

export async function ensureStorageDirectories(): Promise<void> {
  const directories = [STORAGE_ROOT, ...Object.values(MEDIA_DIRECTORIES), VOICE_NOTES_DIR, PROFILE_DIR];

  for (const dir of directories) {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
  }
}

export async function choosePublicStorageDirectory(): Promise<boolean> {
  if (!FileSystem.StorageAccessFramework) return false;
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted || !permission.directoryUri) return false;
  await AsyncStorage.setItem(PUBLIC_TREE_KEY, permission.directoryUri);
  
  // إنشاء مجلد رئيسي فرعي للتطبيق في الذاكرة العامة
  try {
    const root = await FileSystem.StorageAccessFramework.makeDirectoryAsync(permission.directoryUri, "hekma-aiman").catch(() => permission.directoryUri);
    for (const folder of ["الصور", "الفيديو", "الصوت", "المستندات", "الرسائل الصوتية"]) {
      await FileSystem.StorageAccessFramework.makeDirectoryAsync(root, folder).catch(() => undefined);
    }
  } catch {}

  return true;
}

export async function getPublicStorageDirectory(): Promise<string | null> {
  const uri = await AsyncStorage.getItem(PUBLIC_TREE_KEY);
  if (!uri) return null;
  // إرجاع وصف مقروء للمسار العام للمستخدم
  return "التخزين العام الخارجي / hekma-aiman";
}

// ==========================================
// تصدير و نسخ الملف إلى المجلد العام تلقائياً
// ==========================================

async function exportToPublicStorageIfNeeded(localUri: string, fileName: string, mimeType: string): Promise<void> {
  try {
    const treeUri = await AsyncStorage.getItem(PUBLIC_TREE_KEY);
    if (!treeUri || !FileSystem.StorageAccessFramework) return;

    // قراءة الملف المحلي كـ Base64
    const base64Data = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    
    // إنشاء الملف داخل المجلد العام الخارجي مباشرة
    await FileSystem.StorageAccessFramework.createFileAsync(treeUri, fileName, mimeType)
      .then(async (createdFileUri) => {
        await FileSystem.writeAsStringAsync(createdFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
      })
      .catch(async () => {
        // محاولة بديلة داخل مجلد hekma-aiman الفرعي إذا وجد
        const root = await FileSystem.StorageAccessFramework.makeDirectoryAsync(treeUri, "hekma-aiman").catch(() => treeUri);
        const createdFileUri = await FileSystem.StorageAccessFramework.createFileAsync(root, fileName, mimeType);
        await FileSystem.writeAsStringAsync(createdFileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
      });
  } catch {
    // تجاهل أخطاء التصدير الخارجي لضمان عدم توقف الكاش الداخلي
  }
}

// ==========================================
// الحصول على مسار المجلد حسب نوع الوسائط
// ==========================================

export function getDirectoryForKind(kind: MediaKind, isVoiceNote = false): string {
  if (isVoiceNote) return VOICE_NOTES_DIR;
  return MEDIA_DIRECTORIES[kind] || MEDIA_DIRECTORIES.file;
}

// ==========================================
// توليد اسم ملف فريد
// ==========================================

export function generateFileName(originalName: string, mediaId: string): string {
  const extension = originalName.split(".").pop()?.toLowerCase() || "bin";
  const safeName = mediaId.replace(/[^a-zA-Z0-9]/g, "_");
  return `${safeName}.${extension}`;
}

// ==========================================
// حفظ ملف محلياً وتصديره تلقائياً للمسار العام
// ==========================================

export async function saveMediaLocally(
  remoteUrl: string,
  fileName: string,
  kind: MediaKind,
  mediaId: string,
  mimeType: string,
  size: number,
  isVoiceNote = false,
  onProgress?: (progress: number) => void,
): Promise<DownloadedMedia> {
  const directory = getDirectoryForKind(kind, isVoiceNote);
  await ensureStorageDirectories();

  const localUri = `${directory}${fileName}`;
  const info = await FileSystem.getInfoAsync(localUri);

  if (info.exists) {
    // محاولة تصديره للمجلد العام حتى لو كان محفوظاً مسبقاً في الكاش
    void exportToPublicStorageIfNeeded(localUri, fileName, mimeType);
    return {
      mediaId,
      localUri,
      remoteUrl,
      mimeType,
      name: fileName,
      size: info.size || size,
      downloadedAt: new Date().toISOString(),
    };
  }

  const downloadResult = await FileSystem.createDownloadResumable(
    remoteUrl,
    localUri,
    {},
    (progress) => {
      if (progress.totalBytesExpectedToWrite > 0) {
        onProgress?.(Math.min(100, Math.round((progress.totalBytesWritten / progress.totalBytesExpectedToWrite) * 100)));
      }
    },
  ).downloadAsync();

  if (!downloadResult) {
    throw new Error("فشل تحميل الملف: لم تُرجع عملية التنزيل نتيجة");
  }
  if (downloadResult.status !== 200) {
    throw new Error(`فشل تحميل الملف: ${downloadResult.status}`);
  }

  // **الربط الفعلي الجديد:** تصدير الملف فور تنزيله إلى مجلد التخزين العام المختار
  void exportToPublicStorageIfNeeded(localUri, fileName, mimeType);

  const downloaded: DownloadedMedia = {
    mediaId,
    localUri,
    remoteUrl,
    mimeType,
    name: fileName,
    size,
    downloadedAt: new Date().toISOString(),
  };

  await registerDownloadedMedia(downloaded);
  return downloaded;
}

export async function downloadAndSaveMedia(
  remoteUrl: string,
  mediaId: string,
  fileName: string,
  mimeType: string,
  size: number,
  onProgress?: (progress: number) => void,
): Promise<DownloadedMedia> {
  const kind: MediaKind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : mimeType.startsWith("audio/") ? "audio" : "file";
  return saveMediaLocally(remoteUrl, generateFileName(fileName, mediaId), kind, mediaId, mimeType, size, false, onProgress);
}

// ==========================================
// إدارة سجل الملفات المحملة
// ==========================================

export async function registerDownloadedMedia(media: DownloadedMedia): Promise<void> {
  const stored = await AsyncStorage.getItem(DOWNLOADED_MEDIA_KEY);
  const list: DownloadedMedia[] = stored ? JSON.parse(stored) : [];
  const filtered = list.filter((item) => item.mediaId !== media.mediaId);
  filtered.push(media);
  await AsyncStorage.setItem(DOWNLOADED_MEDIA_KEY, JSON.stringify(filtered));
}

export async function getDownloadedMedia(mediaId: string): Promise<DownloadedMedia | null> {
  const stored = await AsyncStorage.getItem(DOWNLOADED_MEDIA_KEY);
  const list: DownloadedMedia[] = stored ? JSON.parse(stored) : [];
  return list.find((item) => item.mediaId === mediaId) || null;
}

export async function getAllDownloadedMedia(): Promise<DownloadedMedia[]> {
  const stored = await AsyncStorage.getItem(DOWNLOADED_MEDIA_KEY);
  return stored ? JSON.parse(stored) : [];
}

// ==========================================
// حذف ملف محلي
// ==========================================

export async function deleteMediaLocally(mediaId: string): Promise<void> {
  const stored = await AsyncStorage.getItem(DOWNLOADED_MEDIA_KEY);
  const list: DownloadedMedia[] = stored ? JSON.parse(stored) : [];
  const media = list.find((item) => item.mediaId === mediaId);

  if (media) {
    const info = await FileSystem.getInfoAsync(media.localUri);
    if (info.exists) {
      await FileSystem.deleteAsync(media.localUri, { idempotent: true });
    }
  }

  const filtered = list.filter((item) => item.mediaId !== mediaId);
  await AsyncStorage.setItem(DOWNLOADED_MEDIA_KEY, JSON.stringify(filtered));
}

// ==========================================
// حساب حجم التخزين المستخدم
// ==========================================

export async function calculateStorageUsage(): Promise<{ total: number; byKind: Record<MediaKind, number> }> {
  const usage: Record<MediaKind, number> = { image: 0, video: 0, audio: 0, file: 0 };
  let total = 0;

  for (const [kind, directory] of Object.entries(MEDIA_DIRECTORIES)) {
    try {
      const info = await FileSystem.getInfoAsync(directory);
      if (info.exists) {
        const files = await FileSystem.readDirectoryAsync(directory);
        for (const file of files) {
          const fileInfo = await FileSystem.getInfoAsync(`${directory}${file}`);
          if (fileInfo.exists && fileInfo.size) {
            usage[kind as MediaKind] += fileInfo.size;
            total += fileInfo.size;
          }
        }
      }
    } catch {}
  }

  return { total, byKind: usage };
}

// ==========================================
// مسح جميع الملفات المحملة
// ==========================================

export async function clearAllDownloadedMedia(): Promise<void> {
  const directories = [...Object.values(MEDIA_DIRECTORIES), VOICE_NOTES_DIR];

  for (const dir of directories) {
    try {
      const info = await FileSystem.getInfoAsync(dir);
      if (info.exists) {
        await FileSystem.deleteAsync(dir, { idempotent: true });
      }
    } catch {}
  }

  await AsyncStorage.removeItem(DOWNLOADED_MEDIA_KEY);
  await ensureStorageDirectories();
}

// ==========================================
// مسح ملفات نوع معين
// ==========================================

export async function clearMediaByKind(kind: MediaKind): Promise<void> {
  const directory = MEDIA_DIRECTORIES[kind];
  try {
    const info = await FileSystem.getInfoAsync(directory);
    if (info.exists) {
      await FileSystem.deleteAsync(directory, { idempotent: true });
      await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    }
  } catch {}
}

// ==========================================
// تنسيق حجم التخزين
// ==========================================

export function formatStorageSize(bytes: number): string {
  if (bytes === 0) return "0 بايت";
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} جيجابايت`;
}
