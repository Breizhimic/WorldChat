import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Message, Room } from './database';
import { Icon } from './Icon';
import type { Preferences } from './preferences';
import { languages, MAX_CHARACTERS, type Language } from './translation';
import { useIncomingTranslations, type IncomingTranslation } from './useIncomingTranslations';
import { errorMessage } from './useChat';

function MessageBubble({ message, own, translation, target, onRetry }: {
  message: Message; own: boolean; translation?: IncomingTranslation; target: Language; onRetry: () => void;
}) {
  const [original, setOriginal] = useState(false);
  const translated = !own && translation?.phase === 'done';
  return (
    <article className={`message ${own ? 'own' : 'received'}`} aria-label={own ? 'Message envoyé' : `Message de ${message.sender_name}`}>
      {!own && <span className="message-author">{message.sender_name}</span>}
      <p lang={translated && !original ? target : message.language}>
        {translated && !original ? translation.text : message.body}
      </p>
      {!own && translation && (
        <div className="translation-note">
          {translation.phase === 'done' ? (
            <button onClick={() => setOriginal(!original)}>
              <Icon name="globe" /> {original ? 'Voir la traduction' : `Traduit · voir l’original (${languages[message.language].name})`}
            </button>
          ) : translation.phase === 'error' ? (
            <div role="alert"><span>{translation.message}</span><button onClick={onRetry}>Réessayer la traduction</button></div>
          ) : <span role="status">{translation.message}</span>}
        </div>
      )}
      <div className="message-meta">
        <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</time>
        {own && <><span>Envoyé</span><Icon name="check" /></>}
      </div>
    </article>
  );
}

export function ChatView({ room, userId, messages, preferences, online, connection, onBack, onInvite,
  onSettings, onRefresh, onSend, hasOlder, loadOlder, loadingOlder, loadingMessages }: {
  room: Room; userId: string; messages: Message[]; preferences: Preferences; online: boolean;
  connection: 'connecting' | 'live' | 'disconnected';
  onBack: () => void; onInvite: () => void; onSettings: () => void; onRefresh: () => void;
  onSend: (room: string, id: string, text: string, language: Language) => Promise<void>;
  hasOlder: boolean; loadOlder: () => Promise<void>; loadingOlder: boolean;
  loadingMessages: boolean;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const pending = useRef<{ id: string; text: string; language: Language } | null>(null);
  const sendingRef = useRef(false);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const { translations, retry } = useIncomingTranslations(messages, userId, preferences.readLanguage, preferences.autoTranslate);
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [lastId, translations]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || sendingRef.current || !online) return;
    sendingRef.current = true;
    setSending(true);
    setSendError('');
    if (!pending.current || pending.current.text !== text || pending.current.language !== preferences.writeLanguage) {
      pending.current = { id: crypto.randomUUID(), text, language: preferences.writeLanguage };
    }
    try {
      await onSend(room.id, pending.current.id, text, preferences.writeLanguage);
      setText('');
      pending.current = null;
      follow.current = true;
    } catch (error) {
      setSendError(`Message non confirmé : ${errorMessage(error)} Ton texte est conservé ; réessaie.`);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  return (
    <section className="conversation" aria-label={`Conversation ${room.name}`}>
      <header className="conversation-header">
        <button className="icon-button mobile-back" onClick={onBack} aria-label="Retour aux conversations"><Icon name="back" /></button>
        <div className="avatar room-avatar">{room.name.slice(0, 2).toUpperCase()}</div>
        <div className="conversation-title"><h2>{room.name}</h2><span>Salon privé · sur invitation</span></div>
        <button className="icon-button" onClick={onRefresh} aria-label="Actualiser les messages"><Icon name="refresh" /></button>
        {room.owner_id === userId && <button className="icon-button" onClick={onInvite} aria-label="Inviter dans le salon"><Icon name="link" /></button>}
      </header>
      <button className="reading-bar" onClick={onSettings}>
        <Icon name="globe" />
        <span>Je lis en <strong>{languages[preferences.readLanguage].name}</strong> · traduction {preferences.autoTranslate ? 'automatique' : 'désactivée'}</span>
        <Icon name="settings" />
      </button>
      {connection !== 'live' && <div className="connection-note" role="status">
        {connection === 'connecting' ? 'Connexion au temps réel…' : 'Temps réel interrompu. Les messages restent sur le serveur ; actualise pour les retrouver.'}
      </div>}
      <div className="message-list" ref={scroll} role="log" aria-label="Messages du salon" aria-live="polite" onScroll={() => {
        if (scroll.current) follow.current = scroll.current.scrollHeight - scroll.current.scrollTop - scroll.current.clientHeight < 100;
      }}>
        <p className="privacy-note">Les originaux sont stockés dans Supabase. La traduction reste sur ton appareil. Pas de chiffrement de bout en bout pour le moment.</p>
        {hasOlder && <button className="history-button" disabled={loadingOlder} onClick={() => { void loadOlder(); }}>{loadingOlder ? 'Chargement…' : 'Voir les messages précédents'}</button>}
        {!messages.length && <div className="empty-messages"><Icon name="chat" /><p>{loadingMessages ? 'Chargement des messages…' : 'Le début de votre conversation.'}</p><span>{loadingMessages ? 'Récupération de l’historique du salon.' : 'Envoie le premier message ou invite quelqu’un.'}</span></div>}
        {messages.map((message) => <MessageBubble
          key={message.id} message={message} own={message.sender_id === userId}
          target={preferences.readLanguage} translation={translations[message.id]} onRetry={() => retry(message.id)}
        />)}
      </div>
      <div className="composer-area">
        {sendError && <p className="inline-error" role="alert">{sendError}</p>}
        {!online && <p className="inline-error" role="status">Hors connexion. Ton message ne sera envoyé qu’après ton retour en ligne et un nouvel appui sur Envoyer.</p>}
        <form className="composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="message">Ton message</label>
          <textarea id="message" value={text} maxLength={MAX_CHARACTERS} rows={1} disabled={sending}
            placeholder="Écris un message…" onChange={(event) => {
              setText(event.target.value);
              pending.current = null;
              setSendError('');
            }} />
          <button className="send-button" type="submit" disabled={sending || !online || !text.trim()} aria-label="Envoyer le message"><Icon name="send" /></button>
        </form>
        <div className="composer-meta"><span>Envoi de l’original en {languages[preferences.writeLanguage].name} · traduction chez le destinataire</span><span>{text.length}/{MAX_CHARACTERS}</span></div>
      </div>
    </section>
  );
}
