# Guide IA - Creation d'etats de combat

Ce fichier sert de consigne aux IA qui doivent creer ou modifier des etats de combat
dans Le Conteur.

## Objectif

Un etat de combat doit etre une definition reutilisable, mais il ne remplace
pas le systeme d'effets.

La regle est :

- `conditionTemplates.ts` decrit les etats disponibles ;
- les effets `applyCondition` et `removeCondition` appliquent ou retirent ces etats.

Avant d'ajouter un nouvel etat, cherche toujours un etat existant proche dans :

- `src/features/combat/conditionTemplates.ts`

Si un etat existant suffit, utilise son `id` dans les effets `applyCondition`
ou `removeCondition`.

## Fichier a modifier

Tous les etats de combat reutilisables sont declares dans :

```txt
src/features/combat/conditionTemplates.ts
```

Ne pas ajouter de liste d'etats directement dans les composants d'interface.
L'interface lit ce catalogue automatiquement pour savoir comment afficher un
etat deja applique par un effet.

## Structure

```ts
{
  id: "poisoned",
  name: "Empoisonné",
  kind: "harmful",
  description: "La cible subit un poison actif.",
  aliases: ["empoisonne", "poison"],
  color: "#6B4A5C",
  icon: "✕",
  tags: ["poison", "body"],
  rules: ["Peut infliger des dégâts ou un malus selon la source."]
}
```

## Champs

- `id` : identifiant technique stable, en anglais simple, kebab-case si besoin.
- `name` : nom affiche au joueur, en francais.
- `kind` :
  - `"harmful"` : etat prejudiciable, visible sous la barre de vie du joueur.
  - `"beneficial"` : etat positif, non affiche dans la zone prejudiciable.
  - `"neutral"` : information tactique, non affichee comme malus.
- `description` : explication courte pour le MJ, l'interface ou une info-bulle.
- `aliases` : variantes reconnues, avec ou sans accents, anciens noms, synonymes.
- `color` : couleur d'affichage du badge. Utiliser la palette existante.
- `icon` : optionnel, symbole court. Ne pas utiliser d'emoji decoratif.
- `tags` : mots-cles logiques pour l'IA et le moteur.
- `rules` : phrases courtes indiquant les effets attendus.

## Regles importantes

- Pour afficher un etat sous les PV, `kind` doit etre `"harmful"`.
- Pour garder un etat cache de cette zone, utiliser `"beneficial"` ou `"neutral"`.
- Ajouter des `aliases` si une zone, un objet ou une ancienne sauvegarde utilise
  deja un autre nom.
- Ne pas encoder toute la logique dans `description`.
- Si l'etat doit infliger des degats, ralentir ou bloquer une action, ajouter
  la logique dans l'effet, la capacite, l'objet ou le terrain qui applique l'etat.

## Utilisation depuis un effet

Exemples :

```ts
{
  effectId: "applyCondition",
  variables: {
    condition: "poisoned"
  }
}
```

Le nom de l'effet est automatiquement deduit du template d'etat :
`condition: "poisoned"` affiche donc `Empoisonné`.

Si un objet ou une capacite a besoin d'un nom specifique, il peut override `nom`,
comme tous les autres effets. Exemple : `nom: "Venin de veuve"`.

```ts
{
  trigger: "enter",
  type: "condition",
  condition: "slippery-footing",
  label: "Huile"
}
```

Le moteur accepte aussi le nom affiche, par exemple `"Empoisonné"`, mais l'`id`
est recommande pour les nouvelles creations.

## A ne pas faire

- Ne pas creer une capacite dont la description dit "empoisonne la cible" sans
  ajouter l'effet `applyCondition`.
- Ne pas creer un nouvel effet juste pour chaque etat. Utilise toujours
  `applyCondition` avec une variable `condition`.
- Ne pas mettre la logique complete dans le template d'etat. Les degats,
  durees, jets de sauvegarde et conditions de retrait appartiennent aux effets,
  capacites, objets ou zones qui appliquent l'etat.
