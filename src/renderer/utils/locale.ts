import type { LocaleCode, LocaleMode } from '@/types';

export function normalizeLocale(locale?: unknown): LocaleCode {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export function resolveSystemLocale(systemLanguage?: string): LocaleCode {
  const language = String(systemLanguage ?? (typeof navigator !== 'undefined' ? navigator.language : '')).toLowerCase();
  return language.startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function normalizeLocaleMode(localeMode?: unknown, locale?: unknown): LocaleMode {
  if (localeMode === 'auto' || localeMode === 'manual') {
    return localeMode;
  }

  // Backward compatibility: old config had no localeMode and default locale=en-US.
  return normalizeLocale(locale) === 'zh-CN' ? 'manual' : 'auto';
}

export function resolveEffectiveLocale(input?: {
  locale?: unknown;
  localeMode?: unknown;
  systemLanguage?: string;
}): LocaleCode {
  const locale = normalizeLocale(input?.locale);
  const mode = normalizeLocaleMode(input?.localeMode, locale);
  if (mode === 'auto') {
    return resolveSystemLocale(input?.systemLanguage);
  }
  return locale;
}
