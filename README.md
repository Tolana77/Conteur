# Moteur objets / effets

Ce dossier ajoute une couche CommonJS autonome pour manipuler des objets génériques et leurs effets, sans dépendance externe.

## Lancer les tests

```bash
npm run test:objects
```

## Conventions

- `Template.base` contient uniquement les données communes à toutes les instances. Aucun état mutable ne doit y être stocké.
- `Instance.current` contient les valeurs mutables qui ont un pendant dans `base`. À la lecture, `current` est prioritaire sur `base`.
- `Instance.data` contient les données libres, sans pendant attendu dans `base`.
- `modules` est opaque : le moteur transporte ces données mais ne suppose jamais quels modules existent.
- Les overrides utilisent des dot-paths :
  - `"base.weight": 2.3` remplace une valeur scalaire.
  - `"effects.+": { "effectId": "x" }` ajoute un élément à une liste.
  - `"effects.-": "x"` retire un élément par `id`, `effectId` ou égalité profonde.
- La localisation passe uniquement par `location: { type, parent }`.
- `getContents(parentId)` déduit les contenus depuis les instances dont `location.parent === parentId`; aucune liste de contenu n’est stockée côté parent.

## Fichiers principaux

- `src/db.js` : chargement JSON et base en mémoire.
- `src/resolve.js` : pipeline `Template -> overrides -> Instance`.
- `src/conditions.js` : conditions `all`, `any`, comparaisons et ratios `percent`.
- `src/actions.js` : actions fermées et mutantes.
- `src/engine.js` : déclenchement des effets par événement.
- `src/location.js` : déplacement et contenu.

## Déploiement web

La passerelle IA est indépendante de l'hébergeur. Le guide de migration et de
déploiement sur Vercel se trouve dans
[`docs/VERCEL_DEPLOYMENT.md`](docs/VERCEL_DEPLOYMENT.md). Netlify reste
temporairement disponible comme solution de retour arrière.

## Multijoueur

La boucle MJ/joueurs distante utilise Supabase avec authentification anonyme,
RLS et projections privées. La procédure complète se trouve dans
[`docs/MULTIPLAYER_SETUP.md`](docs/MULTIPLAYER_SETUP.md).
