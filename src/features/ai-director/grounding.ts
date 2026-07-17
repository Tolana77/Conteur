import type { Entity, ItemInstance, ItemTemplate } from "../../app/types";
import type { GameState } from "../../store/useGameStore";
import type { AiResolutionDraftPatch } from "./types";

export type PlayerClaimStatus = "established" | "unverified";
export type PlayerClaimDomain = "inventory" | "relationship" | "world";

export interface PlayerClaimAssessment {
  phrase: string;
  subject: string;
  status: PlayerClaimStatus;
  domain: PlayerClaimDomain;
  evidence?: string;
}

export type SocialRank =
  | "outsider"
  | "commoner"
  | "notable"
  | "noble"
  | "highNoble"
  | "sovereign";

export interface GroundedNpcDossier {
  id: string;
  name: string;
  present: boolean;
  role: string;
  rank: SocialRank;
  access: "open" | "guarded" | "restricted";
  disposition: string;
  goal: string;
  fear: string;
  protocol: string;
  attentionRule: string;
  directAttentionAllowed: boolean;
  expectedIntermediary: string;
  delegatesTo: string[];
  knownFacts: string[];
}

export interface GroundingReport {
  claims: PlayerClaimAssessment[];
  npcDossiers: GroundedNpcDossier[];
  mentionedEntityIds: string[];
  blockedSubjects: string[];
  requiresWorldManager: boolean;
  requiresCharacterManager: boolean;
  mustAdvanceScene: boolean;
  socialIncident?: {
    severity: "disruptive" | "severe";
    witnessed: boolean;
  };
}

const ABSTRACT_POSSESSIONS = new Set([
  "avis",
  "attention",
  "action",
  "but",
  "besoin",
  "campagne",
  "chaud",
  "cas",
  "choix",
  "confiance",
  "cote",
  "esprit",
  "envie",
  "facon",
  "gauche",
  "faim",
  "froid",
  "idee",
  "intention",
  "inventaire",
  "nom",
  "opinion",
  "peur",
  "honte",
  "mal",
  "personnage",
  "regard",
  "raison",
  "role",
  "sac",
  "tour",
  "temps",
  "truc",
  "vie",
]);

const BODY_PARTS = new Set([
  "bras",
  "coeur",
  "corps",
  "dos",
  "doigt",
  "jambe",
  "main",
  "oeil",
  "oreille",
  "pied",
  "tete",
  "visage",
  "voix",
]);

const LEADING_ADJECTIVES = new Set([
  "ancien",
  "ancienne",
  "cher",
  "chere",
  "fidele",
  "grand",
  "grande",
  "jeune",
  "petit",
  "petite",
  "propre",
  "vieux",
  "vieil",
  "vieille",
]);

const INVENTORY_HINTS = new Set([
  "arme",
  "armure",
  "arc",
  "bouclier",
  "bourse",
  "couteau",
  "corde",
  "dague",
  "epee",
  "fiole",
  "lame",
  "lanterne",
  "potion",
  "sac",
  "torche",
]);

const RELATIONSHIP_HINTS = new Set([
  "ami",
  "amie",
  "cheval",
  "chien",
  "compagnon",
  "compagne",
  "ecuyer",
  "familier",
  "frere",
  "monture",
  "serviteur",
  "servante",
  "soeur",
]);

const PERSON_ROLE_TERMS = new Set([
  "aubergiste",
  "baron",
  "baronne",
  "capitaine",
  "chambellan",
  "comte",
  "comtesse",
  "duc",
  "duchesse",
  "garde",
  "marchand",
  "marchande",
  "prince",
  "princesse",
  "pretre",
  "pretresse",
  "reine",
  "roi",
  "servante",
  "serviteur",
  "souverain",
  "souveraine",
  "tavernier",
]);

const SOCIAL_ACTION_PATTERN = /\b(adresse|appelle|demande|dis|discute|interroge|insulte|menace|parle|repond|salue|supplie|vole)\b/u;
const WAIT_PATTERN = /\b(attends?|attendons|patiente|restons|reste|ne fais rien|laisse venir|ecoute encore)\b/u;

export function buildGroundingReport(playerInput: string, state: GameState): GroundingReport {
  const normalizedInput = normalize(playerInput);
  const entities = getWorldEntities(state);
  const mentionedEntities = findMentionedEntities(normalizedInput, entities, state);
  const claims = assessPlayerClaims(playerInput, state, entities);
  const npcDossiers = createNpcDossiers(mentionedEntities, state, normalizedInput);
  const socialIncident = assessSocialIncident(normalizedInput, state);

  return {
    claims,
    npcDossiers,
    mentionedEntityIds: mentionedEntities.map((entity) => entity.id),
    blockedSubjects: claims.filter((claim) => claim.status === "unverified").map((claim) => claim.subject),
    requiresWorldManager: npcDossiers.length > 0 || claims.some((claim) => claim.domain !== "inventory"),
    requiresCharacterManager: claims.some((claim) => claim.domain === "inventory"),
    mustAdvanceScene: WAIT_PATTERN.test(normalizedInput) && (
      state.narrativeScene.activeEvents.length > 0 ||
      Boolean(state.narrativeScene.lastNarratedBeat.trim())
    ),
    ...(socialIncident ? { socialIncident } : {}),
  };
}

export function createGroundingDraftPatch(report: GroundingReport): AiResolutionDraftPatch | undefined {
  const unverifiedClaims = report.claims.filter((claim) => claim.status === "unverified");
  const facts: NonNullable<AiResolutionDraftPatch["facts"]> = [];

  unverifiedClaims.forEach((claim) => {
    facts.push({
      source: "localEngine",
      kind: "unverifiedPlayerClaim",
      content: createUnverifiedClaimConstraint(claim),
      visibility: "gmOnly",
    });
    facts.push({
      source: "localEngine",
      kind: "unverifiedPlayerClaimResult",
      content: createUnverifiedClaimResult(claim),
      visibility: "playerVisible",
    });
  });

  report.npcDossiers.forEach((dossier) => {
    facts.push({
      source: "localEngine",
      kind: "npcAuthorityProfile",
      content: `${dossier.name} : rôle ${dossier.role}; rang ${dossier.rank}; ${dossier.present ? "présent" : "absent de la scène"}; accès ${dossier.access}; disposition ${dossier.disposition}; objectif ${dossier.goal}; protocole ${dossier.protocol}; attention ${dossier.attentionRule}; attention directe ${dossier.directAttentionAllowed ? "permise" : `refusée, passer par ${dossier.expectedIntermediary}`}.`,
      visibility: "gmOnly",
      relatedIds: [dossier.id],
    });
  });

  if (report.mustAdvanceScene) {
    facts.push({
      source: "localEngine",
      kind: "sceneProgressionRequired",
      content: "Le joueur laisse passer du temps : la réponse doit faire évoluer au moins un événement, une position, une décision de PNJ ou une condition observable. Répéter la dernière étape est interdit.",
      visibility: "gmOnly",
    });
  }

  if (report.socialIncident?.witnessed) {
    facts.push({
      source: "localEngine",
      kind: "socialReactionRequired",
      content: `La scène contient une transgression ${report.socialIncident.severity === "severe" ? "grave" : "perturbatrice"} perceptible par des témoins. La réponse doit montrer au moins une réaction immédiate et proportionnée : attention, malaise, opposition, alerte, intervention ou délégation selon le statut des personnes présentes.`,
      visibility: "gmOnly",
    });
  }

  if (facts.length === 0) return undefined;
  return {
    facts,
    warnings: unverifiedClaims.map((claim) => `Affirmation non établie neutralisée : ${claim.phrase}.`),
  };
}

export function validateGroundedNarration(
  narration: string,
  playerInput: string,
  report: GroundingReport,
  state: GameState,
): string[] {
  const normalizedNarration = normalize(narration);
  const violations: string[] = [];

  report.claims.filter((claim) => claim.status === "unverified").forEach((claim) => {
    const references = getClaimReferenceTerms(claim);
    const index = references.reduce(
      (found, reference) => found >= 0 ? found : normalizedNarration.indexOf(reference),
      -1,
    );
    if (index < 0) return;
    const window = normalizedNarration.slice(Math.max(0, index - 70), index + 150);
    if (!hasNegationOrAbsence(window)) {
      violations.push(`La narration matérialise la ressource non établie « ${claim.subject} ».`);
    }
  });

  report.npcDossiers.filter((dossier) => !dossier.present).forEach((dossier) => {
    const name = normalize(dossier.name);
    const index = normalizedNarration.indexOf(name);
    if (index < 0) return;
    const window = normalizedNarration.slice(Math.max(0, index - 80), index + name.length + 100);
    if (
      /\b(approche|arrive|dit|demande|entre|fait|frappe|ordonne|parle|repond|regarde|s avance|saisit|sourit|vous tend)\b/u.test(window) &&
      !hasNegationOrAbsence(window)
    ) {
      violations.push(`${dossier.name} agit alors que cette entité est absente de la scène.`);
    }
  });

  report.npcDossiers.filter((dossier) => dossier.present && !dossier.directAttentionAllowed).forEach((dossier) => {
    const references = [normalize(dossier.name), ...getRoleReferenceTerms(dossier.role)];
    const index = references.reduce((found, reference) => found >= 0 ? found : normalizedNarration.indexOf(reference), -1);
    if (index < 0) return;
    const window = normalizedNarration.slice(Math.max(0, index - 90), index + 180);
    if (
      /\b(accepte votre requete|s adresse a vous|vous accorde|vous demande|vous dit|vous repond|vous sourit|vous tend)\b/u.test(window) &&
      !hasNegationOrAbsence(window)
    ) {
      violations.push(`${dossier.name} accorde une attention directe incompatible avec son rang et le protocole établi.`);
    }
  });

  if (report.mustAdvanceScene) {
    const similarity = textSimilarity(narration, state.narrativeScene.lastNarratedBeat);
    if (similarity >= 0.68) {
      violations.push("La narration répète le dernier temps de scène au lieu de faire progresser l'événement.");
    }
  }

  if (WAIT_PATTERN.test(normalize(playerInput)) && normalize(narration) === normalize(state.narrativeScene.lastNarratedBeat)) {
    violations.push("La narration reproduit exactement la réponse précédente.");
  }

  if (report.socialIncident?.witnessed && !showsImmediateSocialReaction(normalizedNarration)) {
    violations.push("La narration ignore une transgression perceptible au lieu de montrer la réaction des témoins ou de l'autorité.");
  }

  return [...new Set(violations)];
}

export function formatGroundingForNarrator(report: GroundingReport) {
  return {
    claims: report.claims.map((claim) => ({
      phrase: claim.phrase,
      subject: claim.subject,
      status: claim.status,
      domain: claim.domain,
      evidence: claim.evidence,
    })),
    npcs: report.npcDossiers,
    mustAdvanceScene: report.mustAdvanceScene,
  };
}

function assessPlayerClaims(playerInput: string, state: GameState, entities: Entity[]): PlayerClaimAssessment[] {
  const claims: PlayerClaimAssessment[] = [];
  const expression = /\b(mon|ma|mes|notre|nos)\s+([\p{L}-]+)(?:\s+([\p{L}-]+))?/giu;
  const inventory = createOwnedInventorySearch(state.itemInstances, state.itemTemplates, state.selectedCharacterId);
  const character = state.characters.find((candidate) => candidate.id === state.selectedCharacterId);
  const establishedText = normalize([
    character?.origin,
    character?.description,
    ...(character?.history ?? []),
    ...state.campaign.world.facts,
  ].filter(Boolean).join(" "));

  const registerClaim = (rawSubject: string, phrase: string) => {
    const subject = normalize(rawSubject);
    if (!subject || ABSTRACT_POSSESSIONS.has(subject) || BODY_PARTS.has(subject)) return;

    const inventoryEvidence = inventory.find((entry) => entry.searchable.includes(subject));
    const relatedEntity = entities.find((entity) => {
      const searchable = normalize(`${entity.name} ${entity.description} ${entity.details?.role ?? ""} ${(entity.details?.tags ?? []).join(" ")}`);
      const linked = entity.details?.connections?.includes(state.selectedCharacterId) || entity.details?.ownerId === state.selectedCharacterId;
      return linked && searchable.includes(subject);
    });
    const historyEvidence = establishedText.includes(`mon ${subject}`) ||
      establishedText.includes(`ma ${subject}`) ||
      establishedText.includes(`son ${subject}`) ||
      establishedText.includes(`sa ${subject}`);
    const status: PlayerClaimStatus = inventoryEvidence || relatedEntity || historyEvidence ? "established" : "unverified";
    const domain: PlayerClaimDomain = inventoryEvidence || INVENTORY_HINTS.has(subject)
      ? "inventory"
      : RELATIONSHIP_HINTS.has(subject) || relatedEntity
        ? "relationship"
        : "world";

    claims.push({
      phrase,
      subject,
      status,
      domain,
      ...(inventoryEvidence
        ? { evidence: `objet ${inventoryEvidence.id}` }
        : relatedEntity
          ? { evidence: `entité ${relatedEntity.id}` }
          : historyEvidence
            ? { evidence: "historique établi" }
            : {}),
    });
  };

  for (const match of playerInput.matchAll(expression)) {
    const first = normalize(match[2] ?? "");
    const second = normalize(match[3] ?? "");
    const subject = LEADING_ADJECTIVES.has(first) && second ? second : first;
    const phrase = `${match[1]} ${match[2]}${LEADING_ADJECTIVES.has(first) && match[3] ? ` ${match[3]}` : ""}`;
    registerClaim(subject, phrase);
  }

  const normalizedInput = normalize(playerInput);
  const assertedPossession = /\b(j ai|je possede|je transporte|je connais|je voyage avec|on m a donne|m a donne)\s+(?:un|une|des|du|de la|le|la)?\s*([a-z-]+)/gu;
  for (const match of normalizedInput.matchAll(assertedPossession)) {
    registerClaim(match[2] ?? "", match[0]);
  }

  const namedAddress = /\b(?:J['’]appelle|Je salue|Je parle à|Je demande à)\s+([A-ZÀ-ÖØ-Ý][\p{L}-]+)/gu;
  for (const match of playerInput.matchAll(namedAddress)) {
    const name = match[1] ?? "";
    const known = entities.some((entity) => normalize(entity.name).includes(normalize(name)));
    if (!known) registerClaim(name, match[0]);
  }

  const roleReference = /\b(?:le|la|l)\s+([a-z-]+)/gu;
  for (const match of normalizedInput.matchAll(roleReference)) {
    const role = match[1] ?? "";
    if (!PERSON_ROLE_TERMS.has(role)) continue;
    const known = entities.some((entity) => normalize(`${entity.name} ${entity.details?.role ?? ""}`).includes(role));
    if (!known) registerClaim(role, match[0]);
  }

  return deduplicateClaims(claims);
}

function createOwnedInventorySearch(
  instances: ItemInstance[],
  templates: ItemTemplate[],
  characterId: string,
) {
  return instances
    .filter((item) => item.location.parent === characterId && item.quantity > 0)
    .map((item) => {
      const template = templates.find((candidate) => candidate.id === item.templateId);
      return {
        id: item.id,
        searchable: normalize([
          item.overrides.name,
          template?.name,
          template?.type,
          ...(template?.aliases ?? []),
          ...(template?.types ?? []),
          ...(template?.tags ?? []),
        ].filter(Boolean).join(" ")),
      };
    });
}

function findMentionedEntities(input: string, entities: Entity[], state: GameState): Entity[] {
  const presentIds = new Set(state.narrativeScene.presentEntityIds);
  const socialAction = SOCIAL_ACTION_PATTERN.test(input);
  const ranked = entities
    .map((entity) => ({ entity, score: getEntityMentionScore(input, entity) + (socialAction && presentIds.has(entity.id) ? 2 : 0) }))
    .filter(({ entity, score }) => score >= 6 || (socialAction && entity.type === "npc" && presentIds.has(entity.id)))
    .sort((left, right) => right.score - left.score)
    .map(({ entity }) => entity);
  const direct = ranked.slice(0, 6);
  const connectedIds = new Set(direct.flatMap((entity) => entity.details?.connections ?? []));
  const connected = entities.filter((entity) => connectedIds.has(entity.id)).slice(0, 2);
  return [...direct, ...connected].filter(
    (entity, index, collection) => collection.findIndex((candidate) => candidate.id === entity.id) === index,
  ).slice(0, 8);
}

function getEntityMentionScore(input: string, entity: Entity): number {
  const name = normalize(entity.name);
  const role = normalize(entity.details?.role ?? "");
  let score = name.length >= 3 && input.includes(name) ? 20 : 0;
  name.split(/\s+/u).filter((token) => token.length >= 4).forEach((token) => {
    if (input.includes(token)) score += 5;
  });
  role.split(/\s+/u).filter((token) => token.length >= 4).forEach((token) => {
    if (input.includes(token)) score += 6;
  });
  (entity.details?.aliases ?? []).forEach((alias) => {
    if (input.includes(normalize(alias))) score += 10;
  });
  return score;
}

function createNpcDossiers(entities: Entity[], state: GameState, input: string): GroundedNpcDossier[] {
  const presentIds = new Set(state.narrativeScene.presentEntityIds);
  const establishedDirectAccess = hasEstablishedDirectAccess(state);
  return entities.filter((entity) => entity.type === "npc").map((entity) => {
    const rank = entity.details?.socialRank ?? inferSocialRank(entity);
    const access = entity.details?.access ?? (rank === "sovereign" || rank === "highNoble"
      ? "restricted"
      : rank === "noble" || rank === "notable" ? "guarded" : "open");
    const connectedToPlayer = entity.details?.connections?.includes(state.selectedCharacterId) ||
      entity.details?.ownerId === state.selectedCharacterId;
    const majorIncident = /\b(attaque|frappe|incendie|poignarde|tue|menace de mort|otage)\b/u.test(input) ||
      state.narrativeScene.alertLevel >= 3;
    const directAttentionAllowed = access === "open" || connectedToPlayer || majorIncident || establishedDirectAccess;
    return {
      id: entity.id,
      name: entity.name,
      present: presentIds.has(entity.id),
      role: entity.details?.role?.trim() || "personne sans fonction précisée",
      rank,
      access,
      disposition: entity.details?.disposition?.trim() || inferDisposition(entity),
      goal: entity.details?.desire?.trim() || "préserver ses intérêts immédiats",
      fear: entity.details?.fear?.trim() || "perdre le contrôle de la situation",
      protocol: entity.details?.protocol?.trim() || inferProtocol(rank),
      attentionRule: entity.details?.attentionRule?.trim() || inferAttentionRule(rank),
      directAttentionAllowed,
      expectedIntermediary: entity.details?.delegatesTo?.[0] ?? inferIntermediary(rank),
      delegatesTo: entity.details?.delegatesTo?.slice(0, 3) ?? [],
      knownFacts: entity.details?.knownFacts?.slice(0, 4) ?? [],
    };
  });
}

function assessSocialIncident(input: string, state: GameState): GroundingReport["socialIncident"] {
  const severe = /\b(agresse|attaque|derobe|empoisonne|frappe|incendie|menace de mort|poignarde|subtilise|tue|vole)\b/u.test(input);
  const disruptive = /\b(comme un ivrogne|crie|fait un scandale|hurle|insulte|ivre|menace|provoque)\b/u.test(input);
  if (!severe && !disruptive) return undefined;

  const authorityContext = /\b(cour|garde|palais|prison|reine|roi|temple|tribunal)\b/u.test(
    `${input} ${normalize(state.narrativeScene.locationLabel)}`,
  );
  const witnessed = state.narrativeScene.presentEntityIds.length > 0 || (disruptive && authorityContext);
  return {
    severity: severe ? "severe" : "disruptive",
    witnessed,
  };
}

function hasEstablishedDirectAccess(state: GameState): boolean {
  const evidence = normalize([
    state.narrativeScene.playerPosition,
    ...state.narrativeScene.recentConsequences.slice(-5),
  ].join(" "));
  return /\b(admis en audience|audience accordee|entretien accorde|introduit aupres|recu par|recoit en audience)\b/u.test(evidence);
}

function inferSocialRank(entity: Entity): SocialRank {
  const text = normalize(`${entity.name} ${entity.details?.role ?? ""} ${(entity.details?.tags ?? []).join(" ")}`);
  if (/\b(empereur|imperatrice|roi|reine|souverain|souveraine)\b/u.test(text)) return "sovereign";
  if (/\b(archiduc|archiduchesse|duc|duchesse|prince|princesse)\b/u.test(text)) return "highNoble";
  if (/\b(baron|baronne|comte|comtesse|marquis|marquise|noble|seigneur|dame de cour)\b/u.test(text)) return "noble";
  if (/\b(capitaine|chambellan|chef|conseiller|eveque|juge|maitre|marchand|officier|pretre)\b/u.test(text)) return "notable";
  if (/\b(mendiant|etranger|prisonnier|vagabond)\b/u.test(text)) return "outsider";
  return "commoner";
}

function inferDisposition(entity: Entity): string {
  const importance = normalize(entity.details?.importance ?? "");
  if (/hostile|ennemi|menace/u.test(importance)) return "hostile mais guidée par ses intérêts";
  if (/allie|amical|proche/u.test(importance)) return "favorable sans être complaisante";
  return "indifférente tant que le personnage ne touche pas à ses intérêts";
}

function inferProtocol(rank: SocialRank): string {
  if (rank === "sovereign") return "l'accès direct exige une audience; serviteurs et gardes filtrent les inconnus";
  if (rank === "highNoble") return "les inconnus passent normalement par un officier, un secrétaire ou un garde";
  if (rank === "noble") return "attend les formes et protège publiquement son rang";
  if (rank === "notable") return "accorde son attention aux demandes pertinentes ou officielles";
  return "réagit selon le danger, le gain et les usages locaux";
}

function inferAttentionRule(rank: SocialRank): string {
  if (rank === "sovereign") return "ignore un manant ordinaire; répond directement seulement à une menace, un scandale majeur ou un intérêt politique";
  if (rank === "highNoble") return "délègue les requêtes mineures et protège son temps";
  if (rank === "noble") return "répond si son honneur, ses biens ou son autorité sont concernés";
  if (rank === "notable") return "répond si la demande relève de sa fonction ou présente un intérêt clair";
  return "peut répondre directement si la situation le justifie";
}

function inferIntermediary(rank: SocialRank): string {
  if (rank === "sovereign") return "le chambellan ou la garde royale";
  if (rank === "highNoble") return "un officier ou un secrétaire";
  if (rank === "noble") return "un serviteur ou un garde";
  if (rank === "notable") return "un subalterne de sa fonction";
  return "la personne elle-même";
}

function getRoleReferenceTerms(role: string): string[] {
  return normalize(role).split(/\s+/u).filter((term) =>
    term.length >= 4 && /^(roi|reine|prince|princesse|duc|duchesse|comte|comtesse|baron|baronne|seigneur)$/u.test(term));
}

function getClaimReferenceTerms(claim: PlayerClaimAssessment): string[] {
  const aliases: Record<string, string[]> = {
    arc: ["arc", "arme a distance"],
    cheval: ["cheval", "destrier", "monture"],
    couteau: ["couteau", "petite lame"],
    epee: ["epee", "lame"],
    familier: ["familier", "compagnon animal"],
    potion: ["potion", "fiole"],
  };
  return [...new Set([claim.subject, ...(aliases[claim.subject] ?? [])])].map(normalize);
}

function createUnverifiedClaimConstraint(claim: PlayerClaimAssessment): string {
  if (claim.domain === "inventory") {
    return `Le joueur affirme ou tente d'utiliser « ${claim.phrase} », mais aucun objet correspondant à ${claim.subject} n'est établi dans son inventaire. Ne pas le matérialiser, l'équiper, l'utiliser ni l'ajouter rétroactivement.`;
  }
  if (claim.domain === "relationship") {
    return `Le joueur revendique « ${claim.phrase} », mais aucun lien établi avec ${claim.subject} n'existe. Cette affirmation ne peut ni faire apparaître une entité, ni créer une relation, ni lui faire répondre.`;
  }
  return `Le joueur référence « ${claim.phrase} », mais aucun fait ni aucune entité correspondant à ${claim.subject} n'est établi. Traite cela comme une affirmation à vérifier, jamais comme une nouvelle vérité du monde.`;
}

function createUnverifiedClaimResult(claim: PlayerClaimAssessment): string {
  if (claim.domain === "inventory") {
    return `Aucun objet correspondant à « ${claim.subject} » n'est présent dans l'inventaire vérifié; son utilisation ne peut pas avoir lieu.`;
  }
  if (claim.domain === "relationship") {
    return `Aucun lien avec « ${claim.subject} » n'est établi dans la scène ou l'historique; l'appel ne reçoit donc pas automatiquement de réponse.`;
  }
  return `Aucune entité ni aucun fait correspondant à « ${claim.subject} » n'est établi dans la scène ou le monde connu.`;
}

function showsImmediateSocialReaction(narration: string): boolean {
  return /\b(alerte|attention|autorite|chuchot|garde|indign|intervient|malaise|murmur|oppose|ordonne|proteste|regard|recule|reprimande|saisit|silence|temoin|tension|tourne vers)\b/u.test(narration);
}

function getWorldEntities(state: GameState): Entity[] {
  return [
    ...state.campaign.world.entities.npcs,
    ...state.campaign.world.entities.locations,
    ...state.campaign.world.entities.items,
  ];
}

function deduplicateClaims(claims: PlayerClaimAssessment[]): PlayerClaimAssessment[] {
  const seen = new Set<string>();
  return claims.filter((claim) => {
    const key = `${claim.domain}:${claim.subject}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasNegationOrAbsence(value: string): boolean {
  return /\b(absent|aucun|aucune|introuvable|n existe pas|ne repond pas|ne vient pas|pas de|sans)\b/u.test(value) ||
    /\bne\b.{0,35}\bpas\b/u.test(value);
}

function textSimilarity(left: string, right: string): number {
  const leftTokens = meaningfulTokens(left);
  const rightTokens = meaningfulTokens(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function meaningfulTokens(value: string): Set<string> {
  return new Set(normalize(value).split(/\s+/u).filter((token) => token.length >= 4));
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[’']/gu, " ")
    .replace(/[^a-z0-9\s-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}
