export const MAX_CHARACTERS = 300;

export const languages = {
  fr: { name: 'Français', model: 'Xenova/opus-mt-fr-en' },
  en: { name: 'English', model: 'Xenova/opus-mt-en-fr' },
} as const;

export type Language = keyof typeof languages;

export function otherLanguage(language: Language): Language {
  return language === 'fr' ? 'en' : 'fr';
}

export function validateText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Écris un message avant de le traduire.');
  if (text.length > MAX_CHARACTERS) {
    throw new Error(`Le message ne doit pas dépasser ${MAX_CHARACTERS} caractères.`);
  }
  return trimmed;
}

export type TranslationRequest = {
  type: 'translate';
  id: number;
  source: Language;
  text: string;
};

export type TranslationResponse =
  | { type: 'status'; id: number; message: string }
  | { type: 'progress'; id: number; file: string; loaded: number; total: number }
  | { type: 'result'; id: number; text: string; durationMs: number }
  | { type: 'error'; id: number; message: string };
