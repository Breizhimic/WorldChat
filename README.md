# WorldChat

Une messagerie multilingue sur invitation, installable sur iPhone et Android
depuis un site web. Chacun ecrit dans sa langue ; **seul le destinataire traduit
les messages recus**, sur son appareil, dans sa langue de lecture.

## Ce qui est implemente

- Interface de messagerie : liste des salons, conversation, bulles et champ d'envoi.
- Pseudo et session Supabase anonyme, sans email, telephone ni mot de passe.
- Creation de salons prives et acces reserve aux membres par des politiques SQL.
- Invitations valables 7 jours. Seul le createur peut generer un lien ; un nouveau
  lien invalide le precedent, sans exclure les membres qui l'ont deja utilise.
- Envoi du **texte original** avec sa langue et son auteur. Le serveur confirme
  son stockage avant que l'interface l'affiche comme envoye.
- Reception en temps reel, historique pagine et rattrapage apres reconnexion.
- Traduction locale francais / anglais des messages recus, apres activation
  explicite dans les preferences. Les propres messages ne sont jamais traduits.
- Acces a l'original, nouvelle tentative apres erreur de traduction et annulation
  des traductions en desactivant l'option. L'envoi n'attend jamais la traduction.
- PWA et workflow de publication GitHub Pages.

**Sans configuration Supabase, aucun message n'est envoye ni simule.**
Le projet Supabase est configure ; la migration de chat est appliquee et les
variables de build GitHub sont definies. Les tests locaux ne constituent pas un
essai de deux telephones connectes ensemble.

## Architecture et gratuite

| Partie | Solution |
| --- | --- |
| Interface | React, TypeScript, Vite et PWA |
| Hebergement statique | GitHub Pages, depot public |
| Comptes temporaires, donnees et temps reel | Supabase Free |
| Traduction | Transformers.js, OPUS-MT quantifie, WebAssembly dans un Web Worker |

Pas d'API de traduction payante ni de serveur d'inference. Le premier essai peut
telecharger plus de 100 Mo par sens de traduction : privilegier le Wi-Fi.
Les modeles proviennent de Hugging Face, le moteur de jsDelivr.
Supabase Free reste soumis a ses quotas et peut mettre le projet en pause apres
inactivite. Ne pas activer une offre payante pour ce prototype.

## Configurer Supabase

### 1. Creer le projet gratuit

Sur [Supabase](https://supabase.com/dashboard), creer une organisation/projet
sur l'offre **Free**. Conserver le mot de passe de la base pour soi : il n'est
jamais utilise dans le frontend ou dans les variables GitHub de ce projet.
Attendre que le projet soit disponible.

### 2. Activer les sessions anonymes

Dans **Authentication > Sign In / Providers**, activer **Anonymous Sign-Ins**
(le libelle exact du menu peut varier). Aucune connexion par SMS ni service
d'envoi d'emails n'est necessaire.

Une session anonyme utilise le role SQL `authenticated`, et non `anon`.
Effacer les donnees du navigateur, changer d'appareil ou perdre la session fait
perdre l'identite associee aux salons. Il faudra une nouvelle invitation pour
les rejoindre. Le createur perd aussi son role de createur si sa session est
perdue : pas encore de recuperation de compte.

### 3. Installer les tables et les droits

Ouvrir **SQL Editor**, creer une requete et y executer **une seule fois**, dans
un projet neuf, le contenu de :

[`supabase/migrations/20261025223537_worldchat_messaging.sql`](supabase/migrations/20261025223537_worldchat_messaging.sql)

Ce fichier cree les tables, leurs contraintes, les fonctions d'ecriture, les
politiques RLS et active la publication Realtime des messages. Il s'execute dans
une transaction et doit terminer sans erreur. Ne pas supprimer les politiques
RLS pour depanner une erreur d'acces.

Les invitations ne sont pas lisibles directement par les clients. Leur code
aleatoire est transmis dans le fragment `#invite=...` du lien, pas dans un chemin
de page ou une requete envoyee a GitHub Pages. Toute personne possedant un lien
encore valide peut rejoindre le salon : le partager avec precaution.

### 4. Recuperer uniquement la configuration publique

Dans les parametres du projet / **Connect / API Keys**, recuperer :

- l'URL du projet, de la forme `https://xxxxxxxx.supabase.co` ;
- la cle **publishable**, commencant par `sb_publishable_`.

**Jamais de cle `sb_secret_`, `service_role` ou de mot de passe de base de
donnees dans cette application.** La cle publishable est volontairement visible
dans le navigateur. Ce sont l'authentification et les politiques SQL qui
protegent les messages.

### 5. Brancher l'application locale

Copier `.env.example` dans `.env.local`, puis renseigner :

```dotenv
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Redemarrer le serveur Vite apres toute modification de ce fichier. Les fichiers
`.env.local` sont ignores par Git. L'application valide la configuration et
affiche une erreur explicite si elle est absente ou incorrecte.

### 6. Brancher GitHub Pages

Le depot est public et Pages est active avec **GitHub Actions**.
Dans le depot GitHub :

**Settings > Secrets and variables > Actions > Variables > New repository variable**

Ajouter les deux variables publiques :

| Nom | Valeur |
| --- | --- |
| `VITE_SUPABASE_URL` | L'URL du projet Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | La cle publishable |

Ces variables sont injectees **au moment du build**. Une modification necessite
un nouveau deploiement. Le workflow `.github/workflows/pages.yml` publie le code
de `main` apres les controles ; il peut aussi etre lance manuellement sur `main`.
Le code de cette branche doit donc d'abord etre integre dans `main`.

Adresse du site une fois ce code deploye :
[breizhimic.github.io/WorldChat](https://breizhimic.github.io/WorldChat/).
La configuration `/WorldChat/` est presente dans Vite et le manifeste PWA.
GitHub Pages n'heberge ni base de donnees ni serveur de messagerie.

### 7. Essayer a deux

1. Ouvrir le site sur deux telephones ou dans deux navigateurs/profils distincts.
   Deux onglets d'un meme profil partagent normalement la meme session.
2. Choisir un pseudo sur chaque appareil.
3. Sur le premier, creer un salon puis utiliser le bouton d'invitation dans son
   en-tete. Generer un lien et le partager au second.
4. Sur le second, ouvrir le lien et confirmer **Rejoindre le salon**.
5. Dans les preferences, choisir les langues d'ecriture et de lecture. Activer
   **Traduire automatiquement les messages recus** sur le destinataire.
6. Envoyer un message. L'expediteur voit son original ; le destinataire voit
   d'abord l'original, puis sa traduction si les langues different.

Exemple : Alice ecrit en francais, Bob lit en anglais. Le serveur conserve
`Bonjour !` et `fr`. Alice voit `Bonjour !`. Le navigateur de Bob traduit ce
texte en anglais ; cette traduction n'est jamais enregistree sur le serveur.

## Developper et verifier

Prerequis : Node.js 22.12+ (24 recommande) et npm.

```sh
npm ci
npm run icons
npm run dev
```

Ouvrir `http://localhost:5173/WorldChat/`.
Le serveur de developpement est accessible sur le reseau local, mais HTTPS est
necessaire pour tester l'installation PWA sur telephone. Utiliser Pages pour
ce test. Sur iPhone : Safari > Partager > Sur l'ecran d'accueil.
Sur Android : menu du navigateur > Installer ou Ajouter a l'ecran d'accueil.

```sh
npm run typecheck
npm test
npm run build:test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Les tests SQL utilisent PostgreSQL embarque (PGlite) avec un schema d'authentification
minimal. Ils controlent l'isolation des salons, les droits, les invitations,
la validation et l'idempotence des envois. Ils ne testent pas le service Realtime
heberge. Les tests de composants verifient que seuls les messages recus sont
traduits et que l'envoi conserve l'original, meme pendant une traduction.

Les tests navigateur utilisent automatiquement le mode `test`, avec des valeurs
vides dans `.env.test`. Ils verifient l'etat non connecte sans creer de faux
utilisateurs ni contacter le projet Supabase reel, meme si `.env.local` existe.
Le site de production conserve le build standard `npm run build` :

```powershell
npm run build:test
npm run test:e2e
```

Le workflow CI construit et teste le mode `test`, puis reconstruit le site en
mode production avec les variables publiques pour la publication.

Pour verifier aussi le vrai moteur de traduction dans les deux sens et apres
une reouverture hors connexion (telechargement volumineux) :

```powershell
$env:REAL_TRANSLATION = '1'
npm run test:e2e -- --grep "real local translation"
Remove-Item Env:REAL_TRANSLATION
```

## Limites du prototype

- Pas de chiffrement de bout en bout : les originaux sont stockes dans Supabase
  et accessibles aux operateurs du backend. La traduction locale n'y change rien.
- Pas encore de notifications push, pieces jointes, appels, reactions, moderation,
  exclusion de membres ou recuperation de compte. Pas de statut "lu" ou "livre" :
  **Envoye** signifie seulement que le serveur a confirme le stockage.
- Pas de file d'envoi hors connexion ni d'historique local persistant. Un echec
  conserve le texte dans le champ courant et la nouvelle tentative reutilise son
  identifiant pour eviter les doublons. Les brouillons restent volatils.
- Les langues sont declarees par l'expediteur. Pas encore de detection automatique.
- Maximum 300 caracteres par message. Historique charge par pages de 50 messages.
- Traductions sequentielles pour limiter la memoire. Desactiver la traduction ou
  quitter la conversation annule la file. Les caches peuvent etre supprimes par
  le navigateur ; le fonctionnement hors connexion n'est pas garanti.
- La vitesse et la qualite doivent encore etre mesurees sur les vrais telephones.
  WebKit automatise n'est pas un vrai iPhone.
- Avant une diffusion ouverte : ajouter des protections anti-abus, une moderation
  et une strategie de comptes durables. Ne pas utiliser pour des conversations
  sensibles. Les quotas gratuits ne constituent pas une protection anti-abus.

## Modeles et bibliotheques

- [Supabase JS](https://supabase.com/docs/reference/javascript/introduction).
- [Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous).
- [Transformers.js](https://huggingface.co/docs/transformers.js) (Apache-2.0).
- [OPUS-MT fr-en](https://huggingface.co/Helsinki-NLP/opus-mt-fr-en) et
  [OPUS-MT en-fr](https://huggingface.co/Helsinki-NLP/opus-mt-en-fr) (Apache-2.0),
  distribues en ONNX par
  [Xenova/fr-en](https://huggingface.co/Xenova/opus-mt-fr-en) et
  [Xenova/en-fr](https://huggingface.co/Xenova/opus-mt-en-fr).

`demo.erl` et `rebar.lock` sont les vestiges de l'experimentation initiale de
2024 ; ils ne sont pas utilises par la PWA.
