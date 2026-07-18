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

## Variables d'environnement

Ajoute les variables suivantes dans **Project Settings > Environment
Variables** :

- `AI_GATEWAY_ENABLED` : `true`
- `AI_PROVIDER_URL` : endpoint compatible OpenAI, par exemple
  `https://api.groq.com/openai/v1/chat/completions`
- `AI_PROVIDER_API_KEY` : clé secrète du fournisseur
- `AI_PROVIDER_MODEL` : identifiant exact du modèle
- `AI_PROVIDER_MAX_TOKENS` : `700`
- `AI_ALLOWED_ORIGIN` : URL publique exacte, sans slash final
- `AI_MAX_REQUESTS_PER_MINUTE` : `12`

Configure `AI_ALLOWED_ORIGIN` séparément pour **Preview** et **Production** si
tu souhaites tester les déploiements de prévisualisation. Après toute
modification des variables, relance un déploiement.

## Validation avant bascule

1. Ouvre `https://<deploiement-vercel>/api/mj-health`.
2. Vérifie que la réponse contient `"ok": true` sans jamais exposer la clé.
3. Envoie un message depuis l'écran Lecture.
4. Vérifie le statut, le modèle et les tokens dans le Journal API de la console
   administrateur.
5. Vérifie qu'une origine différente reçoit bien une erreur 403.

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
