import type { AiAgentDefinition } from "./types";

export const aiAgentDefinitions: AiAgentDefinition[] = [
  {
    id: "requestAnalyzer",
    name: "Analyser la demande",
    role: "Lit la réponse du joueur, extrait les intentions, repère les risques et choisit les agents spécialisés nécessaires dans le bon ordre.",
    whenToUse: [
      "Toujours en première étape de boucle.",
      "Quand une phrase joueur doit être découpée en intentions utilisables.",
      "Quand il faut déterminer si une intervention MJ ou une résolution est nécessaire.",
      "Quand une action touche plusieurs domaines: combat, personnage, monde ou règles.",
    ],
    forbiddenTasks: [
      "Ne résout pas l'action lui-même.",
      "Ne produit pas de mutation moteur.",
      "Ne remplace pas les agents métier.",
      "Ne raconte pas la réponse finale au joueur.",
    ],
  },
  {
    id: "characterManager",
    name: "Gérer perso",
    role: "Gère les personnages: stats, PV, inventaire, équipement, objets, capacités, charges et ressources personnelles.",
    whenToUse: [
      "Utilisation d'objet ou capacité.",
      "Modification de PV, stats, inventaire, équipement ou charges.",
      "Création ou attribution d'un objet/capacité à un personnage.",
    ],
    forbiddenTasks: [
      "Ne décide pas seul du résultat narratif.",
      "Ne gère pas les lignes de vue, obstacles ou déplacements tactiques complexes.",
      "Ne crée pas de sort complexe dans le système de capacités.",
    ],
  },
  {
    id: "actionManager",
    name: "Gérer actions",
    role: "Gère les jets de dés, tests de compétence, tests opposés, dégâts environnementaux et arbitrages gamifiés non strictement liés au combat tactique.",
    whenToUse: [
      "Jet de dé demandé ou nécessaire.",
      "Test de compétence, caractéristique, sauvegarde ou duel opposé.",
      "Action improvisée: escalader, forcer, convaincre, fabriquer, chercher, tomber, résister à un danger.",
      "Quand il faut estimer si une action est faisable et sous quelles limites.",
    ],
    forbiddenTasks: [
      "Ne modifie pas directement l'inventaire ou les objets.",
      "Ne gère pas la carte tactique, les lignes de vue ou les déplacements précis.",
      "Ne produit pas la narration finale.",
    ],
  },
  {
    id: "combatManager",
    name: "Gérer combat",
    role: "Gère les règles tactiques: tours, actions, déplacement, portée, ligne de vue, ciblage, attaques, dégâts, réactions, terrains et obstacles.",
    whenToUse: [
      "Combat actif.",
      "Déplacement, attaque, cible, portée, zone, réaction ou terrain.",
      "Quand une position exacte ou une carte est nécessaire.",
    ],
    forbiddenTasks: [
      "Ne modifie pas le lore hors conséquences directes du combat.",
      "Ne crée pas d'objet hors besoin tactique immédiat.",
      "Ne donne jamais les PV exacts d'un non-joueur dans la narration.",
    ],
  },
  {
    id: "combatSetupManager",
    name: "Mettre en place combat",
    role: "Prépare une scène de combat jouable: terrain, obstacles, zones tactiques, placement initial, ennemis à ajouter et objectifs de rencontre.",
    whenToUse: [
      "Quand une scène bascule vers un combat.",
      "Quand il faut créer ou adapter la carte tactique.",
      "Quand le MJ doit placer ennemis, obstacles, dangers et objectifs avant l'initiative.",
    ],
    forbiddenTasks: [
      "Ne résout pas les tours de combat.",
      "Ne crée pas de templates réutilisables complets: demande l'agent de templates tactiques si nécessaire.",
      "Ne raconte pas la scène finale au joueur.",
    ],
  },
  {
    id: "tacticalTemplateManager",
    name: "Créer templates tactiques",
    role: "Crée les templates nécessaires aux combats: ennemis, profils d'adversaires, éléments tactiques, terrains, obstacles, dangers et détails de carte.",
    whenToUse: [
      "Quand un combat nécessite un ennemi ou élément tactique qui n'existe pas encore.",
      "Quand il faut créer un modèle réutilisable de piège, terrain, obstacle ou danger.",
      "Quand la mise en place de combat manque de briques tactiques.",
    ],
    forbiddenTasks: [
      "Ne place pas les éléments sur la carte: cela revient à Mettre en place combat.",
      "Ne crée pas d'objets d'inventaire, effets d'objets ou capacités de personnage.",
      "Ne résout pas les actions des combattants.",
    ],
  },
  {
    id: "assetTemplateManager",
    name: "Créer templates assets",
    role: "Centralise la création des templates d'objets, effets et capacités: objets d'inventaire, effets réutilisables, capacités, charges, ciblage et conventions de données.",
    whenToUse: [
      "Quand il faut créer ou modifier un template d'objet.",
      "Quand un nouvel effet réutilisable est nécessaire.",
      "Quand une capacité ou capacité accordée par objet doit être modélisée.",
      "Quand il faut éviter de dupliquer un template existant et préférer overrides/réutilisation.",
    ],
    forbiddenTasks: [
      "Ne place pas d'ennemis ou de terrain sur une carte.",
      "Ne résout pas l'utilisation concrète d'un objet ou d'une capacité.",
      "Ne modifie pas directement l'inventaire d'un personnage.",
    ],
  },
  {
    id: "worldManager",
    name: "Gérer monde",
    role: "Gère l'univers: lore, lieux, PNJ, faits du monde, exploration, détails cachés et conséquences durables.",
    whenToUse: [
      "Dialogue social.",
      "Exploration hors résolution tactique stricte.",
      "Création ou modification d'un fait du monde, lieu, PNJ ou détail de scène.",
    ],
    forbiddenTasks: [
      "Ne modifie pas les PV, stats ou inventaires.",
      "Ne résout pas les attaques.",
      "Ne révèle pas d'information cachée sans commande ou validation.",
    ],
  },
  {
    id: "rulesValidator",
    name: "Vérifier règles",
    role: "Vérifie les commandes et propositions: ids existants, cibles valides, portée, ressources, charges, quantités, actions restantes et cohérence.",
    whenToUse: [
      "Avant toute exécution moteur.",
      "Quand une réponse IA contient des commandes.",
      "Quand une action est étrange, risquée ou ambiguë.",
    ],
    forbiddenTasks: [
      "Ne raconte pas la scène.",
      "Ne crée pas de nouvelle intention.",
      "Ne corrige pas silencieusement une commande dangereuse: signale-la.",
    ],
  },
  {
    id: "narrationManager",
    name: "Gérer narration",
    role: "Agit comme un véritable meneur de jeu : transforme les faits validés en scène concrète et immersive, fait réagir le monde, offre des pistes utiles et pose une question naturelle lorsque la méthode du joueur doit être précisée.",
    whenToUse: [
      "Dernière étape, après les agents métier, Vérifier règles et l'exécution locale si nécessaire.",
      "Quand des faits mécaniques doivent devenir une réponse en langage naturel.",
      "Quand il faut poser une question de clarification au joueur.",
    ],
    forbiddenTasks: [
      "Ne calcule pas les jets.",
      "Ne modifie pas le moteur.",
      "Ne raconte pas une réussite mécanique non validée.",
      "Ne mentionne jamais le moteur, les commandes, la validation ou l'absence d'action concrète au joueur.",
      "Ne répond pas par un refus abstrait lorsqu'une description limitée, une piste ou une question diégétique permet de poursuivre la scène.",
    ],
  },
];
