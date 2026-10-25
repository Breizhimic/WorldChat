import { describe, expect, it } from 'vitest';
import { languages, MAX_CHARACTERS, otherLanguage, validateText } from '../src/translation';

describe('translation input', () => {
  it('rejects empty and whitespace-only messages', () => {
    for (const value of ['', '  ', '\n\t']) expect(() => validateText(value)).toThrow('Écris un message');
  });
  it('trims the input but preserves line breaks in the message', () => {
    expect(validateText('  Bonjour\nle monde !  ')).toBe('Bonjour\nle monde !');
  });
  it('accepts the limit and rejects any longer input', () => {
    expect(validateText('a'.repeat(MAX_CHARACTERS))).toHaveLength(MAX_CHARACTERS);
    expect(() => validateText('a'.repeat(MAX_CHARACTERS + 1))).toThrow('300 caractères');
  });
  it('uses a separate directional model for each language', () => {
    expect(languages.fr.model).toBe('Xenova/opus-mt-fr-en');
    expect(languages.en.model).toBe('Xenova/opus-mt-en-fr');
    expect(otherLanguage('fr')).toBe('en');
    expect(otherLanguage(otherLanguage('fr'))).toBe('fr');
  });
});
