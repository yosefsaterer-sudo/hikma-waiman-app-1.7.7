import { File } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

import { safeAttachmentFilename } from "@/lib/attachment-filename";
import { getAttachmentDirectory } from "@/lib/media-cache";
import type { MediaAttachment } from "@/lib/messenger-models";

export type AttachmentSaveResult = { ok: boolean; message: string };

async function getLocalCopy(attachment: MediaAttachment) {
  if (!attachment.uri) return null;
  const directory = getAttachmentDirectory(attachment.kind, "received");
  const destination = new File(directory, safeAttachmentFilename(attachment.name));
  if (/^https?:\/\//.test(attachment.uri)) return File.downloadFileAsync(attachment.uri, destination, { idempotent: true });
  const source = new File(attachment.uri);
  if (!source.exists) return null;
  source.copy(destination);
  return destination;
}

export async function saveIncomingAttachment(attachment: MediaAttachment): Promise<AttachmentSaveResult> {
  if (Platform.OS === "web") return { ok: false, message: "حفظ الملفات داخل مجلد الجهاز متاح في نسخة Android." };
  try {
    const file = await getLocalCopy(attachment);
    if (!file?.exists) return { ok: false, message: "لا يحتوي هذا المرفق التجريبي على ملف قابل للحفظ بعد." };
    // الحفظ الأساسي لا يستخدم DCIM ولا يحتاج صلاحية تخزين واسعة؛ الملف يبقى
    // داخل HikmaWaiman/Media/... ويمكن تشغيله دون إعادة تنزيله.
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, { dialogTitle: `مشاركة أو تصدير ${attachment.name}`, mimeType: attachment.mimeType });
    }
    return { ok: true, message: `تم حفظ الملف داخل مجلد HikmaWaiman/Media الخاص بالتطبيق.` };
  } catch {
    return { ok: false, message: "تعذر حفظ هذا المرفق. حاول مرة أخرى." };
  }
}
