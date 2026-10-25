import { useEffect, useState, type FormEvent } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { backendError } from './backend';
import { ChatView } from './ChatView';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { Install } from './Install';
import {
  defaults, invitationLink, invitationToken, readPreferences, savePreferences, type Preferences,
} from './preferences';
import { languages, type Language } from './translation';
import { errorMessage, useChat } from './useChat';

function initialPreferences() {
  try { return { preferences: readPreferences(), error: '' }; }
  catch (error) { return { preferences: defaults, error: errorMessage(error) }; }
}

function LanguageSelect({ label, value, onChange }: { label: string; value: Language; onChange: (value: Language) => void }) {
  return <label className="field">{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as Language)}>
    <option value="fr">Français</option><option value="en">English</option>
  </select></label>;
}

export function App() {
  const [initial] = useState(initialPreferences);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [preferenceError, setPreferenceError] = useState(initial.error);
  const [online, setOnline] = useState(navigator.onLine);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'join' | 'settings' | 'invite' | 'setup' | null>(
    () => location.hash.startsWith('#invite=') ? 'join' : null,
  );
  const [formValue, setFormValue] = useState(() => location.hash.replace(/^#invite=/, ''));
  const [modalError, setModalError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [registrationError, setRegistrationError] = useState('');
  const chat = useChat();
  const room = chat.rooms.find((item) => item.id === chat.roomId);
  const ready = Boolean(chat.userId) && !chat.connecting && !backendError;
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisterError(error: unknown) {
      setRegistrationError(`Le mode hors connexion de l’interface n’a pas pu être activé : ${errorMessage(error)}`);
    },
  });

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const hash = () => {
      if (location.hash.startsWith('#invite=')) {
        setFormValue(location.hash.slice('#invite='.length));
        setModalError('');
        setModal('join');
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('hashchange', hash);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('hashchange', hash);
    };
  }, []);

  function updatePreferences(next: Preferences) {
    setPreferences(next);
    try {
      savePreferences(next);
      setPreferenceError('');
    } catch {
      setPreferenceError('Tes choix sont appliqués mais le navigateur refuse de les enregistrer. Ils seront perdus à la fermeture.');
    }
  }

  function open(next: typeof modal) {
    setModalError('');
    setFormValue('');
    setLink('');
    setCopied(false);
    setModal(next);
  }

  async function submitRoom(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setModalError('');
    try {
      if (modal === 'create') await chat.createRoom(formValue, preferences.nickname);
      else {
        await chat.joinRoom(invitationToken(formValue), preferences.nickname);
        history.replaceState(null, '', location.pathname + location.search);
      }
      setModal(null);
    } catch (error) {
      setModalError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function createInvitation() {
    if (!room || busy) return;
    setBusy(true);
    setModalError('');
    setCopied(false);
    setLink('');
    try { setLink(invitationLink(await chat.invite(room.id))); }
    catch (error) { setModalError(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function copyInvitation() {
    try {
      if (!navigator.clipboard) throw new Error('Presse-papiers indisponible.');
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setModalError('La copie a échoué. Sélectionne le lien et copie-le manuellement.');
    }
  }

  return (
    <div className="messenger-page">
      <header className="page-header">
        <a className="brand" href={import.meta.env.BASE_URL}><img src={`${import.meta.env.BASE_URL}icon.svg`} width="34" height="34" alt="" />WorldChat<span>.</span></a>
        <span className="project-tag">Les langues changent. Le lien reste.</span>
      </header>

      {backendError && <aside className="setup-banner" role="status">
        <span><strong>La messagerie attend sa connexion.</strong> {backendError}</span>
        <button onClick={() => open('setup')}>Configurer Supabase <span aria-hidden="true">↗</span></button>
      </aside>}
      {(preferenceError || registrationError || chat.error) && <div className="global-error" role="alert">
        {preferenceError || registrationError || chat.error}
        {chat.error && <button onClick={() => { void chat.connect(); }}>Réessayer la connexion</button>}
      </div>}
      {needRefresh && <div className="update-banner">Une nouvelle version est prête. <button onClick={() => {
        void updateServiceWorker(true).catch((error) => setRegistrationError(errorMessage(error)));
      }}>Mettre à jour (les brouillons seront perdus)</button></div>}

      <main className={`messenger ${room ? 'room-open' : ''}`}>
        <aside className="sidebar" aria-label="Conversations">
          <div className="sidebar-heading"><div><p className="eyebrow">TON PETIT MONDE</p><h1>Conversations<span>.</span></h1></div>
            <button className="icon-button new-room" aria-label="Créer un salon" disabled={!ready} onClick={() => open('create')}><Icon name="plus" /></button>
          </div>
          <label className="search-field"><Icon name="chat" /><input aria-label="Rechercher un salon" placeholder="Trouver une conversation" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <div className="room-actions"><button disabled={!ready} onClick={() => open('create')}><Icon name="plus" />Nouveau salon</button><button disabled={!ready} onClick={() => open('join')}><Icon name="link" />Rejoindre</button></div>
          <div className="rooms">
            {chat.rooms.filter((item) => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((item) => (
              <button key={item.id} className={`room-item ${room?.id === item.id ? 'selected' : ''}`} onClick={() => chat.setRoomId(item.id)}>
                <span className="avatar room-avatar">{item.name.slice(0, 2).toUpperCase()}</span>
                <span><strong>{item.name}</strong><small>Salon sur invitation</small></span><span className="room-arrow">›</span>
              </button>
            ))}
            {!chat.rooms.length && <div className="empty-rooms"><span className="empty-icon"><Icon name="chat" /></span><h2>Tout commence par un bonjour.</h2><p>{chat.connecting ? 'Connexion à tes salons…' : 'Crée un salon et invite quelqu’un. Vos conversations apparaîtront ici.'}</p></div>}
            {chat.rooms.length > 0 && !chat.rooms.some((item) => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) && <p className="no-results">Aucun salon ne correspond.</p>}
          </div>
          <button className="profile-button" onClick={() => open('settings')}>
            <span className="avatar profile-avatar">{preferences.nickname.slice(0, 2).toUpperCase() || 'TO'}</span>
            <span><strong>{preferences.nickname || 'Ton profil'}</strong><small>{chat.connecting ? 'Connexion…' : chat.userId ? 'Session connectée' : 'Non connecté'} · {languages[preferences.readLanguage].name}</small></span>
            <Icon name="settings" />
          </button>
        </aside>

        {room && chat.userId ? <ChatView key={room.id} room={room} userId={chat.userId} messages={chat.messages}
          preferences={preferences} online={online} connection={chat.connection} onBack={() => chat.setRoomId(null)}
          loadingMessages={chat.loadingMessages}
          onInvite={() => open('invite')} onSettings={() => open('settings')} onRefresh={() => { void chat.refresh(); }}
          onSend={chat.sendMessage} hasOlder={chat.hasOlder} loadOlder={chat.loadOlder} loadingOlder={chat.loadingOlder} />
          : <section className="welcome-pane">
            <div className="welcome-illustration"><Icon name="chat" /><span><Icon name="globe" /></span></div>
            <p className="eyebrow">UNE CONVERSATION, PLUSIEURS LANGUES</p>
            <h2>Écris comme tu es.<br /><span>On se comprend.</span></h2>
            <p>Ton message part dans sa langue d’origine.<br />Chacun le reçoit, puis le traduit sur son appareil.</p>
            <button className="primary-button" disabled={!ready} onClick={() => open('create')}><Icon name="plus" />Commencer une conversation</button>
            <span className="welcome-note"><Icon name="globe" />Français et anglais pour commencer</span>
            <div className="privacy-footer">Salons sur invitation · Traduction locale · Sans API payante</div>
          </section>}
      </main>
      <footer className="page-footer"><span>Un projet pour apprendre à se comprendre.</span><button onClick={() => open('settings')}>Installation & préférences ↗</button></footer>

      {!preferences.nickname && <Dialog title="D’abord, un petit bonjour."><section className="onboarding">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} width="52" height="52" alt="" />
        <p className="eyebrow">BIENVENUE DANS WORLDCHAT</p>
        <p>Choisis un pseudo pour tes salons. Pas de numéro de téléphone, pas de mot de passe pour cette première version.</p>
        <form onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const nickname = String(data.get('nickname') ?? '').trim();
          if (nickname) updatePreferences({ ...preferences, nickname });
        }}>
          <label className="field">Ton pseudo<input autoFocus name="nickname" placeholder="Comment t’appelle-t-on ?" required minLength={1} maxLength={30} autoComplete="nickname" /></label>
          <button className="primary-button" type="submit">Ouvrir mes conversations <span aria-hidden="true">→</span></button>
        </form>
        <small>Ta session appartient à ce navigateur. Effacer ses données peut te faire perdre l’accès aux salons.</small>
      </section></Dialog>}

      {preferences.nickname && modal && <Dialog title={
        modal === 'create' ? 'Un nouveau salon' : modal === 'join' ? 'Rejoindre la conversation' :
          modal === 'settings' ? 'À ta façon' : modal === 'invite' ? 'Inviter dans le salon' : 'Connecter la messagerie'
      } busy={busy} onClose={() => setModal(null)}>
        {(modal === 'create' || modal === 'join') && <form onSubmit={(event) => { void submitRoom(event); }}>
          <p>{modal === 'create' ? 'Un espace privé pour parler, chacun dans sa langue.' : 'Colle le lien ou le code partagé par la personne qui a créé le salon.'}</p>
          <label className="field">{modal === 'create' ? 'Nom du salon' : 'Lien ou code d’invitation'}
            <input autoFocus required maxLength={modal === 'create' ? 60 : 2048} value={formValue} disabled={busy} onChange={(event) => setFormValue(event.target.value)} placeholder={modal === 'create' ? 'Le prochain voyage…' : 'https://…/WorldChat/#invite=…'} />
          </label>
          {modalError && <p className="inline-error" role="alert">{modalError}</p>}
          <button className="primary-button" disabled={busy || !ready || !formValue.trim()} type="submit">{busy ? 'Un instant…' : modal === 'create' ? 'Créer le salon' : 'Rejoindre le salon'}</button>
          {!ready && <p className="inline-error">Connecte d’abord l’application à Supabase pour rejoindre ou créer un salon.</p>}
        </form>}
        {modal === 'invite' && <div>
          <p>Le lien permet de rejoindre ce salon pendant 7 jours. Partage-le uniquement avec les personnes souhaitées.</p>
          <button className="primary-button" disabled={busy} onClick={() => { void createInvitation(); }}>{busy ? 'Création…' : 'Créer un lien (invalide le précédent)'}</button>
          {link && <div className="invitation-result"><label className="field">Lien d’invitation<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label>
            <button className="secondary-button" onClick={() => { void copyInvitation(); }}>{copied ? 'Lien copié' : 'Copier le lien'}</button>
          </div>}
          {modalError && <p className="inline-error" role="alert">{modalError}</p>}
        </div>}
        {modal === 'settings' && <div>
          <p>Tu envoies toujours le texte original. La langue de lecture ne change que les messages reçus sur cet appareil.</p>
          <div className="language-settings">
            <LanguageSelect label="J’écris en" value={preferences.writeLanguage} onChange={(writeLanguage) => updatePreferences({ ...preferences, writeLanguage })} />
            <LanguageSelect label="Je lis en" value={preferences.readLanguage} onChange={(readLanguage) => updatePreferences({ ...preferences, readLanguage })} />
          </div>
          <label className="translation-switch"><input type="checkbox" checked={preferences.autoTranslate} onChange={(event) => updatePreferences({ ...preferences, autoTranslate: event.target.checked })} /><span>Traduire automatiquement les messages reçus</span></label>
          <p className="settings-note">Le premier essai télécharge un modèle volumineux (potentiellement plus de 100 Mo par sens). Privilégie le Wi-Fi. Désactiver cette option annule les traductions en cours, jamais les envois.</p>
          <p className="settings-note">Seuls les messages reçus dans l’autre langue sont traduits. Tes propres messages restent tels que tu les as écrits. Les traductions ne sont pas envoyées au serveur.</p>
          <Install />
        </div>}
        {modal === 'setup' && <div className="setup-instructions">
          <p>GitHub Pages héberge l’interface, pas les messages. Il faut configurer une fois un projet <strong>Supabase Free</strong>.</p>
          <ol><li>Créer le projet et activer les connexions anonymes.</li><li>Exécuter le fichier <code>supabase/migrations/202610250001_chat.sql</code> dans le SQL Editor.</li><li>Ajouter l’URL et la clé publique publishable dans les variables GitHub Actions indiquées dans le README.</li><li>Relancer le déploiement sur main.</li></ol>
          <a className="secondary-button" href="https://github.com/Breizhimic/WorldChat#configurer-supabase" target="_blank" rel="noreferrer">Voir le guide dans le README ↗</a>
          <p className="settings-note">Ne fournis jamais de clé secrète ou service_role. Aucun échange réel n’est simulé en attendant.</p>
        </div>}
      </Dialog>}
    </div>
  );
}
