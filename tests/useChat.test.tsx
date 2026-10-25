// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Message } from '../src/database';
import { useChat } from '../src/useChat';

const server = vi.hoisted(() => ({
  messages: [] as Message[],
  status: null as ((status: string) => void) | null,
}));

vi.mock('../src/backend', () => {
  class Query {
    private after = -1;
    private size = 50;
    private ascending = false;
    constructor(private table: string) {}
    select() { return this; }
    eq() { return this; }
    limit(value: number) { this.size = value; return this; }
    gt(_column: string, value: number) { this.after = value; return this; }
    order(_column: string, options: { ascending: boolean }) { this.ascending = options.ascending; return this; }
    then(resolve: (result: { data: unknown[]; error: null }) => void) {
      const data = this.table === 'rooms'
        ? [{ id: 'room', name: 'Voyage', owner_id: 'alice', created_at: '2026-10-25T22:00:00Z' }]
        : server.messages.filter((message) => message.sequence > this.after)
          .sort((a, b) => this.ascending ? a.sequence - b.sequence : b.sequence - a.sequence).slice(0, this.size);
      return Promise.resolve({ data, error: null }).then(resolve);
    }
  }
  return {
    connectSession: async () => 'alice',
    backend: {
      from: (table: string) => new Query(table),
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      channel: () => ({
        on() { return this; },
        subscribe(handler: (status: string) => void) {
          server.status = handler;
          handler('SUBSCRIBED');
          return this;
        },
      }),
      removeChannel: async () => {},
    },
  };
});

afterEach(() => { cleanup(); server.status = null; });

it('catches up all missed messages across multiple pages after reconnecting', async () => {
  function messages(until: number): Message[] {
    return Array.from({ length: until }, (_, index) => ({
      id: `message-${index + 1}`, sequence: index + 1, room_id: 'room',
      sender_id: 'bob', sender_name: 'Bob', body: 'Hello', language: 'en',
      created_at: '2026-10-25T22:00:00Z',
    }));
  }
  server.messages = messages(75);
  const { result } = renderHook(() => useChat());
  await waitFor(() => expect(result.current.rooms).toHaveLength(1));
  act(() => result.current.setRoomId('room'));
  await waitFor(() => expect(result.current.messages).toHaveLength(50));
  expect(result.current.messages[0].sequence).toBe(26);
  server.messages = messages(205);
  act(() => server.status?.('SUBSCRIBED'));
  await waitFor(() => expect(result.current.messages).toHaveLength(180));
  expect(result.current.messages.map((message) => message.sequence))
    .toEqual(Array.from({ length: 180 }, (_, index) => index + 26));
});
