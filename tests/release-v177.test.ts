import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { ANDROID_VERSION_CODE, APP_VERSION } from "../constants/app-version";

describe("release 1.7.7", () => {
  it("uses the requested app and Android versions", () => {
    expect(APP_VERSION).toBe("1.7.7");
    expect(ANDROID_VERSION_CODE).toBe(10707);
    expect(readFileSync("app.config.ts", "utf8")).toContain("version: APP_VERSION");
    expect(readFileSync("app.config.ts", "utf8")).toContain("versionCode: ANDROID_VERSION_CODE");
    expect(readFileSync("app.config.ts", "utf8")).not.toContain('from "./constants/app-version"');
  });

  it("does not embed a fixed server address", () => {
    const source = readFileSync("lib/messenger-auth.ts", "utf8");
    expect(source).toContain('DEFAULT_MESSENGER_SERVER = ""');
    expect(source).not.toMatch(/ngrok-free|manus\.space|spotter-user/);
  });

  it("uses the organized HikmaWaiman local storage root", () => {
    const source = readFileSync("lib/storage-manager.ts", "utf8");
    expect(source).toContain("HikmaWaiman/");
    expect(source).toContain("Media/Images/");
    expect(source).toContain("Media/Videos/");
    expect(source).toContain("Media/Audio/");
    expect(source).toContain("Media/Documents/");
  });

  it("reports real download progress and animates the circular action", () => {
    const storageSource = readFileSync("lib/storage-manager.ts", "utf8");
    const chatSource = readFileSync("app/chat/[id].tsx", "utf8");
    expect(storageSource).toContain("createDownloadResumable");
    expect(storageSource).toContain("onProgress?.");
    expect(chatSource).toContain("downloadProgress");
    expect(chatSource).toContain("Animated.loop");
    expect(chatSource).toContain("downloadPercent");
  });
});
