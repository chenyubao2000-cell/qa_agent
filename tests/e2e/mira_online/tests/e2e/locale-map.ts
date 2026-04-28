import path from "node:path";

export const LOCALE_NATIVE_NAMES: Record<string, string> = {
  en: "English",
  zh: "简体中文",
  "zh-tw": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  de: "Deutsch",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  ms: "Bahasa Melayu",
  pt: "Português",
  th: "ภาษาไทย",
  vi: "Tiếng Việt",
};

export const PLAYWRIGHT_LOCALE: Record<string, string> = {
  zh: "zh-CN",
  "zh-tw": "zh-TW",
  ja: "ja-JP",
  ko: "ko-KR",
};

export function toProjectLocale(raw: string): string {
  return raw.trim().toLowerCase();
}

export function authFileForLocale(locale: string): string {
  return path.join("playwright", ".auth", `user.${locale}.json`);
}

export function authFileAbsolute(projectRoot: string, locale: string): string {
  return path.join(projectRoot, "playwright", ".auth", `user.${locale}.json`);
}

export function defaultLocale(): string {
  const list = (process.env.APP_LANGUAGES || "").split(",").map(toProjectLocale).filter(Boolean);
  return list[0] || "en";
}
