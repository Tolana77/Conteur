# Boucle IA automatique économique

## Invariants

- Le Narrateur est toujours le dernier appel.
- Le routage connu est local et ne consomme aucun token.
- Un message courant appelle au plus un agent métier.
- Deux agents métier sont permis uniquement pour une action réellement croisée.
- Le classificateur IA n'est appelé que si le routeur local est indécis.
- La validation et l'exécution des commandes restent locales.
- Le Narrateur ne reçoit jamais l'état complet du jeu.
- Une narration ne crée aucun état : seules les commandes exécutées par le moteur le peuvent.
- Chaque commande conserve son agent d'origine jusqu'à l'exécution et produit un reçu typé `success`, `error` ou `info`.
- Chaque action structurée conserve un reçu avant/après : source, cible, PV, quantités, charges, états, positions, ressources et jets visibles.
- Un objet doit exister comme instance `world` avant de pouvoir être ramassé.
- Les agents de jeu ordinaires ne peuvent ni créer ni donner arbitrairement un objet.

## Pipeline

1. `automaticLocalResolution.ts` tente une opération autoritaire enregistrée (lecture d'état, transfert, refus d'une mutation sans preuve).
2. Si aucune opération autoritaire ne correspond, `automaticRouting.ts` classe localement le message.
3. Si le domaine est inconnu, un classificateur compact choisit au plus un agent.
4. `automaticPrompts.ts` construit une vue propre au domaine.
5. L'agent métier propose faits et commandes appartenant strictement à son domaine.
6. Le moteur revalide les permissions de l'agent d'origine, exécute chaque commande indépendamment et produit des reçus typés.
7. Un paquet public borné est transmis au Narrateur, toujours en dernier.

Le Narrateur interprète l'état courant comme un état **postérieur** aux reçus. Un
consommable absent après l'action reste donc une source valide si le reçu indique
sa quantité avant consommation. Les jets de soin et le gain effectif de PV sont
conservés séparément afin de tenir compte du plafond de PV.

## Autorité sur les objets

- `giveItem` est une commande d'administration ou de préparation, pas une action joueur.
- `pickupItem` transfère une instance existante de `world` vers `inventory`; elle ne clone rien.
- Une seconde tentative de ramassage échoue puisque l'instance n'est plus dans `world`.
- Les noms alternatifs sont déclarés dans `ItemTemplate.aliases`. Le résolveur ne contient pas d'exception liée à un objet précis.
- Les questions de contenu du sac lisent directement le store et produisent un instantané exhaustif.

## Contextes

- Personnage : fiche sélectionnée, scores dérivés, dix objets et six capacités au maximum.
- Action : caractéristiques et scores dérivés du personnage concerné.
- Combat : douze combattants, seize obstacles et dix éléments de terrain au maximum.
- Monde : lore tronqué, cinq faits, cinq entités et trois entrées d'historique.
- Narration : action, paquet public, cadre très court et trois messages récents.

Les prompts et réponses sont visibles avec une estimation de tokens dans le
Journal API de la console admin.
