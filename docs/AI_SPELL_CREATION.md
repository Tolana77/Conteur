# Création de sorts par une IA

Les sorts constituent un domaine séparé des capacités. Une capacité utilise ses
propres charges ; un sort utilise un emplacement de sort et appartient à une ou
plusieurs listes de classe.

## Avant de créer

1. Chercher un sort existant dans `src/features/spells/spellCatalog.ts`.
2. Réutiliser un effet du catalogue dès que possible.
3. Ne créer un nouveau template que si le comportement, le niveau minimal ou le
   ciblage sont réellement différents.
4. Ne jamais produire de script libre. Seules les opérations fermées du moteur
   (`damage`, `heal`, `applyCondition`, `teleport`, etc.) sont exécutables.

## Contrat `SpellTemplate`

```ts
{
  id: string,                         // unique, stable, préfixe spell-
  name: string,
  description: string,
  minimumSlotLevel: 0|1|2|3|4|5|6|7|8|9,
  school: "abjuration"|"conjuration"|"divination"|"enchantment"|
          "evocation"|"illusion"|"necromancy"|"transmutation",
  classes: ("wizard"|"cleric"|"bard"|"druid"|"sorcerer"|
            "warlock"|"paladin"|"ranger")[],
  tags: string[],
  activation: { timing: "action"|"bonus"|"reaction" },
  targeting: ActionTargeting,
  components: {
    verbal: boolean,
    somatic: boolean,
    material?: {
      description: string,
      focusAllowed: boolean,
      requirements: Array<{
        name: string,
        quantity: number,
        consumed: boolean,
        itemTemplateId?: string,
        itemTag?: string
      }>
    }
  },
  duration: AbilityDuration,
  concentration: boolean,
  ritual: boolean,
  effects: ItemEffectRef[],
  upcast?: Array<{
    effectIndex: number,
    variable: string,
    addPerSlotLevel: number|string
  }>
}
```

`minimumSlotLevel: 0` désigne un tour mineur : aucun emplacement n'est dépensé.
Pour les autres sorts, le niveau effectif est toujours celui de l'emplacement
choisi. Une règle `upcast` s'applique une fois par niveau au-dessus du niveau
minimal.

Exemple :

```json
{
  "id": "spell-example-flame",
  "name": "Flamme exemplaire",
  "description": "Une flamme frappe une cible visible.",
  "minimumSlotLevel": 1,
  "school": "evocation",
  "classes": ["wizard", "sorcerer"],
  "tags": ["spell", "fire"],
  "activation": { "timing": "action" },
  "targeting": {
    "aim": { "allowed": ["entity"], "required": true, "range": 18, "lineOfSight": true },
    "area": { "shape": "none" },
    "affects": { "allowed": ["living"], "maxTargets": 1 },
    "defaultPriority": ["nearestEnemy"],
    "suggestedSides": ["enemy"]
  },
  "components": { "verbal": true, "somatic": true },
  "duration": { "type": "instant" },
  "concentration": false,
  "ritual": false,
  "effects": [
    { "effectId": "damage", "nom": "Flamme exemplaire", "variables": { "value": "2d6", "damageType": "feu" } }
  ],
  "upcast": [
    { "effectIndex": 0, "variable": "value", "addPerSlotLevel": "1d6" }
  ]
}
```

## Conventions importantes

- Une composante consommée est retirée seulement si le lancement est validé.
- Utiliser `INC` dans une formule (`1d8 + INC`) pour le modificateur
  d'incantation de la classe ; le moteur le remplace par INT, SAG ou CHA.
- Un focaliseur remplace uniquement une composante dont `focusAllowed` vaut
  `true` ; il ne remplace jamais un objet explicitement consommé.
- `concentration: true` remplace la concentration précédente du personnage.
- Les tours mineurs sont toujours préparés lorsqu'ils sont connus.
- Une classe à préparation doit valider sa sélection après chaque repos long.
- Le moteur conserve le template, le grimoire mutable et les effets dans trois
  couches distinctes. Ne jamais stocker les emplacements dans un template.
