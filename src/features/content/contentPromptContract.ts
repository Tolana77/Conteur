export const targetingContentSchema =
  "targeting={aim:{allowed:[self|entity|position|direction|item],required,range,lineOfSight,label?:cible|destination},affects:{allowed:[self|living|enemy|ally|object|position],includeSelf?,maxTargets?},area?:{shape:none|circle|cone|line|selfAura,radius?,length?,width?},defaultPriority?,suggestedSides?}";

export const assetContentSchemaText = [
  "Effect={id,name,description,tags,actions:[{operation,variables}]}",
  `Ability={id,name,description,types,tags,combatRole?,activation:{timing:action|bonus|reaction|free|passive},resourceCost?,${targetingContentSchema},charges?:{max,initial?,recharge:[shortRest|longRest|encounter|manual|never],rechargeAmount?},effects:[{effectId,variables}],modules:{ability:{}}}`,
  `Item={id,type,types,tags,aliases?,name,description,rarity:mundane|common|uncommon|rare|veryRare|legendary|artifact,requiresAttunement?,base:{weight,...},effects:[{effectId,variables}],attacks?:[{id,name,label,range,damage,damageType,attackKind,cost,${targetingContentSchema}?}],${targetingContentSchema}?,modules:{item:{}}}`,
  "Instance={id?,templateId?,quantity,overrides,current,data,effects,location:{type:inventory|equipped|world,parent:id|null}}",
].join(" | ");

export const enemyContentSchemaText =
  "Enemy={id,name,description,level,category,tags,hp:number|dice,defense,initiative,speed,reach,attacks:[{id,name,attackKind,attackBonus,damage,damageType,range,cost,tags}],abilityTemplateIds,behavior:{role,aggression:0..5,preferredRange,retreatBelowHpPercent?,priorities},resistances,vulnerabilities,immunities}";

export const contentCreationIdInstruction =
  "Tu peux créer un id uniquement pour le nouveau contenu demandé. Utilise un id stable en kebab-case préfixé par effect-, ability-, item- ou enemy-. Toute référence doit viser un id du catalogue ou un id créé dans la même réponse.";
