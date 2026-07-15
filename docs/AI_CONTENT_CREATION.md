# Contrat IA de création de contenu

Ce document est la source de vérité compacte pour créer du contenu pendant une
partie. Toutes les commandes sont validées localement, persistées dans
`localStorage` et exécutées sans script libre.

## Ordre automatique

Le moteur trie les commandes dans cet ordre :

1. `createEffectTemplate`
2. `createAbilityTemplate`
3. `createItemTemplate`
4. `createEnemyTemplate`
5. `createItem` et `grantAbility`
6. `addEnemyToScene`

Un id existant est protégé. Pour remplacer volontairement un template, ajouter
`"mode":"replace"`.

Un agent de création peut produire un nouvel id en kebab-case avec le préfixe
`effect-`, `ability-`, `item-` ou `enemy-`. Toute référence doit viser le
catalogue courant ou un id créé dans la même réponse. Les références croisées,
notamment une invocation et son profil d'ennemi, sont validées comme un lot.

## Effet réutilisable

```json
{
  "type": "createEffectTemplate",
  "template": {
    "id": "effect-frost-bite",
    "name": "Morsure de givre",
    "description": "Inflige des dégâts de froid.",
    "tags": ["froid", "dégâts"],
    "actions": [
      { "operation": "damage", "variables": { "value": "1d6 + INT", "damageType": "froid" } }
    ]
  }
}
```

Opérations fermées : `damage`, `randomDamage`, `heal`, `modifyStat`,
`reduceDamage`, `preventUnequip`, `inventoryInteraction`, `grantAbility`,
`applyCondition`, `removeCondition`, `teleport`, `move`, `createZone`,
`modifyResource`, `summon`, `dispel`.

## Capacité

Une capacité active exige `targetingV2`. Une capacité à charges indique sa
recharge. Les effets peuvent référencer un effet créé juste avant.

```json
{
  "type": "createAbilityTemplate",
  "template": {
    "id": "ability-frost-bolt",
    "name": "Trait de givre",
    "description": "Projette un éclat de froid.",
    "types": ["capacity"],
    "tags": ["magie", "offensif"],
    "combatRole": "attack",
    "activation": { "timing": "action" },
    "resourceCost": { "type": "charge", "amount": 1 },
    "targetingV2": {
      "aim": { "allowed": ["entity"], "required": true, "range": 12, "lineOfSight": true },
      "affects": { "allowed": ["living"], "includeSelf": false },
      "area": { "shape": "none" }
    },
    "charges": { "max": 2, "initial": 2, "recharge": ["shortRest"], "rechargeAmount": "full" },
    "effects": [{ "effectId": "effect-frost-bite", "variables": {} }],
    "modules": { "ability": {} }
  }
}
```

## Objet et instance

Chercher d'abord un template existant. Une variante de nom, description, poids
ou petit bonus utilise `overrides` ou `effects` sur l'instance.

```json
{
  "type": "createItemTemplate",
  "template": {
    "id": "item-frost-wand",
    "type": "focus",
    "types": ["accessory", "equipable"],
    "tags": ["magique", "bois"],
    "name": "Baguette de givre",
    "description": "Une baguette froide au toucher.",
    "base": { "weight": 0.4 },
    "effects": [{ "effectId": "grantAbility", "variables": { "abilityTemplateId": "ability-frost-bolt" } }],
    "modules": { "item": {} }
  }
}
```

```json
{
  "type": "createItem",
  "templateId": "item-frost-wand",
  "instance": {
    "quantity": 1,
    "overrides": { "name": "Baguette givrée d'Ysée" },
    "current": {},
    "data": {},
    "effects": [],
    "location": { "type": "inventory", "parent": "selected" }
  }
}
```

`location` est l'unique source de vérité : `inventory`, `equipped` ou `world`.

## Ennemi et apparition

```json
{
  "type": "createEnemyTemplate",
  "template": {
    "id": "enemy-ash-scout",
    "name": "Éclaireur de cendre",
    "description": "Un pisteur rapide au service des brasiers.",
    "level": 2,
    "category": "humanoid",
    "tags": ["éclaireur", "feu"],
    "hp": "2d8 + 2",
    "defense": 13,
    "initiative": 3,
    "speed": 12,
    "reach": 1.5,
    "attacks": [{
      "id": "ash-knife",
      "name": "Couteau de cendre",
      "attackKind": "melee",
      "attackBonus": 4,
      "damage": "1d4 + 2",
      "damageType": "tranchant",
      "range": 1.5,
      "cost": "action",
      "tags": ["arme"]
    }],
    "abilityTemplateIds": [],
    "behavior": {
      "role": "skirmisher",
      "aggression": 3,
      "preferredRange": 3,
      "retreatBelowHpPercent": 20,
      "priorities": ["contourner", "isoler", "fuir si blessé"]
    },
    "resistances": ["feu"],
    "vulnerabilities": ["froid"],
    "immunities": []
  }
}
```

```json
{
  "type": "addEnemyToScene",
  "enemyTemplateId": "enemy-ash-scout",
  "enemy": { "name": "Varek", "side": "enemies" },
  "position": { "x": 8, "y": 6 }
}
```

## Garanties

- ids stricts, uniques et sans espaces ;
- références inconnues rejetées ;
- aucune opération ou script arbitraire ;
- parent d'inventaire vérifié ;
- lot de création automatique annulé si une dépendance est invalide ;
- catalogues et instances inclus dans la sauvegarde et le redémarrage de campagne.

## Atelier de contenu

La console admin contient un Atelier de contenu pour inspecter les quatre
catalogues, leurs dépendances et les instances qui les utilisent. Toute
création ou modification passe par les mêmes parseurs stricts que les réponses
IA. Le bouton `Valider à blanc` ne modifie aucune donnée.

Un template désactivé est retiré des contextes proposés aux agents et ne peut
plus produire de nouvelle instance. Les instances déjà présentes continuent à
fonctionner afin de préserver les sauvegardes. La suppression est refusée pour
les templates système et pour tout template encore référencé. Les créations IA
et les opérations manuelles sont conservées dans un journal local borné.
