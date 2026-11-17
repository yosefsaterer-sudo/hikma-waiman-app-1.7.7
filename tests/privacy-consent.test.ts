import { describe, expect, it } from "vitest";

import {
  PRIVACY_CONSENT_VERSION,
  createPrivacyConsentRecord,
  hasCurrentPrivacyConsent,
} from "../lib/privacy-consent";

describe("privacy consent", () => {
  it("accepts the current consent record", () => {
    const record = createPrivacyConsentRecord("2026-11-05T00:00:00.000Z");
    expect(record.version).toBe(PRIVACY_CONSENT_VERSION);
    expect(hasCurrentPrivacyConsent(JSON.stringify(record))).toBe(true);
  });

  it("requires consent for missing, declined, malformed, or old records", () => {
    expect(hasCurrentPrivacyConsent(null)).toBe(false);
    expect(hasCurrentPrivacyConsent("not-json")).toBe(false);
    expect(hasCurrentPrivacyConsent(JSON.stringify({ accepted: false, version: PRIVACY_CONSENT_VERSION }))).toBe(false);
    expect(hasCurrentPrivacyConsent(JSON.stringify({ accepted: true, version: "0.9", acceptedAt: "2026-11-05" }))).toBe(false);
  });
});
