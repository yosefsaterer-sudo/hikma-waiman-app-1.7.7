import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { AppIcon } from "@/components/app-icon";
import { Avatar } from "@/components/avatar";
import { ScreenContainer } from "@/components/screen-container";
import { useMessenger } from "@/lib/messenger-store";
import { privateServerClient, type ServerAccount } from "@/lib/private-server-client";
import { getNativePalette } from "@/lib/native-palette";
import { useThemeContext } from "@/lib/theme-provider";

export default function NewChatScreen() {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<ServerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState("");
  const { startDirectConversation } = useMessenger();
  const { colorScheme } = useThemeContext();
  const palette = getNativePalette(colorScheme);
  useEffect(() => { void privateServerClient.listAccounts().then(setAccounts).catch(() => Alert.alert("تعذر جلب الحسابات", "تأكد من تسجيل الدخول إلى الخادم.")).finally(() => setLoading(false)); }, []);
  const results = useMemo(() => accounts.filter((account) => account.username.includes(query.trim().toLowerCase())), [accounts, query]);
  const select = async (account: ServerAccount) => { setCreating(account.id); try { const conversation = await startDirectConversation(account.username); if (conversation) router.replace(`/chat/${conversation.id}` as never); } catch (error) { Alert.alert("تعذر بدء المحادثة", error instanceof Error ? error.message : "حاول مرة أخرى."); } finally { setCreating(""); } };
  return <ScreenContainer edges={["top", "bottom", "left", "right"]} className="bg-background" containerClassName="bg-background"><View style={[styles.topBar, { borderBottomColor: palette.border }]}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.close, pressed && styles.pressed]}><AppIcon name="close" size={25} color={palette.text} /></Pressable><Text style={[styles.title, { color: palette.text }]}>رسالة خاصة جديدة</Text><View style={styles.spacer} /></View><View style={[styles.searchBox, { backgroundColor: palette.input }]}><AppIcon name="search" color={palette.muted} size={21} /><TextInput value={query} onChangeText={setQuery} placeholder="ابحث باسم المستخدم" placeholderTextColor={palette.muted} style={[styles.input, { color: palette.text }]} textAlign="right" autoFocus /></View><Text style={[styles.label, { color: palette.muted }]}>حسابات الخادم</Text>{loading ? <View style={styles.empty}><ActivityIndicator color={palette.primary} /></View> : <FlatList data={results} keyExtractor={(item) => item.id} contentContainerStyle={styles.list} ListEmptyComponent={<View style={styles.empty}><Text style={[styles.emptyText, { color: palette.muted }]}>لا توجد حسابات أخرى بعد. أنشئ حسابًا ثانيًا على الجهاز الآخر أولًا.</Text></View>} renderItem={({ item }) => <Pressable disabled={Boolean(creating)} onPress={() => void select(item)} style={({ pressed }) => [styles.contact, { borderBottomColor: palette.border }, pressed && styles.pressed]}><Avatar initials={item.username.slice(0, 2).toUpperCase()} color={palette.primary} imageUri={item.avatarUrl || undefined} online /><View style={styles.contactCopy}><Text style={[styles.contactName, { color: palette.text }]}>{item.username}</Text><Text style={[styles.contactDetail, { color: palette.muted }]}>ابدأ محادثة خاصة</Text></View>{creating === item.id ? <ActivityIndicator color={palette.primary} /> : <AppIcon name="chevron-left" size={25} color={palette.muted} />}</Pressable>} />}</ScreenContainer>;
}
const styles = StyleSheet.create({ topBar: { height: 64, paddingHorizontal: 16, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1 }, close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" }, title: { fontSize: 18, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, spacer: { width: 40 }, searchBox: { margin: 18, height: 48, borderRadius: 15, paddingHorizontal: 14, flexDirection: "row-reverse", gap: 9, alignItems: "center" }, input: { flex: 1, fontSize: 15, writingDirection: "rtl", textAlign: "right" }, label: { marginHorizontal: 20, marginBottom: 6, fontSize: 13, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, list: { paddingHorizontal: 20 }, contact: { minHeight: 70, flexDirection: "row-reverse", gap: 12, alignItems: "center", borderBottomWidth: 1 }, contactCopy: { flex: 1, alignItems: "flex-end" }, contactName: { fontSize: 16, fontWeight: "800", textAlign: "right", writingDirection: "rtl" }, contactDetail: { fontSize: 12.5, marginTop: 4, textAlign: "right", writingDirection: "rtl" }, empty: { padding: 30, alignItems: "center" }, emptyText: { fontSize: 13, lineHeight: 20, textAlign: "center", writingDirection: "rtl" }, pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] } });
