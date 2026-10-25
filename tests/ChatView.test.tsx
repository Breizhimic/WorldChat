// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatView } from '../src/ChatView';
import type { Message, Room } from '../src/database';
import { defaults } from '../src/preferences';
import type { TranslationRequest, TranslationResponse } from '../src/translation';

const room: Room = { id: 'r1', name: 'Voyage', owner_id: 'alice', created_at: '2026-10-25T22:00:00Z' };
const message: Message = {
  id: 'm1', sequence: 1, room_id: room.id, sender_id: 'alice', sender_name: 'Alice',
  body: 'Bonjour le monde !', language: 'fr', created_at: room.created_at,
};
const base = {
  room, userId: 'bob', online: true, connection: 'live' as const,
  onBack: vi.fn(), onInvite: vi.fn(), onSettings: vi.fn(), onRefresh: vi.fn(),
  hasOlder: false, loadOlder: vi.fn(), loadingOlder: false, loadingMessages: false,
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function workerMock(translate: boolean) {
  const requests: TranslationRequest[] = [];
  const factory = vi.fn(class {
    onmessage: ((event: MessageEvent<TranslationResponse>) => void) | null = null;
    onerror = null;
    onmessageerror = null;
    terminate() {}
    postMessage(data: TranslationRequest) {
      requests.push(data);
      if (translate) queueMicrotask(() => this.onmessage?.({
        data: { type: 'result', id: data.id, text: 'Hello world!', durationMs: 10 },
      } as MessageEvent<TranslationResponse>));
    }
  });
  vi.stubGlobal('Worker', factory);
  return { requests, factory };
}

describe('messaging and local translation are independent', () => {
  it('translates a received message and keeps the original accessible', async () => {
    const { requests } = workerMock(true);
    render(<ChatView {...base} messages={[message]} preferences={{
      ...defaults, nickname: 'Bob', readLanguage: 'en', autoTranslate: true,
    }} onSend={vi.fn()} />);
    await screen.findByText('Hello world!');
    expect(requests).toMatchObject([{ text: 'Bonjour le monde !', source: 'fr' }]);
    fireEvent.click(screen.getByRole('button', { name: /Traduit · voir l’original/ }));
    expect(screen.getByText('Bonjour le monde !')).toBeTruthy();
  });

  it('never translates sent messages or received messages already in the reading language', async () => {
    const { factory } = workerMock(true);
    render(<ChatView {...base} messages={[message, { ...message, id: 'm2', sender_id: 'bob', language: 'en', body: 'My original text' }]}
      preferences={{ ...defaults, nickname: 'Bob', autoTranslate: true }} onSend={vi.fn()} />);
    await act(async () => {});
    expect(factory).not.toHaveBeenCalled();
    expect(screen.getByText('My original text')).toBeTruthy();
  });

  it('sends the original without waiting for incoming translations', async () => {
    const { requests } = workerMock(false);
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ChatView {...base} messages={[{ ...message, language: 'en', body: 'Hello' }]}
      preferences={{ ...defaults, nickname: 'Bob', autoTranslate: true }} onSend={onSend} />);
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Ton message'), { target: { value: 'Mon texte original' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('r1', expect.any(String), 'Mon texte original', 'fr'));
    await waitFor(() => expect((screen.getByLabelText('Ton message') as HTMLTextAreaElement).value).toBe(''));
  });

  it('retains failed text and reuses the same ID when retrying an unconfirmed send', async () => {
    workerMock(false);
    const onSend = vi.fn().mockRejectedValueOnce(new Error('Réseau indisponible')).mockResolvedValueOnce(undefined);
    render(<ChatView {...base} messages={[]} preferences={{ ...defaults, nickname: 'Bob' }} onSend={onSend} />);
    fireEvent.change(screen.getByLabelText('Ton message'), { target: { value: 'Bonjour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));
    await screen.findByRole('alert');
    expect((screen.getByLabelText('Ton message') as HTMLTextAreaElement).value).toBe('Bonjour');
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le message' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(2));
    expect(onSend.mock.calls[0][1]).toBe(onSend.mock.calls[1][1]);
  });
});
