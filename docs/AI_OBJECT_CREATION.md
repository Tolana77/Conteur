# Guide IA - Creation d'objets

Ce fichier sert de consigne aux IA qui doivent creer des objets pour Le Conteur.
Les objets sont separes en deux niveaux : `ItemTemplate` et `ItemInstance`.

## Objectif

Une IA doit toujours creer :

- un `ItemTemplate` pour definir la nature stable de l'objet, seulement si aucun template existant ne couvre deja le besoin ;
- une `ItemInstance` pour placer un exemplaire concret dans le monde, un inventaire ou une zone d'equipement.

Ne jamais inventer de champ hors schema si un champ existant couvre le besoin.
Avant de creer un nouveau template, toujours chercher un template existant proche.
Pour un changement local de nom, description, poids, valeur ou petit bonus, utiliser les `overrides`
ou les `effects` de l'instance. Ne pas creer un nouveau template juste pour "+1 degat",
"potion trouble" ou "armure renforcee".

## Catalogue et commandes

À l'exécution, une IA ne modifie jamais un fichier source. Les catalogues et
instances sont persistés par Zustand dans `localStorage`.

- `createEffectTemplate` enregistre un effet réutilisable ;
- `createAbilityTemplate` enregistre une capacité ;
- `createItemTemplate` enregistre un template d'objet ;
- `createItem` crée une instance concrète ;
- `modifyItem` surcharge ensuite un champ sûr de l'instance.

Toujours émettre les dépendances dans la même réponse si elles manquent. Le
moteur les réordonne automatiquement : effet, capacité, objet, instance.
Le contrat complet est centralisé dans `docs/AI_CONTENT_CREATION.md`.

## ItemTemplate

Un template decrit ce qui est commun a tous les exemplaires d'un objet.

```ts
interface ItemTemplate {
  id: string;
  type: string;
  types: string[];
  tags: string[];
  name: string;
  description: string;
  base: Record<string, number | string | boolean>;
  effects: Array<{
    effectId: string;
    nom?: string;
    variables?: Record<string, number | string | boolean>;
  }>;
  modules: Record<string, Record<string, number | string | boolean | Array<number | string | boolean>>>;
}
```

### Champs

- `id` : identifiant stable, unique, en kebab/snake simple avec prefixe `tpl_`.
- `type` : famille technique principale et libre, par exemple `weapon`, `consumable`, `garment`.
- `types` : categories fonctionnelles visibles, utilisees pour les actions possibles et la couleur.
- `tags` : metadonnees descriptives et logiques, par exemple matiere, etat, forme, magie, degat.
- `name` : nom affiche.
- `description` : description courte, lisible en interface.
- `base` : proprietes stables communes. Tout objet doit avoir `base.weight`.
- `effects` : effets attaches par defaut a chaque instance.
- `modules` : donnees optionnelles interpretees seulement par les systemes qui les connaissent.
  Ne pas y placer les types visuels, les tags descriptifs ou les actions de base.

## ItemInstance

Une instance represente un exemplaire reel d'un template.

```ts
interface ItemInstance {
  id: string;
  templateId: string;
  quantity: number;
  overrides: Record<string, number | string | boolean>;
  current: Record<string, number | string | boolean>;
  data: Record<string, number | string | boolean>;
  effects: Array<{
    effectId: string;
    nom?: string;
    variables?: Record<string, number | string | boolean>;
  }>;
  location: {
    type: "inventory" | "equipped" | "world";
    parent: string | null;
  };
}
```

### Champs

- `id` : identifiant unique avec prefixe `item_` ou `item-`.
- `templateId` : id du template.
- `quantity` : nombre d'exemplaires dans cette pile.
- `overrides` : surcharge locale, par exemple `{ "name": "Potion trouble", "base.weight": 0.3 }`.
- `current` : etat mutable lie a l'objet.
- `data` : donnees libres propres a cette instance.
- `effects` : effets supplementaires propres a cette instance, par exemple un bonus rare ajoute a une armure existante.
- `location` : unique source de verite pour savoir ou se trouve l'objet.

## Localisation

Utiliser uniquement `location`.

```ts
location: { type: "inventory", parent: characterId }
location: { type: "equipped", parent: characterId }
location: { type: "world", parent: "forest_02" }
```

Ne jamais ajouter `ownerId`, `characterId`, `containerId`, `equippedBy` ou `contains`.

## Regles d'equipement

- Un objet est equipe si `location.type === "equipped"`.
- Un objet est dans le sac si `location.type === "inventory"`.
- Un objet est equipable si `types` contient `weapon`, `armor` ou `accessory`.
- Un objet est utilisable si `types` contient `consumable`.
- Un objet qui ne doit pas pouvoir etre desequipe doit posseder l'effet `preventUnequip`.
- Ne pas utiliser `effects` pour declarer les actions de base comme equiper ou utiliser.

Pour l'affichage, ajouter si utile :

```ts
modules: {
  item: {
    nameState?: "known" | "unknown" | "hidden",
    descriptionState?: "known" | "unknown" | "hidden",
    effectsState?: "known" | "unknown" | "hidden",
    unknownName?: string,
    unknownDescription?: string
  }
}
```

## Types et tags

Utiliser `types` pour definir les familles fonctionnelles de l'objet.
L'IA ne doit pas choisir directement les couleurs : l'interface associe elle-meme
chaque type a sa couleur de fond, de bordure et de badge.

L'ordre compte : le premier type de la liste determine la couleur dominante.
Les types suivants apparaissent comme categories secondaires.

Exemples :

```ts
types: ["quest", "consumable"] // objet de quete consommable, couleur dominante quete
types: ["food", "consumable"] // nourriture consommable, couleur dominante nourriture
types: ["accessory"] // accessoire simple
```

Types recommandes :

- objet qui inflige/augmente l'attaque : `weapon` ;
- objet qui protege : `armor` ;
- objet porte sans etre armure : `accessory` ;
- objet qui disparait ou perd une charge a l'utilisation : `consumable` ;
- ingredient comestible sans effet immediat : `food` ;
- composant de craft : `material` ;
- objet lie a une intrigue : `quest` ;
- sinon : `misc`.

Utiliser `tags` pour decrire la logique fine de l'objet : matiere, etat,
forme, origine, magie, degat, rarete narrative. Ces tags ne donnent pas
directement le droit d'equiper ou d'utiliser l'objet.

Exemples :

```ts
types: ["quest", "consumable"],
tags: ["quest", "consumable", "scroll", "paper", "magic", "silence"]

types: ["armor"],
tags: ["armor", "metal", "damaged", "cracked", "heavy"]
```

## Informations masquees ou inconnues

Un objet peut cacher son nom, sa description ou ses effets via `modules.item`.
Les effets restent actifs mecaniquement meme si l'interface les affiche comme inconnus ou les masque.

Etats possibles :

- `known` : information visible normalement ;
- `unknown` : information remplacee par une version inconnue ;
- `hidden` : information non affichee.

Exemple :

```ts
modules: {
  item: {
    nameState: "unknown",
    unknownName: "Anneau inconnu",
    descriptionState: "unknown",
    unknownDescription: "Son usage exact reste a decouvrir.",
    effectsState: "hidden"
  }
}
```

Une instance peut surcharger ces etats via `data` :

```ts
data: {
  nameState: "known",
  descriptionState: "known",
  effectsState: "unknown"
}
```

Pour un objet lie ou maudit qui ne doit pas pouvoir etre desequipe, utiliser un effet :

```ts
types: ["accessory"],
tags: ["accessory", "boots", "leather", "cursed", "magic", "bound"],
effects: [itemEffects.preventUnequip]
```

## Effets reconnus par l'interface

Les effets visibles sont affiches comme une signature courte :

- effet avec niveau : `Nom de l'effet Niv.X`, par exemple `Boule de feu Niv.3` ;
- effet sans niveau : `Nom de l'effet : valeur`, par exemple `Soin : 4 PV` ;
- effet non identifie : `???`.

Pour obtenir cet affichage, creer ou reutiliser un effet nomme dans `itemEffects.ts`.
Un objet ne doit pas decrire lui-meme une phrase du type "inflige 10 degats" :
il doit appeler un effet existant comme `Boule de feu`.

Les opérations natives sont dans `src/features/content/contentCatalog.ts` et
les effets créés en cours de partie vivent dans `effectTemplates`.
La console admin peut aussi lister ces effets avec :

```txt
listEffects
```

### Modifier une caracteristique

Utilise sur les objets equipes.

```ts
{
  effectId: "modifyStat",
  variables: {
    stat: "force" | "dexterite" | "constitution" | "intelligence" | "sagesse" | "charisme",
    value: number
  }
}
```

Exemple :

```ts
{
  effectId: "modifyStat",
  variables: {
    stat: "dexterite",
    value: 1
  }
}
```

### Soigner

Utilise sur les consommables. A l'utilisation, l'objet applique le soin puis perd une unite.
Preferer la fonction `heal(value, { nom?, level?, perLevel? })` dans `itemEffects.ts`.

`value` peut etre un nombre fixe ou une formule. Une formule peut additionner :

- des des : `1d4`, `1d8`, `2d6` ;
- le niveau de la cible : `NIV` ;
- les modificateurs de caracteristiques de la cible : `FOR`, `DEX`, `CON`, `INT`, `SAG`, `CHA`.

Important : `FOR`, `DEX`, `CON`, `INT`, `SAG`, `CHA` designent toujours le modificateur,
pas le score brut. Exemple : une Constitution de 14 donne `CON = +2`.

Exemples valides : `1d8 + CON`, `1d6 + FOR`, `1d4 + NIV`.

```ts
{
  effectId: "heal",
  nom: "Soin",
  variables: {
    value: number | string,
    level?: number,
    perLevel?: number
  }
}
```

### Infliger des degats

Utilise sur les consommables. A l'utilisation, l'objet applique les degats puis perd une unite.
Preferer la fonction `damage(value, damageType, { nom, level?, perLevel? })`.

```ts
{
  effectId: "damage",
  nom: "Nom de l'effet",
  variables: {
    value: number | string,
    damageType: "acide" | "contondant" | "feu" | "force" | "foudre" | "froid" | "necrotique" | "perforant" | "poison" | "psychique" | "radiant" | "tonnerre" | "tranchant",
    level?: number,
    perLevel?: number
  }
}
```

Exemple de capacite plus complexe :

```ts
damage("1d6 + INT + NIV", "feu", { nom: "Boule de feu", level: 3, perLevel: 2 })
```

Cette forme represente une boule de feu de niveau 3. L'interface affiche
`Boule de feu Niv.3 : 1d6 + INT + NIV`.

### Degats aleatoires

Utilise pour infliger des degats dont le type est choisi aleatoirement.

```ts
randomDamage("1d6 + NIV", ["feu", "froid", "foudre", "poison"], { nom: "Dégâts chaotiques" })
```

### Reduction de degats

Utilise surtout sur des objets equipes. La reduction ne peut pas faire descendre
les degats subis sous `minDamage`, qui vaut 1 par defaut.

```ts
reduceDamage("feu", 2)
```

### Interaction avec l'inventaire

Permet a un effet de verifier la presence d'un autre template dans le meme inventaire,
de le consommer et/ou de creer un nouvel objet.

```ts
inventoryInteraction({
  requiredTemplateId: "tpl_magnet_stone",
  consumeRequired: true,
  addTemplateId: "tpl_singing_coin",
  quantity: 1
})
```

## Exemples

### Arme equipee

```ts
const shortbowTemplate = {
  id: "tpl_shortbow",
  type: "weapon",
  types: ["weapon"],
  tags: ["weapon", "wood", "yew", "ranged", "mundane"],
  name: "Arc court",
  description: "Un arc fiable en bois d'if, utile pour garder ses distances.",
  base: {
    attack: 2,
    weight: 1
  },
  effects: [
    {
      effectId: "modifyStat",
      variables: {
        stat: "dexterite",
        value: 1
      }
    }
  ],
  modules: {
    item: {}
  }
};

const shortbowInstance = {
  id: "item-shortbow-01",
  templateId: "tpl_shortbow",
  quantity: 1,
  overrides: {},
  current: {},
  data: {},
  effects: [],
  location: {
    type: "equipped",
    parent: "character_01"
  }
};
```

### Potion de soin

```ts
const healingPotionTemplate = {
  id: "tpl_healing_potion",
  type: "consumable",
  types: ["consumable"],
  tags: ["consumable", "potion", "alchemy", "healing", "glass"],
  name: "Potion de soin",
  description: "Une potion rouge sombre qui referme les plaies recentes.",
  base: {
    weight: 0.25
  },
  effects: [
    {
      effectId: "heal",
      nom: "Soin",
      variables: {
        value: "1d8 + CON"
      }
    }
  ],
  modules: {
    item: {}
  }
};

const healingPotionInstance = {
  id: "item-healing-potion-01",
  templateId: "tpl_healing_potion",
  quantity: 2,
  overrides: {
    name: "Potion rouge trouble",
    description: "Une potion de soin plus sombre que prevu, mais l'effet reste familier."
  },
  current: {},
  data: {},
  effects: [],
  location: {
    type: "inventory",
    parent: "character_01"
  }
};
```

### Fiole de poison

```ts
const poisonVialTemplate = {
  id: "tpl_poison_vial",
  type: "consumable",
  types: ["consumable"],
  tags: ["consumable", "poison", "vial", "glass", "alchemy"],
  name: "Fiole de poison",
  description: "Un venin noiratre. Dangereux si on l'utilise sans precaution.",
  base: {
    weight: 0.1
  },
  effects: [
    {
      effectId: "damage",
      nom: "Poison",
      variables: {
        value: "1d4",
        damageType: "poison"
      }
    }
  ],
  modules: {
    item: {}
  }
};

const poisonVialInstance = {
  id: "item-poison-vial-01",
  templateId: "tpl_poison_vial",
  quantity: 1,
  overrides: {},
  current: {},
  data: {},
  effects: [],
  location: {
    type: "inventory",
    parent: "character_01"
  }
};
```

### Armure existante avec effet d'instance

Ne pas creer un nouveau template pour une armure presque identique.
Reutiliser `tpl_cracked_armor` et ajouter l'effet propre a cet exemplaire.

```ts
const reinforcedArmorInstance = {
  id: "item-cracked-armor-01",
  templateId: "tpl_cracked_armor",
  quantity: 1,
  overrides: {
    name: "Armure fendue pare-braise",
    description: "Une vieille cuirasse reparee avec un alliage qui supporte mieux la chaleur.",
    "base.weight": 8.5
  },
  current: {},
  data: {},
  effects: [itemEffects.reduceFire2],
  location: {
    type: "inventory",
    parent: "character_01"
  }
};
```

## Checklist avant de proposer un objet

- Le template a un `id` unique.
- Il n'existe pas deja un template proche qui pourrait etre reutilise avec `overrides`.
- Le template a des `types` explicites pour les actions/couleurs.
- Le template a des `tags` descriptifs pour la matiere, l'etat, la forme ou la logique fine.
- Le template a toujours `base.weight`.
- L'instance reference un `templateId` existant.
- Les objets utilisables ont le type `consumable`.
- Les objets equipables ont le type `weapon`, `armor` ou `accessory`.
- Les objets lies/maudits utilisent un effet dedie comme `preventUnequip`.
- Les bonus de caracteristiques utilisent `modifyStat`.
- Les effets de consommables utilisent `heal` ou `damage`.
- La localisation passe uniquement par `location`.
- Les donnees persistantes sont simples, serialisables et sans fonction.
