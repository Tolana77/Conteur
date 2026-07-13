# Atelier des mondes

L'atelier est accessible depuis `Univers > Créer un monde`. Il ne réalise aucun
appel API : le prompt est copié vers une IA externe et sa réponse JSON est
recollée dans l'application.

## Flux

1. Le cadrage est sauvegardé automatiquement dans `localStorage`.
2. `worldBlueprint.ts` génère un prompt contenant le contrat JSON versionné.
3. La réponse est parsée sans `eval` et validée champ par champ.
4. Les ids, volumes minimaux, relations et références croisées sont contrôlés.
5. En cas d'erreur, l'atelier génère un prompt de correction autonome.
6. Un monde valide peut être conservé dans la bibliothèque locale ou activé.
7. Avant activation, la campagne courante est sauvegardée comme restauration rapide.

## Activation

L'activation conserve les personnages, objets d'inventaire, équipements,
capacités et portraits. Elle remplace la conversation, le monde et la scène de
combat, et retire uniquement les instances d'objets localisées dans l'ancien
monde.

Les secrets restent réservés au contexte de l'agent Monde. Le Narrateur reçoit
uniquement la promesse, le ton, les thèmes, les règles et les faits publics.
