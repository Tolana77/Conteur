# Déploiement de la passerelle IA sur Vercel

Le frontend Vite et les fonctions IA peuvent être déployés ensemble sur
Vercel. Les routes publiques restent `POST /api/mj` et
`GET /api/mj-health`, donc React ne dépend pas de l'hébergeur.

## Architecture

- `server/ai/` contient la logique commune et testable de la passerelle ;
- `api/` contient les adaptateurs Vercel ;
- `netlify/functions/` contient temporairement les adaptateurs Netlify pour
  permettre un retour arrière pendant la migration.

Ne mets jamais la clé du fournisseur dans une variable commençant par
`VITE_` : ces variables sont intégrées au code envoyé au navigateur.

## Créer le projet Vercel

1. Dans Vercel, choisis **Add New > Project**.
2. Importe le dépôt GitHub `Tolana77/Conteur`.
3. Vérifie que le framework détecté est **Vite**.
4. Utilise `npm run build` comme commande de build et `dist` comme dossier de
   sortie.
5. Ne modifie pas le dossier racine du projet.

Vercel détecte automatiquement les fichiers de `api/` comme fonctions Node.js.
Le fichier `vercel.json` du dépôt verrouille le framework, la commande de build
et le dossier de sortie. Dans **Settings > Build and Deployment**, le champ
**Root Directory** doit rester vide : il ne doit surtout pas contenir `dist`.

## Variables d'environnement

Ajoute les variables suivantes dans **Project Settings > Environment
Variables** :

- `AI_GATEWAY_ENABLED` : `true`
- `AI_PROVIDER_URL` : endpoint compatible OpenAI, par exemple
  `https://api.groq.com/openai/v1/chat/completions`
- `AI_PROVIDER_API_KEY` : clé secrète du fournisseur
- `AI_PROVIDER_MODEL` : identifiant exact du modèle
- `AI_PROVIDER_MAX_TOKENS` : `700`
- `AI_ALLOWED_ORIGIN` : origines supplémentaires exactes, séparées par des
  virgules (facultatif sur Vercel si les variables système sont exposées)
- `AI_MAX_REQUESTS_PER_MINUTE` : `12`

Pour activer les salons multijoueurs, ajoute également les deux variables
publiques décrites dans [`MULTIPLAYER_SETUP.md`](MULTIPLAYER_SETUP.md) :
`VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`.

Dans **Settings > Environment Variables**, active **Automatically expose
System Environment Variables**. La passerelle autorise alors automatiquement
les valeurs exactes de `VERCEL_URL`, `VERCEL_BRANCH_URL` et
`VERCEL_PROJECT_PRODUCTION_URL` : un nouveau déploiement Preview fonctionne
sans modifier `AI_ALLOWED_ORIGIN`. Garde dans cette dernière variable uniquement
les domaines externes supplémentaires (par exemple
`https://jeu.example,https://localhost.example`). Aucun joker
`*.vercel.app` n'est accepté.

Utilise de préférence l'alias de production stable affiché dans **Domains** pour
les joueurs et les favoris. Après toute modification manuelle des variables,
relance un déploiement.

## Validation avant bascule

1. Ouvre `https://<deploiement-vercel>/api/mj-health`.
2. Vérifie que la réponse contient `"ok": true` sans jamais exposer la clé.
3. Envoie un message depuis l'écran Lecture.
4. Vérifie le statut, le modèle et les tokens dans le Journal API de la console
   administrateur.
5. Vérifie qu'une origine différente reçoit bien une erreur 403.

## Diagnostic d'une route absente ou en erreur

Teste directement `https://<deploiement-vercel>/api/mj-health` dans un nouvel
onglet, sans passer par l'application :

- une page HTML ou une erreur 404 signifie que Vercel n'a pas construit la
  fonction. Vérifie le **Root Directory**, puis que le déploiement contient bien
  `api/mj-health.mjs` dans l'onglet **Functions** ;
- `FUNCTION_INVOCATION_FAILED` signifie que la fonction existe mais a levé une
  erreur. Consulte **Observability > Runtime Logs** et filtre sur
  `/api/mj-health` ;
- un JSON avec `"ok": false` et une configuration incomplète signifie que la
  fonction fonctionne, mais qu'une variable d'environnement manque ;
- un JSON avec `providerStatus` différent de `200` signifie que Groq a répondu
  avec une erreur : vérifie la clé, l'URL et le modèle indiqués dans le JSON.

Le serveur lancé par `npm run dev` est Vite uniquement : sur
`http://127.0.0.1:5175`, les routes Vercel `/api/*` ne sont pas disponibles.
Pour tester l'API, utilise l'URL publique Vercel ou `vercel dev` avec les
variables locales appropriées.

## Données locales et domaine

Le `localStorage` dépend de l'origine du site. Les campagnes enregistrées sur
une adresse `*.netlify.app` ne seront donc pas visibles sur une adresse
`*.vercel.app`.

Avant la bascule, exporte les campagnes ou conserve le même domaine personnalisé
en changeant seulement sa destination DNS. Garde le site Netlify disponible
jusqu'à ce que la sauvegarde et le nouveau déploiement soient validés.

## Fin de migration

Après quelques jours sans erreur sur Vercel :

1. retire `netlify.toml` et `netlify/functions/` ;
2. remplace la documentation Netlify par ce guide ;
3. déconnecte le dépôt de Netlify ;
4. conserve une exportation locale récente des campagnes.

La limite par minute reste locale à chaque instance serverless. Avant une
ouverture multijoueur publique, ajoute une authentification et une limitation
persistante par utilisateur.
