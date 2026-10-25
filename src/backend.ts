import { createClient } from '@supabase/supabase-js';
import type { Database } from './database';

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

function configurationError(): string | null {
  if (!url || !key) return 'Supabase n’est pas encore configuré. Aucun message ne peut être envoyé.';
  try {
    if (new URL(url).protocol !== 'https:') return 'L’URL Supabase doit utiliser HTTPS.';
  } catch {
    return 'L’URL Supabase est invalide.';
  }
  if (!key.startsWith('sb_publishable_')) {
    return 'Utilise une clé publique Supabase « publishable », jamais une clé secrète.';
  }
  return null;
}

export const backendError = configurationError();
export const backend = !backendError && url && key
  ? createClient<Database>(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;

let authentication: Promise<string> | undefined;

export function connectSession(): Promise<string> {
  if (!authentication) {
    authentication = (async () => {
      if (!backend) throw new Error('Supabase n’est pas configuré.');
      const session = await backend.auth.getSession();
      if (session.error) throw session.error;
      if (session.data.session) return session.data.session.user.id;
      const result = await backend.auth.signInAnonymously();
      if (result.error) throw result.error;
      if (!result.data.user) throw new Error('Le serveur n’a pas créé de session.');
      return result.data.user.id;
    })().finally(() => { authentication = undefined; });
  }
  return authentication;
}
