import { describe, expect, it } from 'vitest';
import { mergeMessages, type Message } from '../src/database';
import { invitationToken } from '../src/preferences';
import { shouldTranslate } from '../src/useIncomingTranslations';

const message: Message = {
  id: 'm1', sequence: 1, room_id: 'r1', sender_id: 'alice', sender_name: 'Alice',
  body: 'Bonjour', language: 'fr', created_at: '2026-10-25T22:00:00Z',
};

describe('received-only translation', () => {
  it('never translates an outgoing message, even when the reading language differs', () => {
    expect(shouldTranslate(message, 'alice', 'en')).toBe(false);
  });
  it('only translates incoming messages in a different language', () => {
    expect(shouldTranslate(message, 'bob', 'en')).toBe(true);
    expect(shouldTranslate(message, 'bob', 'fr')).toBe(false);
  });
});

describe('message synchronization', () => {
  it('deduplicates confirmed sends and realtime echoes and sorts history', () => {
    const newer = { ...message, id: 'm2', sequence: 2 };
    expect(mergeMessages([newer], [message, newer])).toEqual([message, newer]);
  });
});

describe('invitation parsing', () => {
  it('accepts a code or a fragment-based invitation link', () => {
    const token = 'a'.repeat(64);
    expect(invitationToken(token)).toBe(token);
    expect(invitationToken(`https://example.com/WorldChat/#invite=${token}`)).toBe(token);
  });
  it('rejects guessed room IDs and malformed links', () => {
    for (const value of ['', 'room-123', 'https://example.com/?invite=hello']) {
      expect(() => invitationToken(value)).toThrow('invitation');
    }
  });
});
