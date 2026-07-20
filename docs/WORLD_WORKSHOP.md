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
6. Un monde valide peut être conservé dans la bibliothèque locale ou chargé.
7. Avant chargement, la campagne courante est sauvegardée comme restauration rapide.
8. L'application revient ensuite dans Lecture et propose la création du
   personnage dans un écran séparé occupant temporairement l'onglet Fiche.

## Activation

Le contrat courant impose un groupe de départ vide. Le chargement crée d'abord
le monde, la conversation et la scène initiale, sans personnage ni inventaire.
La fiche est ensuite créée depuis la campagne active. Son prompt reçoit les
faits publics, factions, lieux, figures connues, situation initiale, rôle du
joueur, concept du groupe et équipement attendu. Aucune instance de la campagne
précédente n'est recyclée.

Les objets de départ sont produits pendant cette seconde étape et réutilisent
un `templateId` du catalogue quand il existe.

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
