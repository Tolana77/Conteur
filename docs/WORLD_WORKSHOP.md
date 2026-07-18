# Atelier des mondes

L'atelier est accessible depuis `Univers > Créer un monde`. Il ne réalise aucun
appel API : le prompt est copié vers une IA externe et sa réponse JSON est
recollée dans l'application.

## Flux

1. Le cadrage est sauvegardé automatiquement dans `localStorage`.
2. `worldBlueprint.ts` génère un prompt contenant le contrat JSON versionné.
3. La réponse est parsée sans `eval`, normalisée puis validée.
4. Les ids, relations et références croisées sont réparés lorsque cela est sûr.
5. En cas d'erreur, l'atelier génère un prompt de correction autonome.
6. Un monde valide peut être conservé dans la bibliothèque locale ou activé.
7. Avant activation, la campagne courante est sauvegardée comme restauration rapide.

## Activation

Le contrat courant décrit séparément le monde et le groupe de départ.
L'activation crée donc une partie neuve : personnages, caractéristiques,
capacités de catalogue, inventaires, équipements, conversation et scène de
combat. Aucune instance de la campagne précédente n'est recyclée. Les portraits
et les réglages purement visuels restent locaux à l'interface.

Les objets de départ réutilisent un `templateId` du catalogue quand il existe.
Un objet sans template correspondant reçoit un template simple propre au monde.

## Recommencer

Au démarrage d'une campagne, Zustand conserve séparément une copie immuable de
son état initial. Le bouton `Univers > Recommencer la campagne` restaure cette
copie : monde, groupe, PV, objets, quantités, équipements, capacités et charges.
La progression courante est remplacée sans effacer la bibliothèque de mondes ni
les réglages de l'application.

Les secrets restent réservés au contexte de l'agent Monde. Le Narrateur reçoit
uniquement la promesse, le ton, les thèmes, les règles et les faits publics.
# Import JSON tolérant

L'atelier normalise les réponses d'IA avant validation. Il accepte notamment :

- du texte ou un bloc Markdown autour du JSON ;
- les principales clés françaises ou anglaises ;
- des collections sous forme de tableaux ou d'objets nommés ;
- les ids absents, écrits librement ou dupliqués ;
- les références utilisant le nom d'un PNJ, d'un lieu ou d'une faction ;
- des champs narratifs supplémentaires sur les PNJ, lieux et objets.

Le noyau commun est converti vers le schéma du moteur. Les champs inconnus sont
conservés dans `Entity.details.data` sans interprétation implicite. Une campagne
peu détaillée reste importable : les recommandations de densité produisent des
avertissements, pas des erreurs bloquantes.
