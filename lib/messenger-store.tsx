import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Network from "expo-network";

import { attachmentSummary } from "@/lib/media-utils";
import { messengerAuth } from "@/lib/messenger-auth";
import { privateServerClient, type ServerMessage } from "@/lib/private-server-client";
import { uploadMediaToPrivateServer } from "@/lib/media-upload";
import { copyAttachmentToDirection } from "@/lib/media-cache";
import { shouldAutoDownload, type NetworkType } from "@/lib/download-settings";
import { deleteMediaLocally, downloadAndSaveMedia, getDownloadedMedia } from "@/lib/storage-manager";
import { serverConfigStore } from "@/lib/server-config";
import type { ChatMessage, Conversation, MediaAttachment } from "@/lib/messenger-models";

const DELETED_FOR_ME_KEY = "messenger.deleted-for-me.v1";
const LOCAL_CONVERSATIONS_KEY = "messenger.local-conversations.v1";
const LOCAL_MESSAGES_KEY = "messenger.local-messages.v1";

async function loadDeletedForMe(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DELETED_FOR_ME_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

async function saveDeletedForMe(ids: Set<string>) {
  await AsyncStorage.setItem(DELETED_FOR_ME_KEY, JSON.stringify([...ids]));
}

async function saveLocalCache(conversations: Conversation[], messages: Record<string, ChatMessage[]>) {
  try {
    await AsyncStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(conversations));
    await AsyncStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(messages));
  } catch {}
}

async function loadLocalCache(): Promise<{ conversations: Conversation[]; messages: Record<string, ChatMessage[]> }> {
  try {
    const rawConv = await AsyncStorage.getItem(LOCAL_CONVERSATIONS_KEY);
    const rawMsg = await AsyncStorage.getItem(LOCAL_MESSAGES_KEY);
    return {
      conversations: rawConv ? JSON.parse(rawConv) : [],
      messages: rawMsg ? JSON.parse(rawMsg) : {},
    };
  } catch {
    return { conversations: [], messages: {} };
  }
}

function formatServerTime(value: string) {
  return new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function currentNetworkType(): Promise<NetworkType> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (!state.isConnected) return "roaming";
    if (state.type === Network.NetworkStateType.WIFI) return "wifi";
    if (state.type === Network.NetworkStateType.CELLULAR) return "mobile";
  } catch {}
  return "mobile";
}

async function mapServerMessage(message: ServerMessage, accountId: string, serverBaseUrl: string): Promise<ChatMessage> {
  const networkType = await currentNetworkType();
  const attachments = await Promise.all((message.media ?? []).map(async (media) => {
    const kind: MediaAttachment["kind"] = media.mimeType.startsWith("image/") ? "image" : media.mimeType.startsWith("video/") ? "video" : media.mimeType.startsWith("audio/") ? "audio" : "file";
    const remoteUrl = media.url.startsWith("/") ? `${serverBaseUrl.replace(/\/$/, "")}${media.url}` : media.url;
    const name = media.name || "مرفق";
    const settingsKind = kind === "file" ? "document" : kind;
    const cached = await getDownloadedMedia(media.mediaId);
    if (cached) {
      return { id: media.mediaId, kind, uri: cached.localUri, remoteUrl, name, mimeType: media.mimeType, size: media.size, transferState: "received" as const };
    }
    const shouldDownload = await shouldAutoDownload(settingsKind, networkType);
    if (shouldDownload) {
      try {
        const saved = await downloadAndSaveMedia(remoteUrl, media.mediaId, name, media.mimeType, media.size || 0);
        return { id: media.mediaId, kind, uri: saved.localUri, remoteUrl, name, mimeType: media.mimeType, size: media.size, transferState: "received" as const };
      } catch {
        return { id: media.mediaId, kind, uri: "", remoteUrl, name, mimeType: media.mimeType, size: media.size, transferState: "failed" as const };
      }
    }
    return { id: media.mediaId, kind, uri: "", remoteUrl, name, mimeType: media.mimeType, size: media.size, transferState: "pending" as const };
  }));
  return {
    id: message.id,
    text: message.text,
    time: formatServerTime(message.createdAt),
    outgoing: message.senderId === accountId,
    status: message.senderId === accountId && message.readBy?.some((readerId) => readerId !== accountId) ? "read" : "delivered",
    attachments: attachments.length ? attachments : undefined,
  };
}

type MessengerContextValue = {
  conversationList: Conversation[];
  messagesByConversation: Record<string, ChatMessage[]>;
  sendMessage: (conversationId: string, text: string, replyTo?: ChatMessage["replyTo"]) => void;
  sendAttachments: (conversationId: string, attachments: MediaAttachment[], text?: string) => void;
  receiveAttachments: (conversationId: string, attachments: MediaAttachment[], text?: string) => void;
  retryAttachment: (conversationId: string, attachmentId: string) => void;
  clearUnread: (conversationId: string) => void;
  startDirectConversation: (username: string) => Promise<Conversation | null>;
  createGroup: (name: string, memberIds: string[]) => Conversation | null;
  deleteMessage: (conversationId: string, messageId: string, forEveryone?: boolean) => Promise<void>;
  forwardMessage: (conversationId: string, message: ChatMessage) => Promise<void>;
  markConversationRead: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
};

const MessengerContext = createContext<MessengerContextValue | null>(null);

export function MessengerProvider({ children }: PropsWithChildren) {
  const [conversationList, setConversationList] = useState<Conversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessage[]>>({});
  const [serverMode, setServerMode] = useState(false);
  const [deletedForMe, setDeletedForMe] = useState<Set<string>>(new Set());

  // تحميل البيانات المخزنة محلياً عند الإقلاع مباشرة لضمان عدم ظهور الشاشة فارغة
  useEffect(() => {
    void loadDeletedForMe().then(setDeletedForMe);
    void loadLocalCache().then((cached) => {
      if (cached.conversations.length) {
        setConversationList(cached.conversations);
        setMessagesByConversation(cached.messages);
      }
    });
  }, []);

  const refreshFromServer = useCallback(async () => {
    try {
      const settings = await serverConfigStore.load();
      if (!settings.baseUrl) {
        setServerMode(false);
        return;
      }
      const serverConversations = (await privateServerClient.listConversations()) as Array<Partial<Conversation> & { id: string; name: string; lastMessage?: string; time?: string }>;
      const serverConversationList = serverConversations.map((item) => ({
        id: item.id,
        name: item.name,
        initials: item.initials || item.name.slice(0, 2),
        color: item.color || "#0B5FFF",
        avatarUrl: item.avatarUrl || undefined,
        kind: item.kind || "group",
        lastMessage: item.lastMessage || "",
        time: item.time || "",
        unread: item.unread || 0,
        verified: item.verified || false,
        participants: item.participants || 2,
      })) as Conversation[];
      
      const account = await messengerAuth.loadSession();
      const accountId = account?.id || "";
      const serverMessages = await Promise.all(serverConversationList.map(async (conversation) => {
        const response = await privateServerClient.listMessages(conversation.id);
        const mapped = await Promise.all(response.items
          .filter((message) => !deletedForMe.has(message.id))
          .map((message) => mapServerMessage(message, accountId, settings.baseUrl)));
        await Promise.all(response.items.filter((message) => message.senderId !== accountId).map((message) => privateServerClient.markMessageRead(message.id).catch(() => undefined)));
        return [conversation.id, mapped] as const;
      }));

      const newMessagesMap = Object.fromEntries(serverMessages);
      setServerMode(true);
      setConversationList(serverConversationList);
      setMessagesByConversation(newMessagesMap);
      
      // حفظ النسخة المحدثة محلياً للاستخدام عند انقطاع الإنترنت
      void saveLocalCache(serverConversationList, newMessagesMap);
    } catch {
      // في حال انقطاع الاتصال: لا نقوم بتصفير القوائم بل نحتفظ بالبيانات المحلية الحالية دون تعديل
      setServerMode(false);
    }
  }, [deletedForMe]);

  useEffect(() => {
    void refreshFromServer();
    const unsubscribe = serverConfigStore.subscribe(() => { void refreshFromServer(); });
    const interval = setInterval(() => { void refreshFromServer(); }, 4000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [refreshFromServer]);

  const getTime = useCallback(() => new Intl.DateTimeFormat("ar", { hour: "2-digit", minute: "2-digit" }).format(new Date()), []);
  
  const clearUnread = useCallback((conversationId: string) => {
    setConversationList((current) => {
      const updated = current.map((conversation) => conversation.id === conversationId ? { ...conversation, unread: 0 } : conversation);
      void loadLocalCache().then((cache) => saveLocalCache(updated, cache.messages));
      return updated;
    });
  }, []);

  const sendMessage = useCallback((conversationId: string, text: string, replyTo?: ChatMessage["replyTo"]) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const time = getTime();
    const localMessage: ChatMessage = { id: `${conversationId}-${Date.now()}`, text: trimmed, time, outgoing: true, status: "sent", replyTo };
    
    setMessagesByConversation((current) => {
      const updatedMessages = { ...current, [conversationId]: [...(current[conversationId] ?? []), localMessage] };
      void loadLocalCache().then((cache) => saveLocalCache(cache.conversations, updatedMessages));
      return updatedMessages;
    });

    setConversationList((current) => {
      const updatedConv = current.map((conversation) => conversation.id === conversationId ? { ...conversation, lastMessage: `أنت: ${trimmed}`, time, unread: 0 } : conversation);
      void loadLocalCache().then((cache) => saveLocalCache(updatedConv, cache.messages));
      return updatedConv;
    });

    if (serverMode) {
      void privateServerClient.sendMessage(conversationId, trimmed).catch(() => undefined);
    }
  }, [getTime, serverMode]);

  const sendAttachments = useCallback((conversationId: string, attachments: MediaAttachment[], text = "") => {
    if (!attachments.length) return;
    const time = getTime();
    const messageId = `${conversationId}-media-${Date.now()}`;
    const outgoingAttachments = attachments.map((attachment) => ({ ...attachment, transferState: "sending" as const, progress: 12 }));
    const message: ChatMessage = { id: messageId, text: text.trim(), time, outgoing: true, status: "sent", attachments: outgoingAttachments };
    
    setMessagesByConversation((current) => {
      const updated = { ...current, [conversationId]: [...(current[conversationId] ?? []), message] };
      void loadLocalCache().then((cache) => saveLocalCache(cache.conversations, updated));
      return updated;
    });

    setConversationList((current) => {
      const updated = current.map((conversation) => conversation.id === conversationId ? { ...conversation, lastMessage: text.trim() || `أنت: ${attachmentSummary(attachments)}`, time, unread: 0 } : conversation);
      void loadLocalCache().then((cache) => saveLocalCache(updated, cache.messages));
      return updated;
    });

    if (serverMode) {
      void Promise.all(attachments.map((attachment) => Promise.resolve(copyAttachmentToDirection(attachment, "sent"))));
      void Promise.all(attachments.map((attachment) => uploadMediaToPrivateServer(attachment)))
        .then((uploaded) => privateServerClient.sendMessage(conversationId, text.trim(), uploaded.map((item) => item.mediaId).filter(Boolean) as string[]))
        .then(() => {
          setMessagesByConversation((current) => {
            const updated = {
              ...current,
              [conversationId]: (current[conversationId] ?? []).map((existing) => existing.id === messageId ? { ...existing, status: "read", attachments: existing.attachments?.map((attachment) => ({ ...attachment, transferState: "sent", progress: 100 })) } : existing),
            };
            void loadLocalCache().then((cache) => saveLocalCache(cache.conversations, updated));
            return updated;
          });
        })
        .catch(() => {
          setMessagesByConversation((current) => ({
            ...current,
            [conversationId]: (current[conversationId] ?? []).map((existing) => existing.id === messageId ? { ...existing, attachments: existing.attachments?.map((attachment) => ({ ...attachment, transferState: "failed" })) } : existing),
          }));
        });
      return;
    }
  }, [getTime, serverMode]);

  const receiveAttachments = useCallback((conversationId: string, attachments: MediaAttachment[], text = "") => {
    if (!attachments.length) return;
    const time = getTime();
    const message: ChatMessage = { id: `${conversationId}-received-${Date.now()}`, text, time, outgoing: false, status: "delivered", attachments: attachments.map((attachment) => ({ ...attachment, transferState: "received" })) };
    setMessagesByConversation((current) => {
      const updated = { ...current, [conversationId]: [...(current[conversationId] ?? []), message] };
      void loadLocalCache().then((cache) => saveLocalCache(cache.conversations, updated));
      return updated;
    });
  }, [getTime]);

  const retryAttachment = useCallback((conversationId: string, attachmentId: string) => {
    setMessagesByConversation((current) => ({ ...current, [conversationId]: (current[conversationId] ?? []).map((message) => ({ ...message, attachments: message.attachments?.map((attachment) => attachment.id === attachmentId ? { ...attachment, transferState: "sending", progress: 12 } : attachment) })) }));
    setTimeout(() => setMessagesByConversation((current) => ({ ...current, [conversationId]: (current[conversationId] ?? []).map((message) => ({ ...message, attachments: message.attachments?.map((attachment) => attachment.id === attachmentId ? { ...attachment, transferState: "sent", progress: 100 } : attachment) })) })), 650);
  }, []);

  const startDirectConversation = useCallback(async (username: string) => {
    const created = await privateServerClient.createDirectConversation(username);
    const conversation: Conversation = {
      id: created.id,
      name: created.name,
      initials: created.initials || created.name.slice(0, 2),
      color: created.color || "#0B5FFF",
      avatarUrl: created.avatarUrl || undefined,
      kind: "direct",
      lastMessage: created.lastMessage || "",
      time: created.time ? formatServerTime(created.time) : getTime(),
      unread: 0,
      verified: true,
      participants: 2,
    };
    setConversationList((current) => {
      const updated = [conversation, ...current.filter((item) => item.id !== conversation.id)];
      void loadLocalCache().then((cache) => saveLocalCache(updated, cache.messages));
      return updated;
    });
    setMessagesByConversation((current) => ({ ...current, [conversation.id]: current[conversation.id] || [] }));
    return conversation;
  }, [getTime]);

  const createGroup = useCallback((name: string, memberIds: string[]) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const id = `group-${Date.now()}`;
    const group: Conversation = { id, name: trimmed, initials: trimmed.slice(0, 2), color: "#0B5FFF", kind: "group", lastMessage: "تم إنشاء المجموعة محليًا.", time: getTime(), unread: 0, verified: false, participants: memberIds.length + 1 };
    
    setConversationList((current) => {
      const updated = [group, ...current];
      void loadLocalCache().then((cache) => saveLocalCache(updated, cache.messages));
      return updated;
    });

    setMessagesByConversation((current) => {
      const updated = { ...current, [id]: [{ id: `${id}-welcome`, text: "تم إنشاء المجموعة. يمكنك بدء المحادثة الآن.", time: getTime(), outgoing: false, status: "delivered" }] };
      void loadLocalCache().then((cache) => saveLocalCache(cache.conversations, updated));
      return updated;
    });

    return group;
  }, [getTime]);

  const deleteMessage = useCallback(async (conversationId: string, messageId: string, forEveryone = false) => {
    const target = messagesByConversation[conversationId]?.find((message) => message.id === messageId);
    if (!target) return;
    if (forEveryone && serverMode && target.outgoing) await privateServerClient.deleteMessage(messageId);
    const nextDeleted = new Set(deletedForMe);
    if (forEveryone) nextDeleted.delete(messageId);
    else nextDeleted.add(messageId);
    setDeletedForMe(nextDeleted);
    await saveDeletedForMe(nextDeleted);
    await Promise.all((target.attachments ?? []).map((attachment) => deleteMediaLocally(attachment.id)));
    
    setMessagesByConversation((current) => {
      const updated = {
        ...current,
        [conversationId]: (current[conversationId] ?? []).map((message) => message.id === messageId ? { ...message, text: "تم حذف هذه الرسالة", attachments: undefined, deleted: true } : message),
      };
      void loadLocalCache().then((cache) => saveLocalCache(cache.conversations, updated));
      return updated;
    });
  }, [deletedForMe, messagesByConversation, serverMode]);

  const forwardMessage = useCallback(async (conversationId: string, message: ChatMessage) => {
    if (!serverMode) { sendMessage(conversationId, message.text || "مرفق معاد توجيهه"); return; }
    if (!message.attachments?.length) { sendMessage(conversationId, message.text); return; }
    const uploaded = await Promise.all(message.attachments.map((attachment) => uploadMediaToPrivateServer(attachment)));
    await privateServerClient.sendMessage(conversationId, message.text || "مرفق معاد توجيهه", uploaded.map((item) => item.mediaId).filter(Boolean) as string[]);
    await refreshFromServer();
  }, [refreshFromServer, sendMessage, serverMode]);

  const markConversationRead = useCallback(async (conversationId: string) => {
    const messages = messagesByConversation[conversationId] ?? [];
    await Promise.all(messages.filter((message) => !message.outgoing).map((message) => privateServerClient.markMessageRead(message.id).catch(() => undefined)));
  }, [messagesByConversation]);

  const deleteConversation = useCallback(async (conversationId: string) => {
    if (serverMode) await privateServerClient.deleteConversation(conversationId);
    setConversationList((current) => {
      const updated = current.filter((conversation) => conversation.id !== conversationId);
      setMessagesByConversation((msgCurrent) => {
        const next = { ...msgCurrent };
        delete next[conversationId];
        void saveLocalCache(updated, next);
        return next;
      });
      return updated;
    });
  }, [serverMode]);

  const value = useMemo<MessengerContextValue>(() => ({ conversationList, messagesByConversation, sendMessage, sendAttachments, receiveAttachments, retryAttachment, clearUnread, startDirectConversation, createGroup, deleteMessage, forwardMessage, markConversationRead, deleteConversation }), [clearUnread, conversationList, createGroup, deleteConversation, deleteMessage, forwardMessage, markConversationRead, messagesByConversation, receiveAttachments, retryAttachment, sendAttachments, sendMessage, startDirectConversation]);

  return <MessengerContext.Provider value={value}>{children}</MessengerContext.Provider>;
}

export function useMessenger() {
  const context = useContext(MessengerContext);
  if (!context) throw new Error("useMessenger must be used inside MessengerProvider");
  return context;
}

