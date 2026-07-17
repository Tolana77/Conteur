import type {
  AbilityInstance,
  AbilityTemplate,
  CombatScene,
  EffectTemplate,
  EnemyTemplate,
  Entity,
  GameActionTemplate,
  ItemEffectRef,
  ItemInstance,
  ItemTemplate,
} from "../../app/types";
import { initialAbilityTemplates } from "../abilities/abilityTemplates";
import { initialItemTemplates } from "../items/itemTemplates";
import { initialEffectTemplates, initialEnemyTemplates } from "./contentCatalog";

export type ContentTemplateKind = "effect" | "ability" | "item" | "enemy";
export type ContentTemplate = EffectTemplate | AbilityTemplate | ItemTemplate | EnemyTemplate;
export type ContentMutationSource = "ai" | "admin" | "system";
export type ContentAuditAction =
  | "create"
  | "replace"
  | "duplicate"
  | "activate"
  | "deactivate"
  | "delete"
  | "restore";

export interface ContentMutationMeta {
  source?: ContentMutationSource;
  action?: Extract<ContentAuditAction, "create" | "replace" | "duplicate" | "restore">;
  note?: string;
}

export interface ContentAuditEntry {
  id: string;
  timestamp: number;
  source: ContentMutationSource;
  action: ContentAuditAction;
  kind: ContentTemplateKind;
  templateId: string;
  templateName: string;
  before?: ContentTemplate;
  after?: ContentTemplate;
  note?: string;
}

export interface DisabledContentTemplateIds {
  effect: string[];
  ability: string[];
  item: string[];
  enemy: string[];
}

export interface ContentDependency {
  id: string;
  kind: "template" | "instance" | "combatant" | "worldEntity";
  label: string;
  relationship: string;
}

export interface ContentDependencyContext {
  effectTemplates: EffectTemplate[];
  abilityTemplates: AbilityTemplate[];
  gameActionTemplates: GameActionTemplate[];
  itemTemplates: ItemTemplate[];
  enemyTemplates: EnemyTemplate[];
  itemInstances: ItemInstance[];
  abilityInstances: AbilityInstance[];
  combat: CombatScene;
  worldEntities: Entity[];
}

export interface ContentDeletionResult {
  success: boolean;
  reasons: string[];
}

const builtInIds: Record<ContentTemplateKind, ReadonlySet<string>> = {
  effect: new Set(initialEffectTemplates.map((template) => template.id)),
  ability: new Set(initialAbilityTemplates.map((template) => template.id)),
  item: new Set(initialItemTemplates.map((template) => template.id)),
  enemy: new Set(initialEnemyTemplates.map((template) => template.id)),
};

export function createEmptyDisabledContentTemplateIds(): DisabledContentTemplateIds {
  return { effect: [], ability: [], item: [], enemy: [] };
}

export function isBuiltInContentTemplate(kind: ContentTemplateKind, templateId: string): boolean {
  return builtInIds[kind].has(templateId);
}

export function isContentTemplateActive(
  disabledIds: DisabledContentTemplateIds,
  kind: ContentTemplateKind,
  templateId: string,
): boolean {
  return !disabledIds[kind].includes(templateId);
}

export function getContentTemplateDependencies(
  kind: ContentTemplateKind,
  templateId: string,
  context: ContentDependencyContext,
): ContentDependency[] {
  const dependencies: ContentDependency[] = [];
  const seen = new Set<string>();
  const add = (dependency: ContentDependency) => {
    const signature = `${dependency.kind}:${dependency.id}:${dependency.relationship}`;
    if (seen.has(signature)) return;
    seen.add(signature);
    dependencies.push(dependency);
  };
  const itemName = (id: string) => context.itemTemplates.find((template) => template.id === id)?.name ?? id;
  const abilityName = (id: string) => {
    const ability = context.abilityTemplates.find((template) => template.id === id);
    return ability
      ? context.gameActionTemplates.find((action) => action.id === ability.actionId)?.name ?? id
      : id;
  };

  if (kind === "effect") {
    context.itemTemplates.forEach((template) => {
      if (template.effects.some((effect) => effect.effectId === templateId)) {
        add({ id: template.id, kind: "template", label: template.name, relationship: "Effet d'objet" });
      }
    });
    context.gameActionTemplates.forEach((template) => {
      if (template.effects.some((effect) => effect.effectId === templateId)) {
        add({ id: template.id, kind: "template", label: template.name, relationship: "Effet d'action" });
      }
    });
    context.itemInstances.forEach((instance) => {
      if (instance.effects.some((effect) => effect.effectId === templateId)) {
        add({ id: instance.id, kind: "instance", label: itemName(instance.templateId), relationship: "Effet propre à l'instance" });
      }
    });
    context.abilityInstances.forEach((instance) => {
      if (instance.effects.some((effect) => effect.effectId === templateId)) {
        add({ id: instance.id, kind: "instance", label: abilityName(instance.templateId), relationship: "Effet propre à la capacité" });
      }
    });
  }

  if (kind === "ability") {
    collectEffectVariableDependencies(context, "grantAbility", "abilityTemplateId", templateId, add);
    context.enemyTemplates.forEach((template) => {
      if (template.abilityTemplateIds.includes(templateId)) {
        add({ id: template.id, kind: "template", label: template.name, relationship: "Capacité d'ennemi" });
      }
    });
    context.abilityInstances.forEach((instance) => {
      if (instance.templateId === templateId) {
        add({ id: instance.id, kind: "instance", label: abilityName(instance.templateId), relationship: "Capacité accordée" });
      }
    });
  }

  if (kind === "item") {
    context.itemInstances.forEach((instance) => {
      if (instance.templateId === templateId) {
        add({ id: instance.id, kind: "instance", label: itemName(instance.templateId), relationship: "Instance d'objet" });
      }
    });
    collectEffectVariableDependencies(context, "inventoryInteraction", "requiredTemplateId", templateId, add);
    collectEffectVariableDependencies(context, "inventoryInteraction", "addTemplateId", templateId, add);
  }

  if (kind === "enemy") {
    collectEffectVariableDependencies(context, "summon", "enemyTemplateId", templateId, add);
    context.combat.combatants.forEach((combatant) => {
      if (combatant.enemyTemplateId === templateId) {
        add({ id: combatant.id, kind: "combatant", label: combatant.name, relationship: "Combattant actif" });
      }
    });
    context.worldEntities.forEach((entity) => {
      if (entity.details?.enemyTemplateId === templateId) {
        add({ id: entity.id, kind: "worldEntity", label: entity.name, relationship: "Entité du monde" });
      }
    });
  }

  return dependencies.sort((left, right) =>
    left.relationship.localeCompare(right.relationship, "fr") || left.label.localeCompare(right.label, "fr"));
}

export function cloneContentTemplate<T extends ContentTemplate>(template: T): T {
  return JSON.parse(JSON.stringify(template)) as T;
}

function collectEffectVariableDependencies(
  context: ContentDependencyContext,
  operation: string,
  variable: string,
  expectedId: string,
  add: (dependency: ContentDependency) => void,
): void {
  const inspectReferences = (
    references: ItemEffectRef[],
    dependency: Omit<ContentDependency, "relationship">,
  ) => {
    references.forEach((reference) => {
      if (reference.effectId === operation && reference.variables?.[variable] === expectedId) {
        add({ ...dependency, relationship: effectRelationship(operation, variable) });
      }
    });
  };

  context.itemTemplates.forEach((template) =>
    inspectReferences(template.effects, { id: template.id, kind: "template", label: template.name }));
  context.gameActionTemplates.forEach((template) =>
    inspectReferences(template.effects, { id: template.id, kind: "template", label: template.name }));
  context.itemInstances.forEach((instance) =>
    inspectReferences(instance.effects, {
      id: instance.id,
      kind: "instance",
      label: context.itemTemplates.find((template) => template.id === instance.templateId)?.name ?? instance.id,
    }));
  context.abilityInstances.forEach((instance) =>
    inspectReferences(instance.effects, {
      id: instance.id,
      kind: "instance",
      label: abilityNameFromContext(context, instance.templateId) ?? instance.id,
    }));
  context.effectTemplates.forEach((template) => {
    if (template.actions.some((action) => action.operation === operation && action.variables[variable] === expectedId)) {
      add({ id: template.id, kind: "template", label: template.name, relationship: effectRelationship(operation, variable) });
    }
  });
}

function abilityNameFromContext(context: ContentDependencyContext, templateId: string): string | undefined {
  const ability = context.abilityTemplates.find((template) => template.id === templateId);
  return ability
    ? context.gameActionTemplates.find((action) => action.id === ability.actionId)?.name
    : undefined;
}

function effectRelationship(operation: string, variable: string): string {
  if (operation === "grantAbility") return "Accorde cette capacité";
  if (operation === "summon") return "Invoque ce profil";
  return variable === "addTemplateId" ? "Crée cet objet" : "Requiert cet objet";
}
