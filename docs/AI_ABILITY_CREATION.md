# Guide IA - Creation de capacites

Ce fichier sert de consigne aux IA qui doivent creer des capacites pour Le Conteur.
Une capacite doit etre facile a lire, valider, afficher et executer par le moteur.

## Regle principale

Ne code jamais une logique dans la description. La description sert au joueur.
La logique doit passer par :

- `combatRole`
- `activation`
- `resourceCost`
- `targeting`
- `charges`
- `scaling`
- `requirements`
- `duration`
- `effects`

Avant de creer un nouvel effet, cherche un effet existant dans le catalogue.
Avant de creer une nouvelle capacite tres proche, utilise `scaling`, `requirements`
ou les variables d'effet pour produire une variante.
Avant de creer un nouvel etat applique par une capacite, consulte
`docs/AI_CONDITION_CREATION.md` et le catalogue `src/features/combat/conditionTemplates.ts`.
Pour appliquer un etat, utilise toujours l'effet `applyCondition` avec la variable
`condition`. Pour le retirer, utilise `removeCondition`.

## Structure recommandee

```ts
{
  id: "abl_unique_id",
  name: "Nom lisible",
  description: "Texte joueur, sans regle cachee.",
  types: ["magic", "attack"],
  tags: ["fire", "ranged"],
  combatRole: "attack",
  activation: { timing: "action" },
  resourceCost: { type: "charge", amount: 1 },
  targeting: {
    aim: { allowed: ["entity", "position"], required: true, range: 12, lineOfSight: true },
    area: { shape: "none" },
    affects: { allowed: ["living"], maxTargets: 1, requiresLiving: true },
    defaultPriority: ["nearestEnemy"],
    suggestedSides: ["enemy"]
  },
  charges: {
    max: 3,
    initial: 3,
    recharge: ["shortRest", "longRest"],
    rechargeAmount: "full"
  },
  scaling: {
    level: 1,
    mode: "abilityLevel",
    maxLevel: 5
  },
  requirements: [
    { type: "equippedItemTag", tag: "catalyst" }
  ],
  duration: { type: "instant" },
  effects: [
    {
      effectId: "damage",
      nom: "Trait de feu",
      variables: {
        value: "1d6 + INT",
        damageType: "feu",
        level: 1,
        perLevel: "1d6"
      }
    }
  ],
  modules: { ability: {} }
}
```

## combatRole

`combatRole` indique a l'interface ou afficher la capacite.

- `attack` : attaque, sort offensif, attaque speciale limitee.
- `support` : soin, boost, protection, moral.
- `movement` : deplacement, teleportation, repositionnement.
- `utility` : exploration, interaction, detection, controle non offensif.
- `passive` : effet toujours actif.

Ne deduis pas `combatRole` uniquement depuis les effets. Une aura de feu peut
faire des degats sans etre une attaque volontaire.

## activation et cout

`activation.timing` indique le type d'action :

- `action`
- `bonus`
- `reaction`
- `free`
- `passive`

`resourceCost` indique ce qui est consomme :

- `{ type: "charge", amount: 1 }`
- `{ type: "mana", amount: "1d4" }`
- `{ type: "action", amount: 1 }`
- `{ type: "custom", resource: "rage", amount: 1 }`

Si `resourceCost.type` vaut `charge`, ajoute toujours un bloc `charges`.

## scaling

Utilise `scaling` pour eviter de dupliquer les capacites.

Modes :

- `abilityLevel` : niveau propre a la capacite.
- `characterLevel` : niveau du personnage.
- `slotLevel` : niveau d'emplacement de sort, reserve aux sorts futurs.
- `itemLevel` : niveau/rarete de l'objet qui accorde la capacite.
- `fixed` : pas d'evolution.

Les effets peuvent utiliser :

- `level`
- `perLevel`
- valeurs formulees comme `"1d6 + INT"` ou `"1d8 + CON + NIV"`

Convention : `FOR`, `DEX`, `CON`, `INT`, `SAG`, `CHA` designent le modificateur
de caracteristique, pas la valeur brute.

## targeting

Le ciblage decrit ce que le joueur vise et ce qui est affecte. Il n'existe
aucun second format de ciblage : ce bloc est la source de verite du moteur,
du chat et de la carte de combat.

Exemples :

- cible unique visible :
  `aim.allowed: ["entity"]`, `area.shape: "none"`
- point de carte :
  `aim.allowed: ["position"]`
- boule de feu :
  `aim.allowed: ["entity", "position"]`, `area.shape: "circle"`
- teleportation :
  `aim.allowed: ["position"]`, `affects.allowed: ["self"]`

`suggestedSides` ne limite pas le moteur. Il limite ce que l'interface propose
normalement au joueur.

## requirements

Ajoute des prerequis quand l'usage n'est pas toujours possible.

Exemples :

```ts
{ type: "equippedItemTag", tag: "staff" }
{ type: "equippedItemType", itemType: "weapon" }
{ type: "resource", resource: "mana", min: 2 }
{ type: "state", condition: "notSilenced", expected: true }
{ type: "targetCondition", condition: "living" }
{ type: "combatStatus", status: "active" }
```

## duration

Utilise `duration` pour distinguer les effets instantanes et persistants.

- `{ type: "instant" }`
- `{ type: "rounds", value: 3 }`
- `{ type: "untilRest", rest: "long" }`
- `{ type: "concentration", maxRounds: 10 }`
- `{ type: "permanent" }`

## Catalogue d'effets

Effets existants ou reserves au moteur :

- `damage`
- `randomDamage`
- `heal`
- `modifyStat`
- `modifyResource`
- `applyCondition`
- `removeCondition`
- `reduceDamage`
- `move`
- `teleport`
- `createZone`
- `summon`
- `dispel`
- `inventoryInteraction`
- `grantAbility`
- `preventUnequip`

Une action inconnue est rejetée. Si une combinaison manque, crée d'abord un
`EffectTemplate` à partir de ces opérations fermées, puis référence son id.

## Validation attendue

Une capacite valide doit respecter au minimum :

- id unique
- nom non vide
- `combatRole` explicite
- `targeting` present sauf passif tres simple
- effet connu
- variables obligatoires presentes
- capacite a charges avec recharge
- capacite offensive avec un effet offensif ou une condition claire

Verifie ces contraintes avant d'ajouter une capacite au jeu.
