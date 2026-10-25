import { useCallback, useEffect, useRef, useState } from 'react';
import { backend, connectSession } from './backend';
import { mergeMessages, type Message, type Room } from './database';
import { validateText, type Language } from './translation';

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') return error.message;
  return 'Une erreur inattendue est survenue.';
}

const PAGE_SIZE = 50;

export function useChat() {
  const [userId, setUserId] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connecting, setConnecting] = useState(Boolean(backend));
  const [connection, setConnection] = useState<'connecting' | 'live' | 'disconnected'>('connecting');
  const [error, setError] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const refreshMessages = useRef<(() => Promise<void>) | null>(null);
  const selectedRoom = useRef<string | null>(null);
  selectedRoom.current = roomId;

  const loadRooms = useCallback(async () => {
    if (!backend) throw new Error('Supabase n’est pas configuré.');
    const { data, error } = await backend.from('rooms').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    setRooms(data);
    return data;
  }, []);

  const connect = useCallback(async () => {
    if (!backend) return;
    setConnecting(true);
    setError('');
    try {
      const id = await connectSession();
      setUserId(id);
      await loadRooms();
    } catch (error) {
      setError(`Connexion impossible : ${errorMessage(error)}`);
    } finally {
      setConnecting(false);
    }
  }, [loadRooms]);

  useEffect(() => {
    void connect();
    const subscription = backend?.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        setUserId(null);
        setRooms([]);
        setRoomId(null);
        setError('Ta session a expiré. Reconnecte-toi ; une nouvelle session ne récupère pas automatiquement les anciens salons.');
      }
    });
    return () => subscription?.data.subscription.unsubscribe();
  }, [connect]);

  useEffect(() => {
    setMessages([]);
    setHasOlder(false);
    setLoadingOlder(false);
    setLoadingMessages(false);
    setError('');
    if (!backend || !userId || !roomId) return;
    let alive = true;
    let cursor: number | undefined;
    let syncing = false;
    let syncAgain = false;
    const client = backend;
    setConnection('connecting');
    setLoadingMessages(true);
    async function refresh() {
      syncAgain = true;
      if (syncing) return;
      syncing = true;
      try {
        do {
          syncAgain = false;
          let more: boolean;
          do {
            const initial = cursor === undefined;
            const query = client.from('messages').select('*').eq('room_id', roomId!).limit(PAGE_SIZE);
            const { data, error } = await (initial
              ? query.order('sequence', { ascending: false })
              : query.gt('sequence', cursor!).order('sequence', { ascending: true }));
            if (!alive) return;
            if (error) throw error;
            if (initial) {
              setHasOlder(data.length === PAGE_SIZE);
              cursor = data[0]?.sequence ?? 0;
            } else {
              cursor = data.at(-1)?.sequence ?? cursor;
            }
            setMessages((previous) => mergeMessages(previous, data));
            more = !initial && data.length === PAGE_SIZE;
          } while (more && alive);
        } while (syncAgain && alive);
      } catch (error) {
        if (alive) setError(`Messages indisponibles : ${errorMessage(error)}`);
      } finally {
        syncing = false;
        if (alive) setLoadingMessages(false);
      }
    }
    refreshMessages.current = refresh;
    const channel = client.channel(`room:${roomId}`)
      .on<Message>('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (alive) setMessages((previous) => mergeMessages(previous, [payload.new]));
        })
      .subscribe((status) => {
        if (!alive) return;
        if (status === 'SUBSCRIBED') {
          setConnection('live');
          void refresh();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('disconnected');
        }
      });
    void refresh();
    const resume = () => {
      if (document.visibilityState === 'visible') {
        void refresh();
        void loadRooms().catch((error) => { if (alive) setError(errorMessage(error)); });
      }
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      alive = false;
      if (refreshMessages.current === refresh) refreshMessages.current = null;
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      void client.removeChannel(channel);
    };
  }, [roomId, userId, loadRooms]);

  async function createRoom(name: string, nickname: string) {
    if (!backend || !userId) throw new Error('Connecte-toi avant de créer un salon.');
    const { data, error } = await backend.rpc('create_room', { p_name: name.trim(), p_display_name: nickname.trim() });
    if (error) throw error;
    await loadRooms();
    setRoomId(data);
  }

  async function joinRoom(token: string, nickname: string) {
    if (!backend || !userId) throw new Error('Connecte-toi avant de rejoindre un salon.');
    const { data, error } = await backend.rpc('join_room', { p_token: token, p_display_name: nickname.trim() });
    if (error) throw error;
    await loadRooms();
    setRoomId(data);
  }

  async function invite(id: string) {
    if (!backend) throw new Error('Supabase n’est pas configuré.');
    const { data, error } = await backend.rpc('rotate_invitation', { p_room_id: id });
    if (error) throw error;
    return data;
  }

  async function sendMessage(room: string, id: string, text: string, language: Language) {
    if (!backend || !userId) throw new Error('Connecte-toi avant d’envoyer un message.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const { data, error } = await backend.rpc('send_message', {
        p_room_id: room, p_id: id, p_body: validateText(text), p_language: language,
      }).abortSignal(controller.signal);
      if (error) throw error;
      if (!data[0]) throw new Error('Le serveur n’a pas confirmé l’envoi. Réessaie.');
      if (selectedRoom.current === room) setMessages((previous) => mergeMessages(previous, data));
    } finally {
      clearTimeout(timeout);
    }
  }

  async function loadOlder() {
    if (!backend || !roomId || !messages.length || loadingOlder) return;
    const selected = roomId;
    setLoadingOlder(true);
    const { data, error } = await backend.from('messages').select('*')
      .eq('room_id', roomId).lt('sequence', messages[0].sequence)
      .order('sequence', { ascending: false }).limit(PAGE_SIZE);
    if (selectedRoom.current !== selected) return;
    setLoadingOlder(false);
    if (error) setError(`Historique indisponible : ${error.message}`);
    else {
      setMessages((previous) => mergeMessages(previous, data));
      setHasOlder(data.length === PAGE_SIZE);
    }
  }

  async function refresh() {
    try {
      await loadRooms();
      await refreshMessages.current?.();
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  return {
    userId, rooms, roomId, setRoomId, messages: messages.filter((message) => message.room_id === roomId),
    connecting, connection, error, setError, loadingMessages,
    connect, createRoom, joinRoom, invite, sendMessage, refresh, hasOlder, loadOlder, loadingOlder,
  };
}
