# Boucle IA automatique économique

## Invariants

- Le Narrateur est toujours le dernier appel.
- Le routage connu est local et ne consomme aucun token.
- Un message courant appelle au plus un agent métier.
- Deux agents métier sont permis uniquement pour une action réellement croisée.
- Le classificateur IA n'est appelé que si le routeur local est indécis.
- La validation et l'exécution des commandes restent locales.
- Le Narrateur ne reçoit jamais l'état complet du jeu.

## Pipeline

1. `automaticRouting.ts` classe localement le message.
2. Si le domaine est inconnu, un classificateur compact choisit au plus un agent.
3. `automaticPrompts.ts` construit une vue propre au domaine.
4. L'agent métier produit faits, entrées narratives et commandes autorisées.
5. Le moteur valide et exécute localement les commandes.
6. Un paquet public borné est transmis au Narrateur.

## Contextes

- Personnage : fiche sélectionnée, scores dérivés, dix objets et six capacités au maximum.
- Action : caractéristiques et scores dérivés du personnage concerné.
- Combat : douze combattants, seize obstacles et dix éléments de terrain au maximum.
- Monde : lore tronqué, cinq faits, cinq entités et trois entrées d'historique.
- Narration : action, paquet public, cadre très court et trois messages récents.

Les prompts et réponses sont visibles avec une estimation de tokens dans le
Journal API de la console admin.
