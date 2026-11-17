import { 
  STORAGE_ROOT, 
  MEDIA_DIRECTORIES, 
  VOICE_NOTES_DIR, 
  PROFILE_DIR, 
  ensureStorageDirectories, 
  downloadAndSaveMedia, 
  getDownloadedMedia, 
  deleteMediaLocally 
} from "@/lib/storage-manager";
import type { MediaAttachment, MediaKind } from "@/lib/messenger-models";

export function appStorageDirectories() {
  void ensureStorageDirectories();
  return { 
    root: STORAGE_ROOT, 
    media: `${STORAGE_ROOT}Media/`, 
    images: MEDIA_DIRECTORIES.image, 
    videos: MEDIA_DIRECTORIES.video, 
    audio: MEDIA_DIRECTORIES.audio, 
    documents: MEDIA_DIRECTORIES.file, 
    sent: `${STORAGE_ROOT}Media/Sent/`, 
    received: `${STORAGE_ROOT}Media/Received/`, 
    profile: PROFILE_DIR, 
    backgrounds: `${STORAGE_ROOT}backgrounds/` 
  };
}

export function getAttachmentDirectory(kind: MediaKind, isVoiceNote = false) {
  if (isVoiceNote) return VOICE_NOTES_DIR;
  return MEDIA_DIRECTORIES[kind] || MEDIA_DIRECTORIES.file;
}

export async function getCachedMedia(attachment: Pick<MediaAttachment, "id" | "name" | "uri" | "kind">) {
  if (!attachment || !attachment.uri) return null;
  
  // تحقق مما إذا كان محمل مسبقاً عبر نظام التخزين
  const cached = await getDownloadedMedia(attachment.id);
  if (cached) return cached.localUri;

  if (!/^https?:\/\//i.test(attachment.uri)) return attachment.uri;

  try {
    const saved = await downloadAndSaveMedia(
      attachment.uri,
      attachment.id,
      attachment.name || "attachment",
      attachment.kind === "image" ? "image/jpeg" : attachment.kind === "video" ? "video/mp4" : attachment.kind === "audio" ? "audio/mpeg" : "application/octet-stream",
      0
    );
    return saved.localUri;
  } catch {
    return null;
  }
}

export async function removeCachedMedia(id: string) {
  await deleteMediaLocally(id);
}

export function copyAttachmentToDirection(attachment: Pick<MediaAttachment, "id" | "name" | "uri" | "kind">, direction: "sent" | "received") {
  // الاعتماد على المسارات المحلية المباشرة إن وجدت
  if (!attachment || !attachment.uri || /^https?:\/\//i.test(attachment.uri)) return null;
  return attachment.uri;
}
