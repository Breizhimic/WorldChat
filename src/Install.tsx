import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function Install() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches);
  const [error, setError] = useState('');

  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setInstalled(media.matches);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    media.addEventListener('change', onChange);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      media.removeEventListener('change', onChange);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function install() {
    if (!prompt) return;
    try {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
    } catch {
      setPrompt(null);
      setError('Installation impossible depuis ce bouton. Utilise le menu de ton navigateur.');
    }
  }

  return (
    <section className="install-card" aria-labelledby="install-title">
      <span className="install-symbol" aria-hidden="true">↗</span>
      <div>
        <h2 id="install-title">{installed ? 'WorldChat est sur ton écran d’accueil' : 'Un site, une vraie place sur ton écran'}</h2>
        <p>{installed ? 'Tu utilises la version installée. Aucun store nécessaire.' : 'Sur iPhone : ouvre dans Safari, puis Partager → Sur l’écran d’accueil. Sur Android : menu du navigateur → Installer l’application ou Ajouter à l’écran d’accueil.'}</p>
        {prompt && !installed && <button className="text-button" onClick={install}>Installer WorldChat ↗</button>}
        {error && <p role="alert">{error}</p>}
      </div>
    </section>
  );
}
