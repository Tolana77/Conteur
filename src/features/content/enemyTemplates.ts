import type {
  EnemyAttackTemplate,
  EnemyBehaviorTemplate,
  EnemyTemplate,
} from "../../app/types";

interface EnemyCatalogInput {
  id: string;
  name: string;
  description: string;
  level: number;
  category: string;
  tags: string[];
  hp: number | string;
  defense: number;
  initiative: number;
  speed: number;
  reach?: number;
  attacks: EnemyAttackTemplate[];
  abilities?: string[];
  behavior: EnemyBehaviorTemplate;
  resistances?: string[];
  vulnerabilities?: string[];
  immunities?: string[];
}

function enemyTemplate(input: EnemyCatalogInput): EnemyTemplate {
  const aggression = input.behavior.aggression <= 1
    ? Math.round(input.behavior.aggression * 5)
    : input.behavior.aggression;

  return {
    id: input.id,
    name: input.name,
    description: input.description,
    level: input.level,
    category: input.category,
    tags: input.tags,
    hp: input.hp,
    defense: input.defense,
    initiative: input.initiative,
    speed: input.speed,
    reach: input.reach ?? 1.5,
    attacks: input.attacks,
    abilityTemplateIds: input.abilities ?? [],
    behavior: { ...input.behavior, aggression },
    resistances: input.resistances ?? [],
    vulnerabilities: input.vulnerabilities ?? [],
    immunities: input.immunities ?? [],
  };
}

function melee(
  id: string,
  name: string,
  attackBonus: number,
  damage: number | string,
  damageType: string,
  range = 1.5,
  tags: string[] = [],
): EnemyAttackTemplate {
  return { id, name, attackKind: "melee", attackBonus, damage, damageType, range, cost: "action", tags };
}

function ranged(
  id: string,
  name: string,
  attackBonus: number,
  damage: number | string,
  damageType: string,
  range: number,
  tags: string[] = [],
): EnemyAttackTemplate {
  return { id, name, attackKind: "ranged", attackBonus, damage, damageType, range, cost: "action", tags };
}

function magic(
  id: string,
  name: string,
  attackBonus: number,
  damage: number | string,
  damageType: string,
  range: number,
  tags: string[] = [],
): EnemyAttackTemplate {
  return { id, name, attackKind: "magic", attackBonus, damage, damageType, range, cost: "action", tags };
}

const soldier = (aggression = 0.7, preferredRange = 1.5): EnemyBehaviorTemplate => ({
  role: "soldier", aggression, preferredRange, priorities: ["protectLeader", "holdPosition", "nearestEnemy"],
});
const brute = (aggression = 0.9, preferredRange = 1.5): EnemyBehaviorTemplate => ({
  role: "brute", aggression, preferredRange, priorities: ["nearestEnemy", "weakestEnemy", "breakObstacle"],
});
const skirmisher = (aggression = 0.65, preferredRange = 4.5): EnemyBehaviorTemplate => ({
  role: "skirmisher", aggression, preferredRange, retreatBelowHpPercent: 20, priorities: ["isolatedEnemy", "weakestEnemy", "cover"],
});
const artillery = (aggression = 0.6, preferredRange = 12): EnemyBehaviorTemplate => ({
  role: "artillery", aggression, preferredRange, retreatBelowHpPercent: 25, priorities: ["keepDistance", "weakestEnemy", "cover"],
});
const controller = (aggression = 0.55, preferredRange = 9): EnemyBehaviorTemplate => ({
  role: "controller", aggression, preferredRange, retreatBelowHpPercent: 20, priorities: ["clusteredEnemies", "protectLeader", "keepDistance"],
});
const support = (aggression = 0.4, preferredRange = 6): EnemyBehaviorTemplate => ({
  role: "support", aggression, preferredRange, retreatBelowHpPercent: 30, priorities: ["woundedAlly", "protectLeader", "keepDistance"],
});

/**
 * Archétypes génériques et équilibrés pour le moteur D&D light. Les noms,
 * apparences, factions et secrets se personnalisent sur les instances ; le
 * template décrit uniquement le profil de combat réutilisable.
 */
export const initialEnemyTemplates: EnemyTemplate[] = [
  enemyTemplate({
    id: "enemy-commoner", name: "Roturier", description: "Une personne ordinaire sans entraînement militaire.",
    level: 0, category: "humanoid", tags: ["humanoid", "civilian"], hp: 4, defense: 10, initiative: 0, speed: 6,
    attacks: [melee("improvised", "Arme improvisée", 2, 1, "contondant", 1.5, ["improvised"])],
    behavior: { ...support(0.15, 6), retreatBelowHpPercent: 75, priorities: ["flee", "seekHelp", "takeCover"] },
  }),
  enemyTemplate({
    id: "enemy-bandit", name: "Bandit", description: "Un pillard mobile qui préfère l'avantage du nombre.",
    level: 1, category: "humanoid", tags: ["humanoid", "bandit"], hp: 11, defense: 12, initiative: 2, speed: 6,
    attacks: [melee("scimitar", "Cimeterre", 3, "1d6 + 1", "tranchant"), ranged("crossbow", "Arbalète légère", 3, "1d8 + 1", "perforant", 24)],
    behavior: skirmisher(0.6, 6),
  }),
  enemyTemplate({
    id: "enemy-bandit-captain", name: "Chef bandit", description: "Un meneur aguerri qui coordonne ses comparses.",
    level: 3, category: "humanoid", tags: ["humanoid", "bandit", "leader"], hp: 36, defense: 15, initiative: 3, speed: 6,
    attacks: [melee("multi-sabre", "Double taille", 5, "2d6 + 3", "tranchant"), ranged("dagger", "Dague lancée", 5, "1d4 + 3", "perforant", 6)],
    abilities: ["abl_rallying_cry", "abl_feint"], behavior: soldier(0.75, 1.5),
  }),
  enemyTemplate({
    id: "enemy-palace-guard", name: "Garde d'élite", description: "Un soldat discipliné chargé de tenir une position sensible.",
    level: 2, category: "humanoid", tags: ["humanoid", "guard", "soldier"], hp: 24, defense: 16, initiative: 1, speed: 6,
    attacks: [melee("spear", "Lance", 4, "1d6 + 2", "perforant", 2), ranged("crossbow", "Arbalète", 3, "1d8", "perforant", 18)],
    abilities: ["abl_challenge"], behavior: soldier(0.7, 2),
  }),
  enemyTemplate({
    id: "enemy-veteran", name: "Vétéran", description: "Un combattant endurci maîtrisant plusieurs armes et tactiques.",
    level: 4, category: "humanoid", tags: ["humanoid", "soldier", "veteran"], hp: 52, defense: 17, initiative: 2, speed: 6,
    attacks: [melee("longsword", "Épée longue", 6, "1d8 + 3", "tranchant"), ranged("heavy-crossbow", "Arbalète lourde", 5, "1d10 + 2", "perforant", 30)],
    abilities: ["abl_riposte", "abl_action_surge"], behavior: soldier(0.8, 1.5),
  }),
  enemyTemplate({
    id: "enemy-cultist", name: "Cultiste", description: "Un fanatique prêt à se sacrifier pour sa croyance.",
    level: 1, category: "humanoid", tags: ["humanoid", "cultist"], hp: 9, defense: 12, initiative: 1, speed: 6,
    attacks: [melee("ritual-dagger", "Dague rituelle", 3, "1d4 + 1", "perforant")],
    abilities: ["abl_intimidating_shout"], behavior: brute(0.85),
  }),
  enemyTemplate({
    id: "enemy-assassin", name: "Assassin", description: "Une tueuse furtive qui frappe vite puis disparaît.",
    level: 5, category: "humanoid", tags: ["humanoid", "assassin", "stealth"], hp: 48, defense: 16, initiative: 5, speed: 7.5,
    attacks: [melee("poisoned-blade", "Lame empoisonnée", 7, "1d6 + 3", "perforant", 1.5, ["poison"]), ranged("hand-crossbow", "Arbalète de poing", 7, "1d6 + 3", "perforant", 18, ["poison"])],
    abilities: ["abl_camouflage", "abl_evasive_step", "abl_power_strike"], behavior: skirmisher(0.85, 4.5),
  }),
  enemyTemplate({
    id: "enemy-archer", name: "Archer", description: "Un tireur entraîné qui exploite la distance et les couverts.",
    level: 2, category: "humanoid", tags: ["humanoid", "archer", "ranged"], hp: 18, defense: 13, initiative: 3, speed: 6,
    attacks: [ranged("longbow", "Arc long", 5, "1d8 + 2", "perforant", 45), melee("shortsword", "Épée courte", 3, "1d6 + 1", "perforant")],
    abilities: ["abl_precise_shot", "abl_pinning_shot"], behavior: artillery(0.65, 18),
  }),
  enemyTemplate({
    id: "enemy-apprentice-mage", name: "Apprenti mage", description: "Un lanceur de sorts fragile disposant de quelques tours offensifs.",
    level: 2, category: "humanoid", tags: ["humanoid", "mage", "arcane"], hp: 14, defense: 12, initiative: 2, speed: 6,
    attacks: [magic("arcane-bolt", "Trait arcanique", 4, "1d8 + 2", "force", 18), melee("staff", "Bâton", 2, "1d6", "contondant")],
    abilities: ["abl_ember_bolt", "abl_smoke_veil"], behavior: artillery(0.5, 12),
  }),
  enemyTemplate({
    id: "enemy-battle-mage", name: "Mage de guerre", description: "Un arcaniste rompu au contrôle du champ de bataille.",
    level: 6, category: "humanoid", tags: ["humanoid", "mage", "arcane", "elite"], hp: 58, defense: 15, initiative: 4, speed: 6,
    attacks: [magic("arcane-lance", "Lance arcanique", 8, "2d8 + 4", "force", 24), melee("staff", "Bâton focal", 5, "1d6 + 2", "contondant")],
    abilities: ["abl_lightning_arc", "abl_spectral_bonds", "abl_dispel"], behavior: controller(0.7, 12),
  }),
  enemyTemplate({
    id: "enemy-goblin", name: "Gobelin", description: "Une petite créature rusée qui harcèle avant de battre en retraite.",
    level: 1, category: "goblinoid", tags: ["goblinoid", "small", "stealth"], hp: 7, defense: 13, initiative: 3, speed: 6,
    attacks: [melee("scimitar", "Cimeterre", 4, "1d6 + 2", "tranchant"), ranged("shortbow", "Arc court", 4, "1d6 + 2", "perforant", 24)],
    abilities: ["abl_evasive_step"], behavior: skirmisher(0.55, 6),
  }),
  enemyTemplate({
    id: "enemy-goblin-boss", name: "Chef gobelin", description: "Un gobelin autoritaire qui utilise ses subalternes comme écran.",
    level: 3, category: "goblinoid", tags: ["goblinoid", "small", "leader"], hp: 28, defense: 15, initiative: 4, speed: 6,
    attacks: [melee("scimitar", "Cimeterre", 5, "1d6 + 3", "tranchant"), ranged("javelin", "Javeline", 5, "1d6 + 3", "perforant", 9)],
    abilities: ["abl_rallying_cry", "abl_feint"], behavior: support(0.7, 3),
  }),
  enemyTemplate({
    id: "enemy-kobold", name: "Kobold", description: "Un petit reptilien qui compte sur ses pièges et ses alliés.",
    level: 1, category: "humanoid", tags: ["reptilian", "small", "trap"], hp: 6, defense: 12, initiative: 2, speed: 6,
    attacks: [melee("dagger", "Dague", 4, "1d4 + 2", "perforant"), ranged("sling", "Fronde", 4, "1d4 + 2", "contondant", 18)],
    abilities: ["abl_trip_attack"], behavior: skirmisher(0.5, 6),
  }),
  enemyTemplate({
    id: "enemy-orc-raider", name: "Orc pillard", description: "Un guerrier brutal qui charge la menace la plus proche.",
    level: 2, category: "humanoid", tags: ["orc", "warrior"], hp: 22, defense: 13, initiative: 1, speed: 7.5,
    attacks: [melee("greataxe", "Grande hache", 5, "1d12 + 3", "tranchant"), ranged("javelin", "Javeline", 5, "1d6 + 3", "perforant", 9)],
    abilities: ["abl_intimidating_shout"], behavior: brute(0.95),
  }),
  enemyTemplate({
    id: "enemy-hobgoblin", name: "Hobgobelin", description: "Un fantassin méthodique qui se bat en formation.",
    level: 2, category: "goblinoid", tags: ["goblinoid", "soldier"], hp: 20, defense: 16, initiative: 1, speed: 6,
    attacks: [melee("longsword", "Épée longue", 5, "1d8 + 2", "tranchant"), ranged("longbow", "Arc long", 4, "1d8 + 2", "perforant", 45)],
    abilities: ["abl_challenge"], behavior: soldier(0.75),
  }),
  enemyTemplate({
    id: "enemy-ogre", name: "Ogre", description: "Un géant massif, lent mais capable de briser une ligne de défense.",
    level: 4, category: "giant", tags: ["giant", "large", "brute"], hp: 59, defense: 11, initiative: -1, speed: 6, reach: 2,
    attacks: [melee("greatclub", "Massue géante", 6, "2d8 + 4", "contondant", 2), ranged("javelin", "Javeline géante", 6, "2d6 + 4", "perforant", 18)],
    abilities: ["abl_shove", "abl_sweeping_strike"], behavior: brute(0.9, 2),
  }),
  enemyTemplate({
    id: "enemy-troll", name: "Troll", description: "Un prédateur gigantesque dont les plaies se referment anormalement vite.",
    level: 6, category: "giant", tags: ["giant", "large", "regeneration"], hp: 84, defense: 15, initiative: 1, speed: 7.5, reach: 2,
    attacks: [melee("claws", "Griffes", 7, "2d6 + 4", "tranchant", 2), melee("bite", "Morsure", 7, "1d8 + 4", "perforant", 2)],
    abilities: ["abl_second_wind"], behavior: brute(0.95, 2), vulnerabilities: ["feu", "acide"],
  }),
  enemyTemplate({
    id: "enemy-wolf", name: "Loup", description: "Un prédateur de meute rapide qui cherche à renverser sa proie.",
    level: 1, category: "beast", tags: ["beast", "canine", "pack"], hp: 11, defense: 13, initiative: 2, speed: 8,
    attacks: [melee("bite", "Morsure", 4, "1d6 + 2", "perforant")], abilities: ["abl_trip_attack"], behavior: skirmisher(0.75, 1.5),
  }),
  enemyTemplate({
    id: "enemy-dire-wolf", name: "Loup géant", description: "Un loup énorme capable d'abattre une cible d'un seul assaut.",
    level: 3, category: "beast", tags: ["beast", "canine", "large", "pack"], hp: 37, defense: 14, initiative: 2, speed: 9, reach: 2,
    attacks: [melee("bite", "Morsure", 5, "2d6 + 3", "perforant", 2)], abilities: ["abl_trip_attack"], behavior: brute(0.85, 2),
  }),
  enemyTemplate({
    id: "enemy-bear", name: "Ours brun", description: "Une bête puissante qui défend férocement son territoire.",
    level: 3, category: "beast", tags: ["beast", "large"], hp: 34, defense: 12, initiative: 0, speed: 7.5, reach: 2,
    attacks: [melee("claws", "Griffes", 5, "2d6 + 3", "tranchant", 2), melee("bite", "Morsure", 5, "1d8 + 3", "perforant", 2)],
    behavior: brute(0.8, 2),
  }),
  enemyTemplate({
    id: "enemy-giant-spider", name: "Araignée géante", description: "Une araignée venimeuse qui immobilise ses proies à distance.",
    level: 3, category: "beast", tags: ["beast", "spider", "venom", "climber"], hp: 26, defense: 14, initiative: 3, speed: 6,
    attacks: [melee("bite", "Morsure venimeuse", 5, "1d8 + 2", "perforant", 1.5, ["poison"]), ranged("web", "Toile", 5, 0, "force", 9, ["restrain"])],
    abilities: ["abl_spectral_bonds"], behavior: controller(0.7, 6),
  }),
  enemyTemplate({
    id: "enemy-rat-swarm", name: "Nuée de rats", description: "Une masse grouillante qui submerge les créatures isolées.",
    level: 2, category: "swarm", tags: ["beast", "swarm", "small"], hp: 24, defense: 12, initiative: 1, speed: 6,
    attacks: [melee("swarm-bites", "Morsures", 4, "2d6", "perforant")], behavior: brute(0.8), resistances: ["contondant", "perforant"],
  }),
  enemyTemplate({
    id: "enemy-boar", name: "Sanglier", description: "Une bête trapue qui charge tout ce qui menace son territoire.",
    level: 2, category: "beast", tags: ["beast", "charge"], hp: 21, defense: 12, initiative: 0, speed: 7.5,
    attacks: [melee("tusks", "Défenses", 4, "1d6 + 2", "perforant")], abilities: ["abl_shove"], behavior: brute(0.85),
  }),
  enemyTemplate({
    id: "enemy-giant-eagle", name: "Aigle géant", description: "Un immense rapace qui fond sur ses proies puis reprend de l'altitude.",
    level: 3, category: "beast", tags: ["beast", "flying", "large"], hp: 30, defense: 13, initiative: 4, speed: 12,
    attacks: [melee("talons", "Serres", 5, "2d6 + 3", "tranchant")], abilities: ["abl_fleet_step"], behavior: skirmisher(0.7, 4.5),
  }),
  enemyTemplate({
    id: "enemy-cave-bat-swarm", name: "Nuée de chauves-souris", description: "Un nuage de petites bêtes qui désoriente par le bruit et le mouvement.",
    level: 1, category: "swarm", tags: ["beast", "swarm", "flying", "echolocation"], hp: 14, defense: 12, initiative: 3, speed: 9,
    attacks: [melee("bites", "Morsures", 3, "2d4", "perforant")], abilities: ["abl_smoke_veil"], behavior: controller(0.45, 1.5),
  }),
  enemyTemplate({
    id: "enemy-skeleton", name: "Squelette", description: "Des os animés obéissant à une volonté nécromantique.",
    level: 1, category: "undead", tags: ["undead", "skeleton"], hp: 13, defense: 13, initiative: 2, speed: 6,
    attacks: [melee("shortsword", "Épée courte", 4, "1d6 + 2", "perforant"), ranged("shortbow", "Arc court", 4, "1d6 + 2", "perforant", 24)],
    behavior: soldier(0.7), resistances: ["perforant"], vulnerabilities: ["contondant"], immunities: ["poison"],
  }),
  enemyTemplate({
    id: "enemy-zombie", name: "Zombie", description: "Un cadavre lent qui avance malgré les blessures.",
    level: 1, category: "undead", tags: ["undead", "zombie"], hp: 22, defense: 8, initiative: -2, speed: 4,
    attacks: [melee("slam", "Heurt", 3, "1d6 + 1", "contondant")], behavior: brute(0.8), immunities: ["poison"],
  }),
  enemyTemplate({
    id: "enemy-ghoul", name: "Goule", description: "Un mort-vivant affamé dont les griffes paralysent les vivants.",
    level: 3, category: "undead", tags: ["undead", "ghoul", "paralysis"], hp: 27, defense: 12, initiative: 2, speed: 6,
    attacks: [melee("claws", "Griffes paralysantes", 5, "2d4 + 2", "tranchant", 1.5, ["stun"]), melee("bite", "Morsure", 4, "2d6 + 2", "perforant")],
    abilities: ["abl_trip_attack"], behavior: skirmisher(0.9, 1.5), immunities: ["poison"],
  }),
  enemyTemplate({
    id: "enemy-wraith", name: "Spectre", description: "Un esprit haineux qui traverse l'obscurité et draine la vie.",
    level: 5, category: "undead", tags: ["undead", "spirit", "incorporeal"], hp: 45, defense: 14, initiative: 4, speed: 9,
    attacks: [magic("life-drain", "Drain de vie", 7, "3d6 + 3", "necrotique", 1.5)], abilities: ["abl_shadow_step", "abl_hypnotic_gaze"],
    behavior: skirmisher(0.8, 3), resistances: ["contondant", "perforant", "tranchant"], vulnerabilities: ["radiant"], immunities: ["poison"],
  }),
  enemyTemplate({
    id: "enemy-necromancer", name: "Nécromancien", description: "Un mage des morts qui combat derrière ses serviteurs.",
    level: 6, category: "humanoid", tags: ["humanoid", "mage", "necromancy"], hp: 54, defense: 14, initiative: 3, speed: 6,
    attacks: [magic("necrotic-bolt", "Trait nécrotique", 8, "2d8 + 4", "necrotique", 24), melee("dagger", "Dague", 4, "1d4 + 1", "perforant")],
    abilities: ["abl_spectral_bonds", "abl_call_wolf", "abl_dispel"], behavior: controller(0.65, 12),
  }),
  enemyTemplate({
    id: "enemy-ooze", name: "Vase corrosive", description: "Une masse lente qui dissout matière organique et métal.",
    level: 3, category: "ooze", tags: ["ooze", "acid", "amorphous"], hp: 45, defense: 8, initiative: -3, speed: 3, reach: 2,
    attacks: [melee("pseudopod", "Pseudopode acide", 5, "2d6 + 2", "acide", 2)], behavior: brute(0.6, 2), resistances: ["tranchant"], immunities: ["poison"],
  }),
  enemyTemplate({
    id: "enemy-fire-elemental", name: "Élémentaire de feu", description: "Une silhouette de flammes qui embrase tout ce qu'elle touche.",
    level: 5, category: "elemental", tags: ["elemental", "fire"], hp: 58, defense: 13, initiative: 4, speed: 9,
    attacks: [melee("flame-touch", "Contact brûlant", 7, "2d6 + 3", "feu")], abilities: ["abl_flame_breath"], behavior: skirmisher(0.85, 1.5),
    resistances: ["perforant", "tranchant"], vulnerabilities: ["froid"], immunities: ["feu", "poison"],
  }),
  enemyTemplate({
    id: "enemy-water-elemental", name: "Élémentaire d'eau", description: "Une vague vivante qui engloutit et repousse ses adversaires.",
    level: 5, category: "elemental", tags: ["elemental", "water"], hp: 64, defense: 14, initiative: 2, speed: 7.5, reach: 2,
    attacks: [melee("wave", "Vague", 7, "2d8 + 3", "contondant", 2)], abilities: ["abl_thunder_clap", "abl_shove"], behavior: controller(0.7, 2),
    resistances: ["acide", "feu"], vulnerabilities: ["foudre"], immunities: ["poison"],
  }),
  enemyTemplate({
    id: "enemy-stone-golem", name: "Golem de pierre", description: "Un gardien artificiel presque impossible à détourner de sa mission.",
    level: 8, category: "construct", tags: ["construct", "stone", "large"], hp: 110, defense: 18, initiative: -1, speed: 4.5, reach: 2,
    attacks: [melee("stone-fist", "Poing de pierre", 9, "3d8 + 5", "contondant", 2)], abilities: ["abl_sweeping_strike", "abl_shove"], behavior: soldier(0.8, 2),
    resistances: ["perforant", "tranchant"], vulnerabilities: ["tonnerre"], immunities: ["poison", "psychique"],
  }),
  enemyTemplate({
    id: "enemy-ash-hound", name: "Molosse de cendre", description: "Un prédateur surnaturel qui chasse au milieu des fumées et des braises.",
    level: 3, category: "monstrosity", tags: ["beast", "fire", "smoke"], hp: 32, defense: 14, initiative: 3, speed: 9,
    attacks: [melee("ember-bite", "Morsure de braise", 5, "1d8 + 3", "feu")], abilities: ["abl_smoke_veil", "abl_fleet_step"], behavior: skirmisher(0.8, 3),
    resistances: ["feu"], vulnerabilities: ["froid"],
  }),
  enemyTemplate({
    id: "enemy-drake", name: "Drake", description: "Un reptile draconique sans ailes, robuste et territorial.",
    level: 5, category: "dragon", tags: ["dragon", "reptilian", "large"], hp: 62, defense: 16, initiative: 2, speed: 9, reach: 2,
    attacks: [melee("bite", "Morsure", 7, "2d8 + 4", "perforant", 2), melee("tail", "Queue", 7, "2d6 + 4", "contondant", 2)],
    abilities: ["abl_flame_breath"], behavior: brute(0.85, 2), resistances: ["feu"],
  }),
  enemyTemplate({
    id: "enemy-young-dragon", name: "Jeune dragon", description: "Un dragon encore jeune, déjà assez puissant pour dominer un champ de bataille.",
    level: 10, category: "dragon", tags: ["dragon", "flying", "large", "boss"], hp: 142, defense: 18, initiative: 4, speed: 12, reach: 3,
    attacks: [melee("bite", "Morsure", 10, "2d10 + 5", "perforant", 3), melee("claws", "Griffes", 10, "2d6 + 5", "tranchant", 2)],
    abilities: ["abl_flame_breath", "abl_intimidating_shout", "abl_fleet_step"], behavior: controller(0.9, 9), resistances: ["feu"],
  }),
  enemyTemplate({
    id: "enemy-shadow-stalker", name: "Traqueur d'ombre", description: "Une créature qui se fond dans les zones obscures avant de bondir.",
    level: 5, category: "monstrosity", tags: ["shadow", "stealth", "supernatural"], hp: 44, defense: 15, initiative: 5, speed: 9,
    attacks: [melee("shadow-claw", "Griffe d'ombre", 7, "2d6 + 3", "necrotique")], abilities: ["abl_shadow_step", "abl_camouflage", "abl_hunters_mark"],
    behavior: skirmisher(0.85, 3), resistances: ["necrotique"], vulnerabilities: ["radiant"],
  }),
];
