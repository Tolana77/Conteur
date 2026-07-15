import type { EffectTemplate, ItemEffectRef } from "../../app/types";

/**
 * Un effet créé par IA reste une référence de catalogue. À l'exécution, il est
 * développé en opérations fermées ; aucun script libre n'entre dans le moteur.
 */
export function resolveEffectReferences(
  references: ItemEffectRef[],
  templates: EffectTemplate[],
): ItemEffectRef[] {
  const byId = new Map(templates.map((template) => [template.id, template]));

  return references.flatMap((reference) => {
    const template = byId.get(reference.effectId);
    if (!template) return [reference];

    return template.actions.map((action) => ({
      effectId: action.operation,
      nom: reference.nom ?? template.name,
      variables: {
        ...action.variables,
        ...(reference.variables ?? {}),
      },
    }));
  });
}
