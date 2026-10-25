import type { Language } from './translation';

export type Preferences = {
  nickname: string;
  writeLanguage: Language;
  readLanguage: Language;
  autoTranslate: boolean;
};

const STORAGE_KEY = 'worldchat-preferences-v1';
export const defaults: Preferences = {
  nickname: '',
  writeLanguage: 'fr',
  readLanguage: 'fr',
  autoTranslate: false,
};

export function readPreferences(): Preferences {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return defaults;
  const value: unknown = JSON.parse(stored);
  if (!value || typeof value !== 'object' ||
      !('nickname' in value) || typeof value.nickname !== 'string' ||
      !('writeLanguage' in value) || !['fr', 'en'].includes(String(value.writeLanguage)) ||
      !('readLanguage' in value) || !['fr', 'en'].includes(String(value.readLanguage)) ||
      !('autoTranslate' in value) || typeof value.autoTranslate !== 'boolean') {
    throw new Error('Les préférences enregistrées sont invalides. Choisis à nouveau ton pseudo.');
  }
  return {
    nickname: value.nickname,
    writeLanguage: value.writeLanguage as Language,
    readLanguage: value.readLanguage as Language,
    autoTranslate: value.autoTranslate,
  };
}

export function savePreferences(value: Preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function invitationToken(value: string): string {
  const trimmed = value.trim();
  let token = trimmed;
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    token = new URL(trimmed).hash.replace(/^#invite=/, '');
  }
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Colle un lien ou un code d’invitation WorldChat valide.');
  return token;
}

export function invitationLink(token: string): string {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin);
  url.hash = `invite=${token}`;
  return url.toString();
}
