import AsyncStorage from "@react-native-async-storage/async-storage";

export const PRIVACY_CONSENT_KEY = "hikma-waiman.privacy-consent";
export const PRIVACY_CONSENT_VERSION = "1.0";

export type PrivacyConsentRecord = {
  accepted: true;
  version: string;
  acceptedAt: string;
};

export function hasCurrentPrivacyConsent(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const record = JSON.parse(raw) as Partial<PrivacyConsentRecord>;
    return record.accepted === true && record.version === PRIVACY_CONSENT_VERSION && typeof record.acceptedAt === "string";
  } catch {
    return false;
  }
}

export function createPrivacyConsentRecord(acceptedAt = new Date().toISOString()): PrivacyConsentRecord {
  return { accepted: true, version: PRIVACY_CONSENT_VERSION, acceptedAt };
}

export async function hasAcceptedPrivacyPolicy(): Promise<boolean> {
  return hasCurrentPrivacyConsent(await AsyncStorage.getItem(PRIVACY_CONSENT_KEY));
}

export async function savePrivacyConsent(): Promise<void> {
  await AsyncStorage.setItem(PRIVACY_CONSENT_KEY, JSON.stringify(createPrivacyConsentRecord()));
}

export async function clearPrivacyConsent(): Promise<void> {
  await AsyncStorage.removeItem(PRIVACY_CONSENT_KEY);
}
