import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const eve = '00000000-0000-4000-8000-000000000003';
const migration = readFileSync(new URL('../supabase/migrations/20261025223537_worldchat_messaging.sql', import.meta.url), 'utf8');
let db: PGlite;

async function login(id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
  await db.exec('set role authenticated');
}

async function create() {
  const result = await db.query<{ id: string }>("select public.create_room('Voyage', 'Alice') as id");
  return result.rows[0].id;
}

async function invite(room: string) {
  const result = await db.query<{ token: string }>('select public.rotate_invitation($1) as token', [room]);
  return result.rows[0].token;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    insert into auth.users values ('${alice}'), ('${bob}'), ('${eve}');
  `);
  await db.exec(migration);
  await login(alice);
}, 30000);

afterEach(async () => { await db.close(); });

describe('room membership and invitations', () => {
  it('hides rooms and messages from non-members, including guessed room IDs', async () => {
    const room = await create();
    await db.query("select public.send_message($1, $2, 'Bonjour', 'fr')", [room, crypto.randomUUID()]);
    await login(eve);
    expect((await db.query('select * from public.rooms')).rows).toHaveLength(0);
    expect((await db.query('select * from public.messages')).rows).toHaveLength(0);
    await expect(db.query("select public.send_message($1, $2, 'Intrusion', 'fr')", [room, crypto.randomUUID()]))
      .rejects.toThrow('Tu ne fais pas partie de ce salon.');
  });

  it('joins with an invitation and receives the original, not a translation', async () => {
    const room = await create();
    const token = await invite(room);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    await db.query("select public.send_message($1, $2, 'Bonjour Bob', 'fr')", [room, crypto.randomUUID()]);
    await login(bob);
    await db.query("select public.join_room($1, 'Bob')", [token]);
    const messages = await db.query<{ body: string; language: string; sender_name: string }>('select * from public.messages');
    expect(messages.rows).toMatchObject([{ body: 'Bonjour Bob', language: 'fr', sender_name: 'Alice' }]);
    expect((await db.query('select * from public.rooms')).rows).toHaveLength(1);
    await expect(db.query('select * from public.room_invites')).rejects.toThrow('permission denied');
    await expect(invite(room)).rejects.toThrow('Seul le créateur');
  });

  it('revokes the old link when an owner creates another and rejects expiry', async () => {
    const room = await create();
    const old = await invite(room);
    const current = await invite(room);
    await login(bob);
    await expect(db.query("select public.join_room($1, 'Bob')", [old])).rejects.toThrow('Invitation invalide');
    await db.exec('reset role');
    await db.query("update public.room_invites set expires_at = now() - interval '1 day' where room_id = $1", [room]);
    await login(bob);
    await expect(db.query("select public.join_room($1, 'Bob')", [current])).rejects.toThrow('Invitation invalide');
  });

  it('denies direct writes and unauthenticated function calls', async () => {
    const room = await create();
    await expect(db.query("insert into public.room_members(room_id,user_id,display_name) values ($1,$2,'Eve')", [room, eve]))
      .rejects.toThrow('permission denied');
    await db.exec('reset role; set role anon');
    await expect(create()).rejects.toThrow('permission denied');
  });
});

describe('message delivery', () => {
  it('makes retries idempotent and rejects reuse of an ID for different content', async () => {
    const room = await create();
    const id = crypto.randomUUID();
    for (let i = 0; i < 2; i++) {
      await db.query("select public.send_message($1,$2,'Bonjour','fr')", [room, id]);
    }
    expect((await db.query('select * from public.messages')).rows).toHaveLength(1);
    await expect(db.query("select public.send_message($1,$2,'Autre texte','fr')", [room, id]))
      .rejects.toThrow('Cet identifiant correspond');
  });

  it('validates language and the actual message length on the server', async () => {
    const room = await create();
    await db.query("select public.send_message($1,$2,$3,'fr')", [room, crypto.randomUUID(), 'a'.repeat(300)]);
    await expect(db.query("select public.send_message($1,$2,$3,'fr')", [room, crypto.randomUUID(), 'a'.repeat(301)]))
      .rejects.toThrow('check constraint');
    await expect(db.query("select public.send_message($1,$2,'   ','fr')", [room, crypto.randomUUID()]))
      .rejects.toThrow('check constraint');
    await expect(db.query("select public.send_message($1,$2,'Hola','es')", [room, crypto.randomUUID()]))
      .rejects.toThrow('check constraint');
  });
});
