# Passerelle MJ IA sur Netlify

La fonction `netlify/functions/mj.mjs` expose `POST /api/mj`. La clé du
fournisseur reste uniquement dans les variables d'environnement Netlify, jamais
dans React.

## Mode actuel

Sans variables d'environnement, l'application conserve le copier-coller manuel.
Le bouton API indique simplement que la passerelle n'est pas active.

## Activation sur Netlify

Dans **Site configuration > Environment variables**, ajoute :

- `AI_GATEWAY_ENABLED` : `true`
- `AI_PROVIDER_URL` : URL complète de l'endpoint compatible OpenAI
- `AI_PROVIDER_API_KEY` : clé secrète du fournisseur
- `AI_PROVIDER_MODEL` : identifiant du modèle
- `AI_PROVIDER_MAX_TOKENS` : `700`, limite la longueur des réponses et aide à
  rester dans les quotas gratuits
- `AI_ALLOWED_ORIGIN` : URL publique exacte du site, par exemple
  `https://mon-conteur.netlify.app`
- `AI_MAX_REQUESTS_PER_MINUTE` : `12` est une valeur de départ prudente

Relance ensuite un déploiement. Les fonctions Netlify sont servies sous
`/.netlify/functions/…`, mais la configuration route ici la fonction vers
`/api/mj`.

## Contrat fournisseur

La fonction utilise le format de requête compatible OpenAI :

```json
{
  "model": "<AI_PROVIDER_MODEL>",
  "messages": [{ "role": "user", "content": "<prompt agent>" }],
  "temperature": 0.2
}
```

Elle attend en retour `choices[0].message.content` sous forme de texte. Ce
texte doit être le JSON attendu par la console MJ IA.

Si le fournisseur choisi n'est pas compatible avec ce format, adapte uniquement
la fonction `callCompatibleProvider` : le reste de l'application ne change pas.

## Sécurité avant publication

La limite par minute est seulement une protection légère, locale à une instance
serverless. Elle ne remplace pas une authentification. Avant d'ouvrir le site à
d'autres personnes, protège `/api/mj` avec une authentification Netlify ou une
couche d'identité équivalente, puis vérifie que `AI_ALLOWED_ORIGIN` correspond
exactement à ton domaine.

## Diagnostic

Dans la console admin, le bouton **Diagnostiquer Groq** appelle `/api/mj-health`.
Il indique seulement l'hôte configuré, la présence de la clé, le modèle et le
statut de Groq. Il ne retourne jamais la valeur de la clé.
