# Guide IA - Creation d'elements de carte de combat

Ce fichier explique comment une IA doit enrichir une scene tactique.

## Trois familles differentes

### 1. Terrain

Utilise `combat.map.elements` pour une zone au sol ou une surface qui affecte
les deplacements, la ligne de vue ou les tours.

Exemples :

- sol enflamme
- flaque acide
- fumee
- huile
- zone de soin

Un element de terrain peut couvrir plusieurs cases avec `cells`.

### 2. Entite importante ciblable

Utilise un `Combatant` avec `sourceType: "hazard"` pour un objet important qui
peut etre cible, endommage, detruit, modifie ou supprime.

Exemples :

- baril explosif
- cristal instable
- statue animable
- pilier destructible
- baliste

Convention :

```ts
{
  id: "combatant-hazard-explosive-barrel",
  sourceType: "hazard",
  sourceId: "hazard-explosive-barrel",
  name: "Baril instable",
  side: "neutral",
  hp: 8,
  maxHp: 8,
  defense: 10,
  initiative: -99,
  speed: 0,
  position: { x: 21.5, y: 6.5 },
  conditions: [],
  resources: getDefaultCombatResources(0),
  reach: 0,
  attackRange: 0,
  attackDamage: 0
}
```

Ces entites apparaissent avec un pictogramme sur la carte et peuvent etre
selectionnees comme cible d'attaque.

### 3. Detail de terrain

Utilise `combat.map.details` pour un detail leger que le joueur peut chercher,
ramasser, examiner ou utiliser narrativement.

Exemples :

- grosses pierres a lancer
- corde poussiereuse
- traces dans la poussiere
- eclats de verre
- morceau de bois

Structure :

```ts
{
  id: "detail-heavy-stones",
  name: "Pierres lourdes",
  description: "Des pierres detachees du muret.",
  x: 12.2,
  y: 8.8,
  kind: "looseObject",
  tags: ["stone", "heavy", "throwable", "improvised-weapon"],
  quantity: 4,
  visible: true,
  interactable: true,
  usableAs: ["projectile"],
  rule: "Peut servir de projectile improvise si le MJ valide l'action."
}
```

`visible: false` signifie que le detail existe dans la scene mais n'est pas
affiche au joueur. Le MJ IA peut le reveler quand le joueur le cherche, si la
scene le permet.

## Reponse a une demande joueur

Si le joueur dit : "je cherche une grosse pierre pour la lancer" :

1. Chercher si un detail compatible existe deja, par tags :
   `stone`, `throwable`, `improvised-weapon`.
2. Si oui, le reveler si `visible: false` avec `revealMapDetail(detailId)` ou
   la commande admin `revealDetail <detailId>`.
3. Si non, le MJ peut choisir d'en creer un si la description de la scene le
   rend plausible.
4. Ne pas creer automatiquement un objet s'il contredit la scene.

Commandes utiles pour tester :

```txt
listMapDetails
revealDetail detail-heavy-stones
hideDetail detail-heavy-stones
```

## Choisir la bonne famille

- Est-ce une zone qui affecte des cases ? `map.elements`.
- Est-ce un objet important que l'on peut attaquer/detruire ? `Combatant` hazard.
- Est-ce un petit detail utile ou narratif ? `map.details`.

Ne pas utiliser `map.elements` pour un objet individuel destructible comme un
baril explosif.
