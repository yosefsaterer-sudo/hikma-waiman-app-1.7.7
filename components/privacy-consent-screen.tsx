import { useState } from "react";
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { AppIcon } from "@/components/app-icon";
import { ScreenContainer } from "@/components/screen-container";
import { savePrivacyConsent } from "@/lib/privacy-consent";
import { getNativePalette } from "@/lib/native-palette";
import { useThemeContext } from "@/lib/theme-provider";

export function PrivacyConsentScreen({ onAccepted }: { onAccepted: () => void }) {
  const { colorScheme } = useThemeContext();
  const palette = getNativePalette(colorScheme);
  const [saving, setSaving] = useState(false);

  const accept = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await savePrivacyConsent();
      onAccepted();
    } catch {
      Alert.alert("تعذر حفظ الموافقة", "تحقق من مساحة التخزين ثم حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  };

  const decline = () => {
    Alert.alert(
      "لا يمكن متابعة الاستخدام",
      "يلزم قبول سياسة الخصوصية لاستخدام التطبيق. يمكنك إغلاق التطبيق أو العودة والموافقة.",
      [
        { text: "العودة", style: "cancel" },
        { text: "إغلاق التطبيق", style: "destructive", onPress: () => BackHandler.exitApp() },
      ],
    );
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-background">
      <ScrollView contentContainerStyle={[styles.content, { backgroundColor: palette.background }]}>
        <View style={[styles.iconWrap, { backgroundColor: palette.surfaceRaised }]}>
          <AppIcon name="privacy-tip" size={42} color={palette.primary} />
        </View>
        <Text style={[styles.title, { color: palette.text }]}>سياسة الخصوصية</Text>
        <Text style={[styles.intro, { color: palette.muted }]}>قبل بدء استخدام حكمة وإيمان، نحتاج إلى موافقتك على طريقة التعامل مع بياناتك.</Text>

        <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Row palette={palette} icon="lock" title="حسابك وبيانات الخادم" detail="تُحفظ بيانات الحساب والرسائل على الخادم الذي تختاره، وتُنقل عبر اتصال آمن عند توفر HTTPS." />
          <Row palette={palette} icon="folder" title="التخزين المحلي" detail="قد يحفظ التطبيق الوسائط التي اخترت تنزيلها داخل مجلد HikmaWaiman لتشغيلها من الكاش وتقليل إعادة التحميل." />
          <Row palette={palette} icon="perm-media" title="الصلاحيات" detail="لا تُطلب الكاميرا أو الميكروفون أو الملفات إلا عند استخدام الميزة، وتظهر موافقة النظام ومؤشر الاستخدام." />
          <Row palette={palette} icon="cloud-off" title="لا توجد مراقبة خفية" detail="لا يقرأ التطبيق الرسائل أو جهات الاتصال أو الإشعارات في الخلفية، ولا يشغّل الكاميرا أو الميكروفون أو يرسل ملفات دون إجراء ظاهر منك." />
        </View>

        <Text style={[styles.note, { color: palette.muted }]}>يمكنك تغيير أذونات النظام من إعدادات Android، ومسح بيانات الخادم المحفوظة من قسم الخصوصية والأمان داخل التطبيق.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="أوافق وأتابع" disabled={saving} onPress={() => void accept()} style={({ pressed }) => [styles.accept, { backgroundColor: palette.primary }, saving && styles.disabled, pressed && styles.pressed]}>
          <Text style={styles.acceptText}>{saving ? "جارٍ الحفظ…" : "أوافق وأتابع"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="لا أوافق" onPress={decline} style={({ pressed }) => [styles.decline, { borderColor: palette.border }, pressed && styles.pressed]}>
          <Text style={[styles.declineText, { color: palette.primary }]}>لا أوافق</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

function Row({ palette, icon, title, detail }: { palette: ReturnType<typeof getNativePalette>; icon: "lock" | "folder" | "perm-media" | "cloud-off"; title: string; detail: string }) {
  return <View style={styles.row}><View style={[styles.rowIcon, { backgroundColor: palette.surfaceRaised }]}><AppIcon name={icon} size={20} color={palette.primary} /></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: palette.text }]}>{title}</Text><Text style={[styles.rowDetail, { color: palette.muted }]}>{detail}</Text></View></View>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 24, justifyContent: "center" },
  iconWrap: { alignSelf: "center", width: 82, height: 82, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { textAlign: "center", writingDirection: "rtl", fontSize: 29, fontWeight: "900" },
  intro: { textAlign: "center", writingDirection: "rtl", fontSize: 15, lineHeight: 24, marginTop: 10, marginBottom: 22 },
  card: { borderWidth: 1, borderRadius: 20, padding: 15, gap: 16 },
  row: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 11 },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1 },
  rowTitle: { textAlign: "right", writingDirection: "rtl", fontSize: 15, fontWeight: "800" },
  rowDetail: { textAlign: "right", writingDirection: "rtl", fontSize: 13, lineHeight: 20, marginTop: 3 },
  note: { textAlign: "right", writingDirection: "rtl", fontSize: 12.5, lineHeight: 19, marginTop: 16 },
  accept: { height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: 20 },
  acceptText: { color: "#FFFFFF", fontSize: 16, fontWeight: "900" },
  decline: { height: 50, borderRadius: 16, borderWidth: 1, alignItems: "center", justifyContent: "center", marginTop: 10 },
  declineText: { fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.6 },
});
