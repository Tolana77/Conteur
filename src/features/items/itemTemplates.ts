import type {
  ItemAttackProfile,
  ItemEffectRef,
  ItemRarity,
  ItemTemplate,
} from "../../app/types";
import { itemEffects } from "./itemEffects";

interface WeaponTemplateInput {
  id: string;
  name: string;
  description: string;
  tags: string[];
  aliases?: string[];
  weight: number;
  attacks: ItemAttackProfile[];
  rarity?: ItemRarity;
  effects?: ItemEffectRef[];
  requiresAttunement?: boolean;
}

function weaponTemplate(input: WeaponTemplateInput): ItemTemplate {
  const primaryAttack = input.attacks[0];
  if (!primaryAttack) throw new Error(`Le template d'arme ${input.id} doit définir au moins une attaque.`);
  const numericRanges = input.attacks
    .map((attack) => attack.range)
    .filter((range): range is number => typeof range === "number");
  const range = numericRanges.length ? Math.max(...numericRanges) : primaryAttack.range;

  return {
    id: input.id,
    type: "weapon",
    types: ["weapon"],
    tags: ["weapon", ...input.tags],
    ...(input.aliases ? { aliases: input.aliases } : {}),
    name: input.name,
    description: input.description,
    rarity: input.rarity ?? "mundane",
    ...(input.requiresAttunement ? { requiresAttunement: true } : {}),
    base: {
      range: primaryAttack.range,
      damage: primaryAttack.damage,
      damageType: primaryAttack.damageType,
      weight: input.weight,
    },
    attacks: input.attacks,
    effects: input.effects ?? [],
    targeting: {
      aim: { allowed: ["entity", "position"], required: true, range, lineOfSight: true },
      area: { shape: "none" },
      affects: { allowed: ["living", "object"], maxTargets: 1 },
      defaultPriority: ["nearestEnemy"],
      suggestedSides: ["enemy"],
    },
    modules: { item: {} },
  };
}

function armorTemplate(input: {
  id: string;
  name: string;
  description: string;
  tags: string[];
  aliases?: string[];
  base: ItemTemplate["base"];
}): ItemTemplate {
  return {
    id: input.id,
    type: "armor",
    types: ["armor"],
    tags: ["armor", ...input.tags],
    ...(input.aliases ? { aliases: input.aliases } : {}),
    name: input.name,
    description: input.description,
    rarity: "mundane",
    base: input.base,
    effects: [],
    modules: { item: {} },
  };
}

function commonItem(input: {
  id: string;
  type: string;
  types: string[];
  tags: string[];
  name: string;
  description: string;
  weight: number;
  aliases?: string[];
  base?: ItemTemplate["base"];
  effects?: ItemEffectRef[];
  modules?: ItemTemplate["modules"];
  rarity?: ItemRarity;
  targeting?: ItemTemplate["targeting"];
  attackModifiers?: ItemTemplate["attackModifiers"];
  requiresAttunement?: boolean;
}): ItemTemplate {
  return {
    id: input.id,
    type: input.type,
    types: input.types,
    tags: input.tags,
    ...(input.aliases ? { aliases: input.aliases } : {}),
    name: input.name,
    description: input.description,
    rarity: input.rarity ?? "mundane",
    ...(input.requiresAttunement ? { requiresAttunement: true } : {}),
    base: { ...(input.base ?? {}), weight: input.weight },
    effects: input.effects ?? [],
    ...(input.attackModifiers ? { attackModifiers: input.attackModifiers } : {}),
    ...(input.targeting ? { targeting: input.targeting } : {}),
    modules: input.modules ?? { item: {} },
  };
}

const weapons: ItemTemplate[] = [
  weaponTemplate({
    id: "tpl_shortbow", name: "Arc court",
    description: "Un arc léger et fiable, adapté aux combats à moyenne portée.",
    tags: ["wood", "ranged", "mundane", "ammunition", "two-handed"], weight: 0.9,
    attacks: [{ id: "shot", name: "Tir", label: "Tirer", range: 24, damage: "1d6", damageType: "perforant", attackKind: "ranged" }],
  }),
  weaponTemplate({
    id: "tpl_longbow", name: "Arc long",
    description: "Un grand arc de guerre exigeant de l'espace mais offrant une excellente portée.",
    tags: ["wood", "ranged", "mundane", "ammunition", "heavy", "two-handed"], weight: 0.9,
    attacks: [{ id: "long-shot", name: "Tir à l'arc long", label: "Tirer", range: 45, damage: "1d8", damageType: "perforant", attackKind: "ranged" }],
  }),
  weaponTemplate({
    id: "tpl_light_crossbow", name: "Arbalète légère", aliases: ["arbalète", "arbalete"],
    description: "Une arme à distance puissante mais lente à recharger.",
    tags: ["wood", "metal", "crossbow", "mundane", "ranged", "ammunition", "loading", "two-handed"], weight: 2.3,
    attacks: [{ id: "bolt", name: "Carreau", label: "Tirer", range: 24, damage: "1d8", damageType: "perforant", attackKind: "ranged" }],
  }),
  weaponTemplate({
    id: "tpl_sling", name: "Fronde",
    description: "Une lanière de cuir permettant de projeter de petites pierres avec précision.",
    tags: ["leather", "ranged", "mundane", "ammunition", "light"], weight: 0.1,
    attacks: [{ id: "sling-shot", name: "Tir de fronde", label: "Tirer", range: 18, damage: "1d4", damageType: "contondant", attackKind: "ranged" }],
  }),
  weaponTemplate({
    id: "tpl_dagger", name: "Dague", aliases: ["couteau", "lame courte"],
    description: "Une lame courte et polyvalente, efficace en main comme au lancer.",
    tags: ["metal", "dagger", "mundane", "finesse", "light", "thrown"], weight: 0.45,
    attacks: [
      { id: "stab", name: "Coup de dague", label: "Frapper", range: 1.5, damage: "1d4", damageType: "perforant", attackKind: "melee" },
      { id: "throw", name: "Lancer", label: "Lancer", range: 6, damage: "1d4", damageType: "perforant", attackKind: "ranged" },
    ],
  }),
  weaponTemplate({
    id: "tpl_club", name: "Gourdin", aliases: ["matraque"],
    description: "Une arme rudimentaire, facile à trouver ou à improviser.",
    tags: ["wood", "mundane", "light"], weight: 0.9,
    attacks: [{ id: "club", name: "Coup de gourdin", label: "Frapper", range: 1.5, damage: "1d4", damageType: "contondant", attackKind: "melee" }],
  }),
  weaponTemplate({
    id: "tpl_quarterstaff", name: "Bâton", aliases: ["baton", "bâton de marche"],
    description: "Un solide bâton de marche pouvant être manié à une ou deux mains.",
    tags: ["wood", "staff", "mundane", "versatile"], weight: 1.8,
    attacks: [
      { id: "strike", name: "Frappe", label: "Frapper", range: 1.5, damage: "1d6", damageType: "contondant", attackKind: "melee" },
      { id: "two-handed-strike", name: "Frappe à deux mains", label: "Frapper à deux mains", range: 1.5, damage: "1d8", damageType: "contondant", attackKind: "melee" },
    ],
  }),
  weaponTemplate({
    id: "tpl_mace", name: "Masse d'armes",
    description: "Une tête métallique lourde conçue pour écraser les protections.",
    tags: ["metal", "mundane"], weight: 1.8,
    attacks: [{ id: "mace", name: "Coup de masse", label: "Frapper", range: 1.5, damage: "1d6", damageType: "contondant", attackKind: "melee" }],
  }),
  weaponTemplate({
    id: "tpl_handaxe", name: "Hachette", aliases: ["hache de lancer"],
    description: "Une petite hache utilisable au contact ou comme arme de jet.",
    tags: ["wood", "metal", "mundane", "light", "thrown"], weight: 0.9,
    attacks: [
      { id: "chop", name: "Coup de hachette", label: "Frapper", range: 1.5, damage: "1d6", damageType: "tranchant", attackKind: "melee" },
      { id: "throw", name: "Lancer", label: "Lancer", range: 6, damage: "1d6", damageType: "tranchant", attackKind: "ranged" },
    ],
  }),
  weaponTemplate({
    id: "tpl_javelin", name: "Javeline",
    description: "Une lance légère équilibrée pour le lancer.",
    tags: ["wood", "metal", "mundane", "thrown"], weight: 0.9,
    attacks: [
      { id: "thrust", name: "Estoc", label: "Frapper", range: 1.5, damage: "1d6", damageType: "perforant", attackKind: "melee" },
      { id: "throw", name: "Lancer", label: "Lancer", range: 9, damage: "1d6", damageType: "perforant", attackKind: "ranged" },
    ],
  }),
  weaponTemplate({
    id: "tpl_spear", name: "Lance", aliases: ["lance courte", "épieu", "epieu"],
    description: "Une arme simple qui garde l'adversaire à distance et peut être lancée.",
    tags: ["wood", "metal", "spear", "mundane", "versatile", "thrown"], weight: 1.4,
    attacks: [
      { id: "thrust", name: "Estoc", label: "Frapper", range: 1.5, damage: "1d6", damageType: "perforant", attackKind: "melee" },
      { id: "two-handed-thrust", name: "Estoc à deux mains", label: "Frapper à deux mains", range: 1.5, damage: "1d8", damageType: "perforant", attackKind: "melee" },
      { id: "throw", name: "Lancer", label: "Lancer", range: 6, damage: "1d6", damageType: "perforant", attackKind: "ranged" },
    ],
  }),
  weaponTemplate({
    id: "tpl_rapier", name: "Rapière", aliases: ["rapiere"],
    description: "Une longue lame d'estoc privilégiant précision et vitesse.",
    tags: ["metal", "sword", "mundane", "finesse"], weight: 0.9,
    attacks: [{ id: "thrust", name: "Estoc", label: "Frapper", range: 1.5, damage: "1d8", damageType: "perforant", attackKind: "melee" }],
  }),
  weaponTemplate({
    id: "tpl_longsword", name: "Épée longue", aliases: ["épée", "epee"],
    description: "Une arme martiale équilibrée, utilisable avec une ou deux mains.",
    tags: ["metal", "sword", "mundane", "versatile"], weight: 1.4,
    attacks: [
      { id: "slash", name: "Taille", label: "Frapper", range: 1.5, damage: "1d8", damageType: "tranchant", attackKind: "melee" },
      { id: "two-handed-slash", name: "Taille à deux mains", label: "Frapper à deux mains", range: 1.5, damage: "1d10", damageType: "tranchant", attackKind: "melee" },
    ],
  }),
  weaponTemplate({
    id: "tpl_battleaxe", name: "Hache de bataille",
    description: "Une large hache martiale utilisable à une ou deux mains.",
    tags: ["wood", "metal", "mundane", "versatile"], weight: 1.8,
    attacks: [
      { id: "chop", name: "Taille", label: "Frapper", range: 1.5, damage: "1d8", damageType: "tranchant", attackKind: "melee" },
      { id: "two-handed-chop", name: "Taille à deux mains", label: "Frapper à deux mains", range: 1.5, damage: "1d10", damageType: "tranchant", attackKind: "melee" },
    ],
  }),
  weaponTemplate({
    id: "tpl_warhammer", name: "Marteau de guerre",
    description: "Un marteau martial équilibré pour fracasser armures et os.",
    tags: ["wood", "metal", "mundane", "versatile"], weight: 0.9,
    attacks: [
      { id: "hammer", name: "Coup de marteau", label: "Frapper", range: 1.5, damage: "1d8", damageType: "contondant", attackKind: "melee" },
      { id: "two-handed-hammer", name: "Coup à deux mains", label: "Frapper à deux mains", range: 1.5, damage: "1d10", damageType: "contondant", attackKind: "melee" },
    ],
  }),
  weaponTemplate({
    id: "tpl_greatsword", name: "Espadon",
    description: "Une immense épée à deux mains destinée aux frappes dévastatrices.",
    tags: ["metal", "sword", "mundane", "heavy", "two-handed"], weight: 2.7,
    attacks: [{ id: "great-slash", name: "Taille lourde", label: "Frapper", range: 1.5, damage: "2d6", damageType: "tranchant", attackKind: "melee" }],
  }),
];

const armors: ItemTemplate[] = [
  armorTemplate({ id: "tpl_leather_armor", name: "Armure de cuir", description: "Une protection légère qui conserve toute la mobilité.", tags: ["leather", "light", "mundane"], base: { defenseBase: 11, maxDexBonus: 99, weight: 4.5 } }),
  armorTemplate({ id: "tpl_studded_leather", name: "Cuir clouté", description: "Une armure de cuir renforcée de rivets et de petites plaques.", tags: ["leather", "metal", "light", "mundane"], base: { defenseBase: 12, maxDexBonus: 99, weight: 5.9 } }),
  armorTemplate({ id: "tpl_hide_armor", name: "Armure de peaux", description: "Des peaux épaisses superposées, robustes et faciles à réparer.", tags: ["hide", "medium", "mundane"], base: { defenseBase: 12, maxDexBonus: 2, weight: 5.4 } }),
  armorTemplate({ id: "tpl_scale_mail", name: "Broigne d'écailles", description: "Des écailles métalliques cousues sur un support de cuir.", tags: ["metal", "medium", "mundane"], base: { defenseBase: 14, maxDexBonus: 2, stealthDisadvantage: true, weight: 20.4 } }),
  armorTemplate({ id: "tpl_breastplate", name: "Cuirasse", description: "Une plaque de torse ajustée qui protège sans trop entraver les mouvements.", tags: ["metal", "medium", "mundane"], base: { defenseBase: 14, maxDexBonus: 2, weight: 9.1 } }),
  armorTemplate({ id: "tpl_chain_mail", name: "Cotte de mailles", aliases: ["cotte de maille"], description: "Une lourde protection d'anneaux entrelacés.", tags: ["metal", "heavy", "mundane"], base: { defenseBase: 16, minDexBonus: 0, maxDexBonus: 0, minimumStrength: 13, weight: 25 } }),
  armorTemplate({ id: "tpl_plate_armor", name: "Armure de plates", description: "Un harnois complet offrant une protection exceptionnelle au prix de son poids.", tags: ["metal", "heavy", "mundane"], base: { defenseBase: 18, minDexBonus: 0, maxDexBonus: 0, minimumStrength: 15, weight: 29.5 } }),
  armorTemplate({ id: "tpl_shield", name: "Bouclier", aliases: ["écu", "ecu"], description: "Une protection tenue en main qui accorde +2 en Défense.", tags: ["shield", "wood", "metal", "mundane"], base: { defenseBonus: 2, weight: 2.7 } }),
];

const adventuringGear: ItemTemplate[] = [
  commonItem({ id: "tpl_backpack", type: "container", types: ["misc"], tags: ["container", "cloth", "leather", "travel", "mundane"], aliases: ["sac", "sac à dos"], name: "Sac à dos", description: "Un sac robuste pour organiser le nécessaire d'une expédition.", weight: 2.3, modules: { item: {}, container: { capacityWeight: 15 } } }),
  commonItem({ id: "tpl_rope", type: "rope", types: ["misc"], tags: ["tool", "hemp", "travel", "climbing", "mundane"], aliases: ["corde de chanvre", "cordage"], name: "Corde", description: "Quinze mètres de corde solide, utiles pour grimper, attacher ou improviser.", weight: 4.5, base: { length: 15 } }),
  commonItem({ id: "tpl_thieves_tools", type: "thieves-tools", types: ["misc"], tags: ["tool", "metal", "lock", "trap", "mundane"], aliases: ["outils de voleur", "crochets", "rossignols"], name: "Outils de voleur", description: "Un étui de crochets, pinces et limes pour serrures et pièges.", weight: 0.45 }),
  commonItem({ id: "tpl_bedroll", type: "bedroll", types: ["misc"], tags: ["camp", "cloth", "travel", "mundane"], name: "Couchage", description: "Une couverture épaisse roulée pour dormir loin d'un lit.", weight: 3.2 }),
  commonItem({ id: "tpl_torch", type: "light-source", types: ["misc"], tags: ["tool", "wood", "light", "fire", "mundane"], name: "Torche", description: "Une torche de résine éclairant plusieurs mètres pendant environ une heure.", weight: 0.45, base: { lightRadius: 6, durationMinutes: 60 } }),
  commonItem({ id: "tpl_hooded_lantern", type: "lantern", types: ["misc"], tags: ["tool", "metal", "light", "oil", "mundane"], name: "Lanterne sourde", description: "Une lanterne dont le volet permet de masquer ou diriger la lumière.", weight: 0.9, base: { lightRadius: 9, durationMinutes: 360 } }),
  commonItem({ id: "tpl_tinderbox", type: "fire-kit", types: ["misc"], tags: ["tool", "fire", "survival", "mundane"], name: "Boîte à amadou", description: "Silex, acier et amadou sec pour allumer un feu.", weight: 0.45 }),
  commonItem({ id: "tpl_crowbar", type: "lever-tool", types: ["misc"], tags: ["tool", "metal", "force", "mundane"], name: "Pied-de-biche", description: "Une barre de fer faite pour soulever, forcer ou faire levier.", weight: 2.3 }),
  commonItem({ id: "tpl_climbers_kit", type: "climbing-kit", types: ["misc"], tags: ["tool", "rope", "metal", "climbing", "mundane"], name: "Matériel d'escalade", description: "Un baudrier, des crampons et des attaches pour sécuriser une ascension.", weight: 5.4 }),
  commonItem({ id: "tpl_grappling_hook", type: "grappling-hook", types: ["misc"], tags: ["tool", "metal", "climbing", "mundane"], name: "Grappin", description: "Un crochet à plusieurs pointes à fixer au bout d'une corde.", weight: 1.8 }),
  commonItem({ id: "tpl_hammer", type: "hammer-tool", types: ["misc"], tags: ["tool", "wood", "metal", "craft", "mundane"], name: "Marteau", description: "Un marteau de travail adapté aux clous, piquets et réparations sommaires.", weight: 1.4 }),
  commonItem({ id: "tpl_pitons", type: "pitons", types: ["material"], tags: ["metal", "climbing", "craft", "mundane"], name: "Pitons", description: "Dix pointes de métal pour ancrer une corde ou bloquer un mécanisme.", weight: 1.1, base: { units: 10 } }),
  commonItem({ id: "tpl_waterskin", type: "waterskin", types: ["container"], tags: ["container", "leather", "water", "travel", "mundane"], name: "Gourde", description: "Une outre en cuir pouvant contenir deux litres d'eau.", weight: 0.1, base: { capacityLiters: 2 }, modules: { item: {}, container: { capacityWeight: 2 } } }),
  commonItem({ id: "tpl_coin", type: "currency", types: ["misc"], tags: ["currency", "metal", "trade", "mundane"], aliases: ["pièce", "piece", "monnaie"], name: "Pièce de monnaie", description: "Une pièce générique dont le métal, la valeur et l'autorité émettrice sont précisés sur l'instance.", weight: 0.01, base: { value: 1 } }),
  commonItem({ id: "tpl_key", type: "key", types: ["misc"], tags: ["key", "metal", "lock", "mundane"], aliases: ["clef", "clé"], name: "Clé", description: "Une clé ordinaire dont la serrure correspondante est précisée sur l'instance.", weight: 0.03, modules: { item: {}, key: { lockId: "" } } }),
  commonItem({ id: "tpl_map", type: "map", types: ["misc"], tags: ["paper", "navigation", "exploration", "mundane"], aliases: ["carte", "plan"], name: "Carte", description: "Une carte ou un plan dont la région et la précision sont définies sur l'instance.", weight: 0.05, base: { scale: "regional" } }),
  commonItem({ id: "tpl_trinket", type: "trinket", types: ["misc"], tags: ["trinket", "keepsake", "mundane"], aliases: ["bibelot", "souvenir"], name: "Bibelot", description: "Un petit objet personnel ou décoratif sans mécanique propre.", weight: 0.1 }),
  commonItem({ id: "tpl_hand_mirror", type: "mirror", types: ["misc"], tags: ["tool", "glass", "metal", "observation", "mundane"], name: "Miroir à main", description: "Un petit miroir utile pour observer un angle, envoyer un signal ou se préparer.", weight: 0.25 }),
  commonItem({ id: "tpl_component_pouch", type: "component-pouch", types: ["container"], tags: ["container", "leather", "magic", "components"], name: "Sacoche à composantes", description: "Une petite sacoche compartimentée pour les composantes matérielles ordinaires.", weight: 0.9, modules: { item: {}, container: { capacityWeight: 2 } } }),
  commonItem({ id: "tpl_spell_focus", type: "spell-focus", types: ["misc"], tags: ["spell-focus", "catalyst", "magic"], aliases: ["focaliseur arcanique", "focaliseur druidique", "baguette", "cristal", "totem"], name: "Focaliseur magique", description: "Un support d'incantation générique dont la forme, la tradition et la matière sont précisées sur l'instance.", weight: 0.4, rarity: "common" }),
  commonItem({ id: "tpl_holy_symbol", type: "spell-focus", types: ["accessory"], tags: ["spell-focus", "divine-focus", "holy", "magic", "metal"], name: "Symbole sacré", description: "Un emblème consacré servant de focaliseur aux prières et incantations divines.", weight: 0.1, rarity: "common" }),
  commonItem({ id: "tpl_bardic_instrument", type: "instrument", types: ["misc"], tags: ["spell-focus", "instrument", "music", "wood", "magic"], name: "Instrument de barde", description: "Un instrument de voyage pouvant servir de focaliseur aux sortilèges d'un barde.", weight: 1.2, rarity: "common" }),
  commonItem({ id: "tpl_fishing_tackle", type: "fishing-tackle", types: ["misc"], tags: ["tool", "survival", "fishing", "mundane"], name: "Nécessaire de pêche", description: "Ligne, hameçons, flotteurs et leurres pour pêcher en eau calme.", weight: 1.8 }),
  commonItem({ id: "tpl_empty_vial", type: "vial", types: ["container"], tags: ["container", "glass", "alchemy", "mundane"], aliases: ["fiole vide"], name: "Fiole vide", description: "Un petit récipient de verre pour prélever ou conserver un liquide.", weight: 0.05, base: { capacityMl: 120 }, modules: { item: {}, container: { capacityWeight: 0.15 } } }),
  commonItem({ id: "tpl_tinkers_tools", type: "tinkers-tools", types: ["misc"], tags: ["tool", "metal", "repair", "craft", "mundane"], name: "Outils de bricoleur", description: "De petits outils pour réparer des objets courants et travailler le métal léger.", weight: 4.5 }),
  commonItem({ id: "tpl_paper", type: "paper", types: ["material"], tags: ["paper", "writing", "craft", "mundane"], aliases: ["feuille", "feuille de papier"], name: "Feuille de papier", description: "Une feuille vierge pour écrire, dessiner, plier ou servir de composant.", weight: 0.005, base: { sheets: 1 } }),
  commonItem({ id: "tpl_ink", type: "ink", types: ["material"], tags: ["ink", "writing", "glass", "mundane"], name: "Encre", description: "Une petite fiole d'encre noire pour plusieurs pages d'écriture.", weight: 0.05, base: { volumeMl: 30 } }),
  commonItem({ id: "tpl_chalk", type: "chalk", types: ["material"], tags: ["chalk", "marking", "stone", "mundane"], name: "Craie", description: "Un bâton de craie pour tracer des marques sur la pierre ou le bois.", weight: 0.02 }),
  commonItem({ id: "tpl_healers_kit", type: "healers-kit", types: ["misc"], tags: ["tool", "medicine", "cloth", "mundane"], aliases: ["trousse de soins"], name: "Trousse de soins", description: "Bandages, aiguilles et onguents pour stabiliser et traiter les blessures.", weight: 1.4, base: { uses: 10 } }),
  commonItem({ id: "tpl_tent", type: "tent", types: ["misc"], tags: ["camp", "cloth", "shelter", "travel", "mundane"], name: "Tente", description: "Un abri de toile compact prévu pour deux personnes.", weight: 9.1, base: { capacity: 2 } }),
  commonItem({ id: "tpl_shovel", type: "shovel", types: ["misc"], tags: ["tool", "wood", "metal", "digging", "mundane"], aliases: ["pelle"], name: "Pelle", description: "Une pelle robuste pour creuser, déblayer ou improviser un levier.", weight: 2.3 }),
  commonItem({ id: "tpl_chain", type: "chain", types: ["material"], tags: ["metal", "restraint", "heavy", "mundane"], name: "Chaîne", description: "Trois mètres de maillons de fer capables de retenir une lourde charge.", weight: 4.5, base: { length: 3 } }),
  commonItem({ id: "tpl_manacles", type: "manacles", types: ["misc"], tags: ["tool", "metal", "restraint", "lock", "mundane"], aliases: ["menottes"], name: "Entraves", description: "Une paire de bracelets métalliques reliés et verrouillables.", weight: 2.7 }),
  commonItem({ id: "tpl_field_stone", type: "throwable-stone", types: ["material"], tags: ["stone", "mundane", "throwable"], aliases: ["pierre", "caillou", "petite pierre"], name: "Caillou", description: "Une pierre ordinaire, assez petite pour tenir dans la main.", weight: 0.25, base: { improvisedDamage: "1d4" } }),
  commonItem({ id: "tpl_wild_plant", type: "plant", types: ["material"], tags: ["plant", "herb", "alchemy", "craft", "natural"], aliases: ["fleur", "herbe", "plante sauvage"], name: "Plante sauvage", description: "Une plante commune dont l'espèce, l'aspect et les propriétés sont précisés sur l'instance.", weight: 0.05, base: { freshnessDays: 3 } }),
];

const consumables: ItemTemplate[] = [
  commonItem({ id: "tpl_rations", type: "rations", types: ["food", "consumable"], tags: ["food", "consumable", "travel", "dry"], name: "Rations", description: "Une journée de vivres de route secs et faciles à conserver.", weight: 0.9, base: { days: 1 } }),
  commonItem({ id: "tpl_unknown_concoction", type: "concoction", types: ["consumable"], tags: ["consumable", "alchemy", "unknown"], aliases: ["potion inconnue", "préparation inconnue"], name: "Préparation inconnue", description: "Une base de consommable dont le nom, la description et les effets sont définis sur l'instance.", weight: 0.25, rarity: "common", modules: { item: { effectsState: "unknown" } } }),
  commonItem({ id: "tpl_healing_potion", type: "potion", types: ["consumable"], tags: ["consumable", "potion", "alchemy", "healing", "glass"], name: "Potion de soin", description: "Une préparation alchimique commune qui rend 2d4 + 2 PV.", weight: 0.25, rarity: "common", effects: [{ effectId: "effect-standard-healing", variables: {} }], targeting: { aim: { allowed: ["self", "entity"], required: true, range: 1.5, lineOfSight: true }, area: { shape: "none" }, affects: { allowed: ["self", "living"], maxTargets: 1, requiresLiving: true }, defaultPriority: ["self"], suggestedSides: ["self", "ally"] } }),
  commonItem({ id: "tpl_invisibility_potion", type: "potion", types: ["consumable"], tags: ["consumable", "potion", "alchemy", "illusion", "magic", "glass"], aliases: ["potion d'invisibilité"], name: "Potion d'invisibilité", description: "Une potion qui rend une créature invisible pendant quelques minutes ou jusqu'à une action hostile.", weight: 0.25, rarity: "uncommon", effects: [{ effectId: "effect-invisibility", variables: {} }], targeting: { aim: { allowed: ["self", "entity"], required: true, range: 1.5, lineOfSight: true }, area: { shape: "none" }, affects: { allowed: ["self", "living"], maxTargets: 1, requiresLiving: true }, defaultPriority: ["self"], suggestedSides: ["self", "ally"] } }),
  commonItem({ id: "tpl_antitoxin", type: "antitoxin", types: ["consumable"], tags: ["consumable", "potion", "alchemy", "antidote", "glass"], aliases: ["antidote"], name: "Antitoxine", description: "Une dose alchimique qui neutralise un poison ordinaire.", weight: 0.1, rarity: "common", effects: [{ effectId: "effect-antidote", variables: {} }], targeting: { aim: { allowed: ["self", "entity"], required: true, range: 1.5, lineOfSight: true }, area: { shape: "none" }, affects: { allowed: ["self", "living"], maxTargets: 1, requiresLiving: true }, defaultPriority: ["self"], suggestedSides: ["self", "ally"] } }),
  commonItem({ id: "tpl_poison_vial", type: "poison", types: ["consumable"], tags: ["consumable", "poison", "vial", "glass", "alchemy"], name: "Fiole de poison", description: "Une dose de venin pouvant être avalée, versée ou appliquée avec précaution.", weight: 0.1, rarity: "common", effects: [{ effectId: "effect-venom", variables: {} }], targeting: { aim: { allowed: ["self", "entity", "position"], required: true, range: 6, lineOfSight: true }, area: { shape: "none" }, affects: { allowed: ["self", "living", "object"], maxTargets: 1 }, defaultPriority: ["nearestEnemy"], suggestedSides: ["enemy"] } }),
  commonItem({ id: "tpl_acid_vial", type: "acid", types: ["consumable"], tags: ["consumable", "acid", "vial", "glass", "alchemy", "thrown"], name: "Fiole d'acide", description: "Une fiole jetable qui ronge créatures et objets dans une zone réduite.", weight: 0.45, rarity: "common", effects: [{ effectId: "effect-acid-splash", variables: {} }], targeting: { aim: { allowed: ["entity", "position"], required: true, range: 6, lineOfSight: true }, area: { shape: "circle", radius: 0.5 }, affects: { allowed: ["living", "object", "position"] }, defaultPriority: ["nearestEnemy"], suggestedSides: ["enemy"] } }),
  commonItem({ id: "tpl_holy_water", type: "holy-water", types: ["consumable"], tags: ["consumable", "water", "divine", "radiant", "glass", "thrown"], name: "Eau bénite", description: "Une fiole consacrée, dangereuse pour les créatures profanes et certains morts-vivants.", weight: 0.45, rarity: "common", effects: [{ effectId: "effect-radiant-strike", variables: { value: "2d6" } }], targeting: { aim: { allowed: ["entity", "position"], required: true, range: 6, lineOfSight: true }, area: { shape: "none" }, affects: { allowed: ["living", "object"], maxTargets: 1 }, defaultPriority: ["nearestEnemy"], suggestedSides: ["enemy"] } }),
  commonItem({ id: "tpl_alchemists_fire", type: "alchemical-fire", types: ["consumable"], tags: ["consumable", "alchemy", "fire", "glass", "thrown"], name: "Feu grégeois", description: "Une flasque adhésive qui s'embrase au contact de l'air.", weight: 0.45, rarity: "common", effects: [{ effectId: "effect-burning-ground", variables: { radius: 1 } }], targeting: { aim: { allowed: ["entity", "position"], required: true, range: 6, lineOfSight: true }, area: { shape: "circle", radius: 1 }, affects: { allowed: ["living", "object", "position"] }, defaultPriority: ["nearestEnemy", "farthestPointAhead"], suggestedSides: ["enemy"] } }),
  commonItem({ id: "tpl_caltrops", type: "caltrops", types: ["consumable"], tags: ["consumable", "metal", "trap", "caltrops", "mundane"], aliases: ["chausses-trappes", "pointes"], name: "Chausses-trappes", description: "Une poignée de pointes à répandre au sol pour ralentir un passage.", weight: 0.9, effects: [{ effectId: "effect-caltrops-field", variables: {} }], targeting: { aim: { allowed: ["position"], required: true, range: 3, lineOfSight: true }, area: { shape: "circle", radius: 1 }, affects: { allowed: ["position"] }, defaultPriority: ["farthestPointAhead"] } }),
  commonItem({ id: "tpl_ball_bearings", type: "ball-bearings", types: ["consumable"], tags: ["consumable", "metal", "trap", "slippery", "mundane"], aliases: ["billes", "billes métalliques"], name: "Billes métalliques", description: "Un sac de petites billes qui rendent le sol traître.", weight: 0.9, effects: [{ effectId: "effect-slippery-ground", variables: {} }], targeting: { aim: { allowed: ["position"], required: true, range: 3, lineOfSight: true }, area: { shape: "circle", radius: 2 }, affects: { allowed: ["position"] }, defaultPriority: ["farthestPointAhead"] } }),
  commonItem({ id: "tpl_smoke_bomb", type: "smoke-bomb", types: ["consumable"], tags: ["consumable", "alchemy", "smoke", "thrown", "utility"], aliases: ["fumigène", "fumigene"], name: "Fumigène", description: "Une capsule qui déploie un nuage opaque.", weight: 0.2, rarity: "common", effects: [{ effectId: "effect-smoke-cloud", variables: {} }], targeting: { aim: { allowed: ["position"], required: true, range: 6, lineOfSight: true }, area: { shape: "circle", radius: 2 }, affects: { allowed: ["position"] }, defaultPriority: ["farthestPointAhead"] } }),
  commonItem({ id: "tpl_arrows", type: "ammunition", types: ["material"], tags: ["ammunition", "arrow", "wood", "metal", "mundane"], name: "Flèches", description: "Des flèches ordinaires pour les arcs courts et longs.", weight: 0.025, base: { units: 1 } }),
  commonItem({ id: "tpl_heavy_arrows", type: "ammunition", types: ["consumable", "ammunition"], tags: ["consumable", "ammunition", "arrow", "metal", "heavy"], name: "Flèches lourdes", description: "Des flèches épaisses qui frappent plus fort mais portent moins loin.", weight: 0.08, attackModifiers: [{ id: "heavy-arrow-shot", name: "Flèche lourde", appliesToTags: ["ranged"], appliesToAttackKinds: ["ranged"], rangeModifier: -6, damageModifier: "1d4", damageType: "perforant", consumeOnUse: true }] }),
];

const magicItems: ItemTemplate[] = [
  commonItem({ id: "tpl_magic_trinket", type: "magic-trinket", types: ["accessory"], tags: ["accessory", "trinket", "magic", "attunement"], name: "Talisman magique", description: "Un support générique pour un bijou ou un petit objet magique dont les effets sont portés par l'instance.", weight: 0.1, rarity: "uncommon", requiresAttunement: true }),
  commonItem({ id: "tpl_blank_scroll", type: "scroll", types: ["quest", "consumable"], tags: ["quest", "consumable", "scroll", "paper", "magic", "silence"], name: "Parchemin de silence", description: "Un parchemin qui étouffe les sons dans une petite zone.", weight: 0.1, rarity: "uncommon", effects: [{ effectId: "effect-silence", variables: {} }], targeting: { aim: { allowed: ["self", "entity", "position"], required: true, range: 9, lineOfSight: true }, area: { shape: "circle", radius: 3 }, affects: { allowed: ["self", "living", "position"] }, defaultPriority: ["self"], suggestedSides: ["self", "ally"] } }),
  commonItem({ id: "tpl_fireball_scroll", type: "scroll", types: ["quest", "consumable"], tags: ["quest", "consumable", "scroll", "paper", "magic", "fire"], name: "Parchemin de boule de feu", description: "Une incantation de niveau 3 qui libère une violente explosion de feu.", weight: 0.1, rarity: "rare", effects: [{ effectId: "effect-ember-burst", nom: "Boule de feu", variables: { value: "8d6", level: 3 } }], targeting: { aim: { allowed: ["entity", "position"], required: true, range: 36, lineOfSight: true }, area: { shape: "circle", radius: 6 }, affects: { allowed: ["living", "object", "position"] }, defaultPriority: ["nearestEnemy", "farthestPointAhead"], suggestedSides: ["enemy"] } }),
  commonItem({ id: "tpl_shadow_cloak", type: "garment", types: ["accessory"], tags: ["accessory", "garment", "cloth", "shadow", "magic"], name: "Cape d'ombre", description: "Un tissu enchanté qui permet de franchir brièvement une ombre.", weight: 1.2, rarity: "rare", requiresAttunement: true, effects: [{ effectId: "effect-grant-shadow-step", variables: {} }] }),
  commonItem({ id: "tpl_eternal_bond_boots", type: "garment", types: ["accessory"], tags: ["accessory", "boots", "leather", "cursed", "magic", "bound"], name: "Bottes du lien éternel", description: "Des bottes maudites qui refusent de quitter les pieds de leur porteur.", weight: 1.1, rarity: "rare", requiresAttunement: true, effects: [{ effectId: "effect-binding-curse", variables: {} }], modules: { item: { effectsState: "known" } } }),
  commonItem({ id: "tpl_ember_ward", type: "garment", types: ["accessory"], tags: ["accessory", "brooch", "metal", "fire", "protection", "magic"], name: "Broche pare-braise", description: "Une broche tiède qui absorbe une partie des flammes.", weight: 0.05, rarity: "uncommon", effects: [{ effectId: "effect-fire-ward", variables: {} }] }),
  weaponTemplate({ id: "tpl_ember_staff", name: "Bâton des braises liées", description: "Un bâton enchanté qui sert d'arme et accorde Trait de braise.", tags: ["staff", "wood", "magic", "fire", "catalyst"], weight: 1.8, rarity: "uncommon", requiresAttunement: true, effects: [{ effectId: "effect-grant-ember-bolt", variables: {} }], attacks: [{ id: "strike", name: "Coup de bâton", label: "Frapper", range: 1.5, damage: "1d6", damageType: "contondant", attackKind: "melee" }] }),
  commonItem({ id: "tpl_belt_of_might", type: "garment", types: ["accessory"], tags: ["accessory", "belt", "leather", "magic", "rare", "attunement"], name: "Ceinture de puissance", description: "Une ceinture magique rare qui renforce physiquement son porteur.", weight: 0.4, rarity: "rare", requiresAttunement: true, effects: [itemEffects.rareStrengthPlus2] }),
];

/** Migration des anciens objets de démonstration vers un archétype neutre. */
export const deprecatedBuiltInItemTemplateReplacements: Readonly<Record<string, string>> = {
  tpl_cracked_armor: "tpl_chain_mail",
  tpl_singing_coin: "tpl_coin",
  tpl_giant_mushroom: "tpl_wild_plant",
  tpl_magnet_stone: "tpl_field_stone",
  tpl_glass_dagger: "tpl_dagger",
  tpl_mirror_mask: "tpl_magic_trinket",
  tpl_cursed_chalice: "tpl_unknown_concoction",
  tpl_chaos_flask: "tpl_unknown_concoction",
  tpl_alchemical_converter: "tpl_tinkers_tools",
  tpl_nameless_ring: "tpl_magic_trinket",
};

/**
 * Archétypes mécaniques du catalogue de départ. Les noms, descriptions,
 * matériaux particuliers et origines narratives se personnalisent sur les
 * instances ; un nouveau template n'est requis que si la mécanique change.
 */
export const initialItemTemplates: ItemTemplate[] = [
  ...weapons,
  ...armors,
  ...adventuringGear,
  ...consumables,
  ...magicItems,
];
