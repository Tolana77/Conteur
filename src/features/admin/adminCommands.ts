import type { Character, CharacterStats } from "../../core/models";
import type {
  AbilityInstance,
  AbilityTemplate,
  Combatant,
  CombatPosition,
  CombatScene,
  DiceVisibility,
  ItemEffectRef,
  ItemInstance,
  ItemTemplate,
} from "../../app/types";
import { itemEffectCatalog, isItemEquipable, isItemUsable } from "../items";
import { formatEffectValueExpression } from "../items/valueExpressions";
import { getAbilityCharges, getAbilityMaxCharges } from "../abilities";

type CommandStatus = "success" | "error" | "info";

export interface AdminCommandResult {
  status: CommandStatus;
  message: string;
}

export interface AdminCommandContext {
  characters: Character[];
  selectedCharacterId: string;
  itemTemplates: ItemTemplate[];
  itemInstances: ItemInstance[];
  abilityTemplates: AbilityTemplate[];
  abilityInstances: AbilityInstance[];
  combat: CombatScene;
  dealDamage: (characterId: string, amount: number, damageType?: string) => void;
  healCharacter: (characterId: string, amount: number) => void;
  setCharacterPv: (characterId: string, pv: number) => void;
  changeCharacterStat: (
    characterId: string,
    stat: keyof CharacterStats,
    value: number,
    mode: "add" | "set",
  ) => void;
  equipItem: (itemId: string) => void;
  unequipItem: (itemId: string) => void;
  giveItem: (characterId: string, templateId: string, quantity?: number) => ItemInstance | null;
  pickupItem: (itemId: string, characterId: string) => boolean;
  removeItem: (itemId: string) => void;
  useItem: (itemId: string) => void;
  useAbility: (abilityId: string) => boolean;
  rechargeAbility: (abilityId: string) => void;
  setAbilityCharges: (abilityId: string, charges: number) => void;
  rest: (characterId: string, type: "short" | "long") => void;
  startEncounter: (characterId: string) => void;
  startCombat: () => void;
  endCombat: () => void;
  addCharacterToCombat: (characterId: string) => void;
  addEntityToCombat: (entityId: string, side?: Combatant["side"]) => void;
  revealMapDetail: (detailId: string) => void;
  hideMapDetail: (detailId: string) => void;
  moveCombatant: (combatantId: string, position: CombatPosition) => void;
  nextCombatTurn: () => void;
  rollFormula: (formula: string, visibility?: DiceVisibility, reason?: string) => { result: number; formula: string };
}

export const adminCommandDocs = [
  {
    name: "help",
    usage: "help",
    description: "Affiche la liste des commandes.",
  },
  {
    name: "list",
    usage: "list",
    description: "Liste les ids utilisables.",
  },
  {
    name: "roll",
    usage: 'roll "<formule>" [public|gmOnly|hidden|summary] [raison]',
    description: "Lance une formule de dés. Les jets public déclenchent l'animation joueur.",
  },
  {
    name: "inspect",
    usage: "inspect <id|selected>",
    description: "Affiche les PV et caractéristiques d'une instance de fiche.",
  },
  {
    name: "dealDamage",
    usage: "dealDamage <id|selected> <montant> [type]",
    description: "Retire des PV, avec type optionnel pour tester les réductions.",
  },
  {
    name: "heal",
    usage: "heal <id|selected> <montant>",
    description: "Restaure des PV sans dépasser le maximum.",
  },
  {
    name: "setPv",
    usage: "setPv <id|selected> <valeur>",
    description: "Fixe les PV actuels.",
  },
  {
    name: "changeStat",
    usage: "changeStat <id|selected> <stat> <valeur|+n|-n>",
    description: "Modifie FOR/DEX/CON/INT/SAG/CHA.",
  },
  {
    name: "listItems",
    usage: "listItems <id|selected>",
    description: "Liste les objets équipés et ceux dans le sac.",
  },
  {
    name: "listItemTemplates",
    usage: "listItemTemplates",
    description: "Liste les templates d'objets disponibles.",
  },
  {
    name: "listEffects",
    usage: "listEffects",
    description: "Liste le catalogue d'effets utilisables pour créer des objets.",
  },
  {
    name: "listAbilities",
    usage: "listAbilities <id|selected>",
    description: "Liste les capacités connues et leurs charges.",
  },
  {
    name: "listAbilityTemplates",
    usage: "listAbilityTemplates",
    description: "Liste les templates de capacités disponibles.",
  },
  {
    name: "inspectAbility",
    usage: "inspectAbility <abilityId>",
    description: "Affiche le détail d'une capacité.",
  },
  {
    name: "useAbility",
    usage: "useAbility <id|selected> <abilityId>",
    description: "Dépense une charge de capacité si elle est disponible.",
  },
  {
    name: "rechargeAbility",
    usage: "rechargeAbility <abilityId>",
    description: "Recharge complètement une capacité.",
  },
  {
    name: "setAbilityCharges",
    usage: "setAbilityCharges <abilityId> <charges>",
    description: "Fixe manuellement les charges d'une capacité.",
  },
  {
    name: "shortRest",
    usage: "shortRest <id|selected>",
    description: "Simule un repos court et recharge les capacités concernées.",
  },
  {
    name: "longRest",
    usage: "longRest <id|selected>",
    description: "Simule un repos long, recharge les capacités concernées et restaure les PV.",
  },
  {
    name: "startEncounter",
    usage: "startEncounter <id|selected>",
    description: "Recharge les capacités qui reviennent au début d'une rencontre.",
  },
  {
    name: "startCombat",
    usage: "startCombat",
    description: "Démarre une scène de combat et initialise les combattants connus.",
  },
  {
    name: "endCombat",
    usage: "endCombat",
    description: "Termine la scène de combat active.",
  },
  {
    name: "combatStatus",
    usage: "combatStatus",
    description: "Affiche le tour de jeu, le tour actif et les combattants.",
  },
  {
    name: "nextTurn",
    usage: "nextTurn",
    description: "Passe au combattant suivant.",
  },
  {
    name: "addCombatant",
    usage: "addCombatant <characterId|entityId> [side]",
    description: "Ajoute un personnage ou une entité au combat.",
  },
  {
    name: "moveCombatant",
    usage: "moveCombatant <combatantId> <x> <y>",
    description: "Déplace un combattant sur la carte tactique.",
  },
  {
    name: "listMapDetails",
    usage: "listMapDetails",
    description: "Liste les détails de terrain révélables par le MJ IA.",
  },
  {
    name: "revealDetail",
    usage: "revealDetail <detailId>",
    description: "Révèle un détail de terrain sur la carte.",
  },
  {
    name: "hideDetail",
    usage: "hideDetail <detailId>",
    description: "Masque un détail de terrain.",
  },
  {
    name: "inspectItem",
    usage: "inspectItem <itemId>",
    description: "Affiche le détail d'une instance d'objet.",
  },
  {
    name: "equipItem",
    usage: "equipItem <itemId>",
    description: "Passe un objet non consommable du sac vers l'équipement.",
  },
  {
    name: "unequipItem",
    usage: "unequipItem <itemId>",
    description: "Replace un objet équipé dans le sac.",
  },
  {
    name: "giveItem",
    usage: "giveItem <id|selected> <templateId> [quantité]",
    description: "Ajoute un objet dans le sac.",
  },
  {
    name: "pickupItem",
    usage: "pickupItem <id|selected> <itemId>",
    description: "Ramasse une instance présente dans le monde sans la dupliquer.",
  },
  {
    name: "removeItem",
    usage: "removeItem <itemId>",
    description: "Supprime une instance d'objet.",
  },
  {
    name: "useItem",
    usage: "useItem <itemId>",
    description: "Utilise un consommable et applique ses effets.",
  },
] as const;

const statAliases: Record<string, keyof CharacterStats> = {
  for: "force",
  force: "force",
  dex: "dexterite",
  dexterite: "dexterite",
  dextérité: "dexterite",
  con: "constitution",
  constitution: "constitution",
  int: "intelligence",
  intelligence: "intelligence",
  sag: "sagesse",
  sagesse: "sagesse",
  cha: "charisme",
  charisme: "charisme",
};

function parseTokens(input: string): string[] {
  return input.match(/"[^"]+"|\S+/g)?.map((token) => token.replace(/^"|"$/g, "")) ?? [];
}

function formatHelp(): string {
  return adminCommandDocs.map((command) => `${command.usage} — ${command.description}`).join("\n");
}

function findCharacter(context: AdminCommandContext, id: string): Character | undefined {
  const resolvedId = id === "selected" ? context.selectedCharacterId : id;
  return context.characters.find((character) => character.id === resolvedId);
}

function parseNumber(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCombatSide(value: string | undefined): value is Combatant["side"] {
  return value === "players" || value === "allies" || value === "enemies" || value === "neutral";
}

function isDiceVisibility(value: string | undefined): value is DiceVisibility {
  return value === "public" || value === "gmOnly" || value === "hidden" || value === "summary";
}

function requireCharacter(
  context: AdminCommandContext,
  id: string | undefined,
): Character | AdminCommandResult {
  if (!id) {
    return { status: "error", message: "Id manquant. Utilise un id ou selected." };
  }

  const character = findCharacter(context, id);

  if (!character) {
    return { status: "error", message: `Id introuvable: ${id}` };
  }

  return character;
}

function getTemplate(context: AdminCommandContext, templateId: string): ItemTemplate | undefined {
  return context.itemTemplates.find((template) => template.id === templateId);
}

function getAbilityTemplate(
  context: AdminCommandContext,
  templateId: string,
): AbilityTemplate | undefined {
  return context.abilityTemplates.find((template) => template.id === templateId);
}

function getTemplateTypes(template: ItemTemplate | undefined): string[] {
  if (!template) {
    return [];
  }

  const maybeTypes = (template as Partial<ItemTemplate> & { types?: unknown }).types;

  if (Array.isArray(maybeTypes) && maybeTypes.length > 0) {
    return maybeTypes.filter((type): type is string => typeof type === "string");
  }

  const legacyTags = (template as Partial<ItemTemplate> & { tags?: unknown }).tags;

  if (Array.isArray(legacyTags) && legacyTags.length > 0) {
    return legacyTags.filter((tag): tag is string => typeof tag === "string");
  }

  const legacyRoles = template.modules.item?.roles;

  return Array.isArray(legacyRoles)
    ? legacyRoles.filter((role): role is string => typeof role === "string")
    : [];
}

function formatItem(context: AdminCommandContext, item: ItemInstance): string {
  const template = getTemplate(context, item.templateId);
  const name = String(item.overrides.name ?? template?.name ?? item.templateId);

  return `${item.id} — ${name} x${item.quantity} (${item.location.type})`;
}

function formatAbility(context: AdminCommandContext, ability: AbilityInstance): string {
  const template = getAbilityTemplate(context, ability.templateId);
  const name = String(ability.overrides.name ?? template?.name ?? ability.templateId);
  const charges = getAbilityCharges(ability, template);
  const maxCharges = getAbilityMaxCharges(template);
  const chargeLabel = charges === null || maxCharges === null ? "passif" : `${charges}/${maxCharges}`;

  return `${ability.id} — ${name} (${chargeLabel})`;
}

function formatAbilityDetails(context: AdminCommandContext, ability: AbilityInstance): string {
  const template = getAbilityTemplate(context, ability.templateId);

  if (!template) {
    return `${ability.id} — template introuvable: ${ability.templateId}`;
  }

  const types = template.types.join(", ") || "misc";
  const tags = template.tags.length > 0 ? `\nTags: ${template.tags.join(", ")}` : "";
  const recharge = template.charges
    ? `\nRecharge: ${template.charges.recharge.join(", ")}`
    : "\nRecharge: aucune charge";

  return [
    formatAbility(context, ability),
    template.description,
    `Activation: ${template.activation.timing}`,
    `Cibles: ${template.targeting.allowed.join(", ")}${template.targeting.range ? `, portée ${template.targeting.range}` : ""}`,
    `Types: ${types}${tags}${recharge}`,
    `Effets: ${formatAbilityEffects(ability, template)}`,
  ].join("\n");
}

function formatAbilityEffects(ability: AbilityInstance, template?: AbilityTemplate): string {
  const effects = [...(template?.effects ?? []), ...ability.effects];

  if (effects.length === 0) {
    return "Aucun effet";
  }

  return effects.map(formatEffectSignature).join(", ");
}

function formatItemEffects(item: ItemInstance, template?: ItemTemplate): string {
  const effects = [...(template?.effects ?? []), ...item.effects];

  if (effects.length === 0) {
    return "Aucun effet";
  }

  return effects.map(formatEffectSignature).join(", ");
}

function formatEffectSignature(effect: ItemEffectRef): string {
  if (effect.effectId === "modifyStat") {
    return `${effect.variables?.stat ?? "?"} ${formatSigned(Number(effect.variables?.value) || 0)}`;
  }

  const name = effect.nom ?? getFallbackEffectName(effect.effectId);
  const level = Number(effect.variables?.level);
  const value = formatEffectValueExpression(effect.variables?.value);
  const levelLabel = Number.isFinite(level) && level > 1 ? ` Niv.${level}` : "";

  if (value) {
    return `${name}${levelLabel} : ${effect.effectId === "heal" ? `${value} PV` : value}`;
  }

  return `${name}${levelLabel}`;
}

function getFallbackEffectName(effectId: string): string {
  const names: Record<string, string> = {
    heal: "Soin",
    damage: "DM",
    randomDamage: "Dégâts chaotiques",
    reduceDamage: "Résistance",
    inventoryInteraction: "Interaction d'inventaire",
  };

  return names[effectId] ?? "???";
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function executeAdminCommand(
  input: string,
  context: AdminCommandContext,
): AdminCommandResult {
  const tokens = parseTokens(input.trim());
  const [commandName, id, arg1, arg2] = tokens;

  if (!commandName) {
    return { status: "info", message: "Entre une commande. Exemple: dealDamage selected 2" };
  }

  if (commandName === "help") {
    return { status: "info", message: formatHelp() };
  }

  if (commandName === "list") {
    return {
      status: "info",
      message: context.characters
        .map((character) => `${character.id} — ${character.name}`)
        .join("\n"),
    };
  }

  if (commandName === "roll") {
    if (!id) {
      return { status: "error", message: 'Formule manquante. Exemple: roll "1d20 + 2" public "Jet visible".' };
    }

    const visibility = isDiceVisibility(arg1) ? arg1 : "public";
    const reason = isDiceVisibility(arg1) ? tokens.slice(3).join(" ") : tokens.slice(2).join(" ");

    try {
      const roll = context.rollFormula(id, visibility, reason || undefined);

      return {
        status: "success",
        message: `${roll.formula} → ${roll.result}${visibility === "public" ? " (visible)" : ` (${visibility})`}`,
      };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Jet impossible.",
      };
    }
  }

  if (commandName === "listItemTemplates") {
    return {
      status: "info",
      message: context.itemTemplates
        .map((template) => {
          const types = getTemplateTypes(template).join(", ") || "misc";
          const tags = Array.isArray(template.tags) && template.tags.length > 0
            ? ` | tags: ${template.tags.join(", ")}`
            : "";

          return `${template.id} — ${template.name} (${template.type}) | types: ${types}${tags}`;
        })
        .join("\n"),
    };
  }

  if (commandName === "listEffects") {
    return {
      status: "info",
      message: itemEffectCatalog
        .map((effect) => {
          const variables = effect.variables.length > 0 ? `(${effect.variables.join(", ")})` : "";
          const visibility = effect.visibleInInventory ? "visible" : "système";

          return `${effect.effectId} — ${effect.nom} ${variables} [${visibility}]\n${effect.description}`;
        })
        .join("\n\n"),
    };
  }

  if (commandName === "listAbilityTemplates") {
    return {
      status: "info",
      message: context.abilityTemplates
        .map((template) => {
          const charges = template.charges ? ` | charges: ${template.charges.max}` : " | passif";
          const recharge = template.charges ? ` | recharge: ${template.charges.recharge.join(", ")}` : "";

          return `${template.id} — ${template.name} (${template.types.join(", ") || "misc"})${charges}${recharge}`;
        })
        .join("\n"),
    };
  }

  if (commandName === "startCombat") {
    context.startCombat();
    return { status: "success", message: "Combat démarré." };
  }

  if (commandName === "endCombat") {
    context.endCombat();
    return { status: "success", message: "Combat terminé." };
  }

  if (commandName === "nextTurn") {
    context.nextCombatTurn();
    return { status: "success", message: "Tour suivant." };
  }

  if (commandName === "combatStatus") {
    const active = context.combat.combatants[context.combat.turnIndex];

    return {
      status: "info",
      message: [
        `Statut: ${context.combat.status}`,
        `Tour de jeu: ${context.combat.round}`,
        `Tour: ${active?.name ?? "-"}`,
        ...context.combat.combatants.map(
          (combatant) =>
            `${combatant.id} — ${combatant.name} (${combatant.side}) PV ${combatant.hp}/${combatant.maxHp} · pos ${combatant.position.x.toFixed(1)},${combatant.position.y.toFixed(1)}`,
        ),
      ].join("\n"),
    };
  }

  if (commandName === "listMapDetails") {
    const details = context.combat.map.details ?? [];

    return {
      status: "info",
      message: details.length > 0
        ? details
            .map((detail) =>
              `${detail.id} — ${detail.name} [${detail.visible === false ? "caché" : "visible"}] tags: ${detail.tags.join(", ")}`,
            )
            .join("\n")
        : "Aucun détail de terrain.",
    };
  }

  if (commandName === "revealDetail") {
    if (!id) {
      return { status: "error", message: "Id de détail manquant." };
    }

    const detail = context.combat.map.details?.find((candidate) => candidate.id === id);

    if (!detail) {
      return { status: "error", message: `Détail introuvable: ${id}` };
    }

    context.revealMapDetail(id);
    return { status: "success", message: `${detail.name} révélé.` };
  }

  if (commandName === "hideDetail") {
    if (!id) {
      return { status: "error", message: "Id de détail manquant." };
    }

    const detail = context.combat.map.details?.find((candidate) => candidate.id === id);

    if (!detail) {
      return { status: "error", message: `Détail introuvable: ${id}` };
    }

    context.hideMapDetail(id);
    return { status: "success", message: `${detail.name} masqué.` };
  }

  if (commandName === "addCombatant") {
    if (!id) {
      return { status: "error", message: "Id manquant." };
    }

    const character = findCharacter(context, id);

    if (character) {
      context.addCharacterToCombat(character.id);
      return { status: "success", message: `${character.name} ajouté au combat.` };
    }

    const side = isCombatSide(arg1) ? arg1 : "enemies";
    context.addEntityToCombat(id, side);
    return { status: "success", message: `${id} ajouté au combat (${side}).` };
  }

  if (commandName === "moveCombatant") {
    const x = parseNumber(arg1);
    const y = parseNumber(arg2);

    if (!id || x === null || y === null) {
      return { status: "error", message: "Utilise moveCombatant <combatantId> <x> <y>." };
    }

    context.moveCombatant(id, { x, y });
    return { status: "success", message: `${id} déplacé en ${x},${y}.` };
  }

  if (commandName === "inspectAbility") {
    if (!id) {
      return { status: "error", message: "abilityId manquant." };
    }

    const ability = context.abilityInstances.find((candidate) => candidate.id === id);

    if (!ability) {
      return { status: "error", message: `Capacité introuvable: ${id}` };
    }

    return {
      status: "info",
      message: formatAbilityDetails(context, ability),
    };
  }

  if (commandName === "rechargeAbility") {
    if (!id) {
      return { status: "error", message: "abilityId manquant." };
    }

    const ability = context.abilityInstances.find((candidate) => candidate.id === id);

    if (!ability) {
      return { status: "error", message: `Capacité introuvable: ${id}` };
    }

    context.rechargeAbility(id);
    return { status: "success", message: `${formatAbility(context, ability)} rechargée.` };
  }

  if (commandName === "setAbilityCharges") {
    if (!id) {
      return { status: "error", message: "abilityId manquant." };
    }

    const charges = parseNumber(arg1);

    if (charges === null) {
      return { status: "error", message: "Nombre de charges invalide." };
    }

    const ability = context.abilityInstances.find((candidate) => candidate.id === id);

    if (!ability) {
      return { status: "error", message: `Capacité introuvable: ${id}` };
    }

    context.setAbilityCharges(id, charges);
    return { status: "success", message: `${formatAbility(context, ability)} passe à ${charges} charge(s).` };
  }

  if (commandName === "inspectItem") {
    if (!id) {
      return { status: "error", message: "itemId manquant." };
    }

    const item = context.itemInstances.find((candidate) => candidate.id === id);

    if (!item) {
      return { status: "error", message: `Objet introuvable: ${id}` };
    }

    const template = getTemplate(context, item.templateId);

    return {
      status: "info",
      message: `${formatItem(context, item)}\n${template?.description ?? ""}\nEffets: ${formatItemEffects(item, template)}`,
    };
  }

  if (
    commandName === "equipItem" ||
    commandName === "unequipItem" ||
    commandName === "removeItem" ||
    commandName === "useItem"
  ) {
    if (!id) {
      return { status: "error", message: "itemId manquant." };
    }

    const item = context.itemInstances.find((candidate) => candidate.id === id);

    if (!item) {
      return { status: "error", message: `Objet introuvable: ${id}` };
    }

    if (commandName === "equipItem") {
      const template = getTemplate(context, item.templateId);

      if (!isItemEquipable(getTemplateTypes(template))) {
        return { status: "error", message: `${template?.name ?? item.id} n'a pas un type équipable.` };
      }

      context.equipItem(id);
      return { status: "success", message: `${formatItem(context, item)} équipé.` };
    }

    if (commandName === "unequipItem") {
      context.unequipItem(id);
      return { status: "success", message: `${formatItem(context, item)} rangé dans le sac.` };
    }

    if (commandName === "useItem") {
      const template = getTemplate(context, item.templateId);

      if (!isItemUsable(getTemplateTypes(template))) {
        return { status: "error", message: `${formatItem(context, item)} n'a pas le type consommable.` };
      }

      context.useItem(id);
      return { status: "success", message: `${formatItem(context, item)} utilisé.` };
    }

    context.removeItem(id);
    return { status: "success", message: `${formatItem(context, item)} supprimé.` };
  }

  const character = requireCharacter(context, id);

  if ("status" in character) {
    return character;
  }

  if (commandName === "inspect") {
    return {
      status: "info",
      message: `${character.name}\nPV ${character.pv}/${character.maxPv}\nFOR ${character.stats.force} · DEX ${character.stats.dexterite} · CON ${character.stats.constitution} · INT ${character.stats.intelligence} · SAG ${character.stats.sagesse} · CHA ${character.stats.charisme}`,
    };
  }

  if (commandName === "listItems") {
    const items = context.itemInstances.filter((item) => item.location.parent === character.id);
    const equipped = items.filter((item) => item.location.type === "equipped");
    const bag = items.filter((item) => item.location.type === "inventory");

    return {
      status: "info",
      message: [
        "Équipement:",
        equipped.length > 0 ? equipped.map((item) => formatItem(context, item)).join("\n") : "-",
        "Sac:",
        bag.length > 0 ? bag.map((item) => formatItem(context, item)).join("\n") : "-",
      ].join("\n"),
    };
  }

  if (commandName === "listAbilities") {
    const abilities = context.abilityInstances.filter((ability) => ability.ownerId === character.id);

    return {
      status: "info",
      message:
        abilities.length > 0
          ? abilities.map((ability) => formatAbility(context, ability)).join("\n")
          : "Aucune capacité.",
    };
  }

  if (commandName === "useAbility") {
    if (!arg1) {
      return { status: "error", message: "abilityId manquant." };
    }

    const ability = context.abilityInstances.find(
      (candidate) => candidate.id === arg1 && candidate.ownerId === character.id,
    );

    if (!ability) {
      return { status: "error", message: `Capacité introuvable pour ${character.name}: ${arg1}` };
    }

    const used = context.useAbility(arg1);

    if (!used) {
      return { status: "error", message: `${formatAbility(context, ability)} n'a plus de charge disponible.` };
    }

    return { status: "success", message: `${character.name} utilise ${formatAbility(context, ability)}.` };
  }

  if (commandName === "shortRest" || commandName === "longRest") {
    const type = commandName === "shortRest" ? "short" : "long";
    context.rest(character.id, type);

    return {
      status: "success",
      message: `${character.name} termine un repos ${type === "short" ? "court" : "long"}.`,
    };
  }

  if (commandName === "startEncounter") {
    context.startEncounter(character.id);
    return { status: "success", message: `Nouvelle rencontre pour ${character.name}.` };
  }

  if (commandName === "giveItem") {
    if (!arg1) {
      return { status: "error", message: "templateId manquant." };
    }

    const quantity = parseNumber(arg2) ?? 1;
    const item = context.giveItem(character.id, arg1, quantity);

    if (!item) {
      return { status: "error", message: `Template introuvable: ${arg1}` };
    }

    return { status: "success", message: `${formatItem(context, item)} ajouté au sac.` };
  }

  if (commandName === "pickupItem") {
    if (!arg1) return { status: "error", message: "itemId manquant." };
    const item = context.itemInstances.find((candidate) => candidate.id === arg1);

    if (!item) return { status: "error", message: `Instance introuvable: ${arg1}` };
    if (!context.pickupItem(item.id, character.id)) {
      return { status: "error", message: `${formatItem(context, item)} n'est pas disponible dans le monde.` };
    }

    return { status: "success", message: `${character.name} ramasse ${formatItem(context, item)}.` };
  }

  if (commandName === "dealDamage" || commandName === "heal" || commandName === "setPv") {
    const amount = parseNumber(arg1);

    if (amount === null) {
      return { status: "error", message: "Montant invalide." };
    }

    if (commandName === "dealDamage") {
      const damageType = arg2 ?? "force";
      context.dealDamage(character.id, amount, damageType);
      return { status: "success", message: `${character.name} subit ${amount} dégâts (${damageType}).` };
    }

    if (commandName === "heal") {
      context.healCharacter(character.id, amount);
      return { status: "success", message: `${character.name} récupère ${amount} PV.` };
    }

    context.setCharacterPv(character.id, amount);
    return { status: "success", message: `${character.name} passe à ${amount} PV.` };
  }

  if (commandName === "changeStat") {
    const stat = arg1 ? statAliases[arg1.toLowerCase()] : undefined;

    if (!stat) {
      return { status: "error", message: "Stat inconnue. Utilise FOR, DEX, CON, INT, SAG ou CHA." };
    }

    if (!arg2) {
      return { status: "error", message: "Valeur manquante." };
    }

    const mode = arg2.startsWith("+") || arg2.startsWith("-") ? "add" : "set";
    const value = parseNumber(arg2);

    if (value === null) {
      return { status: "error", message: "Valeur invalide." };
    }

    context.changeCharacterStat(character.id, stat, value, mode);
    return {
      status: "success",
      message:
        mode === "add"
          ? `${character.name}: ${stat} ${value >= 0 ? "+" : ""}${value}.`
          : `${character.name}: ${stat} fixé à ${value}.`,
    };
  }

  return {
    status: "error",
    message: `Commande inconnue: ${commandName}. Tape help pour voir la liste.`,
  };
}
