# Fondation multijoueur

Cette étape ne connecte encore aucun joueur distant. Elle sépare l'interface de
l'autorité du jeu afin que le moteur local puisse ensuite être remplacé par une
passerelle serveur sans réécrire les composants React.

## Contrat

- `GameCommand` décrit l'intention, la campagne, l'acteur, son rôle, la révision
  attendue et un identifiant idempotent.
- `executeGameCommand()` valide l'enveloppe et les règles prises en charge.
- `parseGameCommand()` rejette le JSON réseau malformé avant l'exécution.
- Le moteur produit des `GameEvent` et ne mute jamais son entrée.
- `replayGameEvents()` reconstruit la même projection à partir du journal.
- Une commande périmée est rejetée avec `REVISION_CONFLICT`.
- Une commande déjà appliquée est rejetée avec `DUPLICATE_COMMAND`.
- Les permissions sont contrôlées dans le moteur et non dans l'interface.

Le champ `protocolVersion` prépare les migrations du protocole réseau. Il est
distinct de `GAME_STORAGE_VERSION`, qui concerne uniquement la sauvegarde
locale Zustand.

## Adaptateur local

`createLocalGameRuntimeAdapter()` exécute actuellement les commandes dans le
navigateur. Zustand persiste la projection, `gameRevision` et les 200 derniers
événements dans `localStorage`.

Un futur adaptateur distant devra exposer le même contrat : créer une commande,
l'envoyer à l'autorité serveur puis appliquer la projection ou les événements
confirmés par cette autorité.

## Commandes déjà migrées

- ajuster ou fixer les PV ; la résolution historique des résistances calcule
  encore le total avant d'émettre la commande finale ;
- modifier une caractéristique ;
- enrichir l'historique d'un personnage ou de la campagne ;
- ajouter, modifier ou retirer un fait du monde ;
- créer ou mettre à jour une entité du monde ;
- avancer, corriger ou narrer la scène chronologique ;
- ajouter un message du MJ.

## Chemin historique restant

Les règles de dégâts avec résistances, les objets, les capacités, les jets, les
intentions du chat et le combat utilisent encore leurs mutations Zustand
historiques. Elles doivent être extraites domaine par domaine avant d'activer
un vrai multijoueur. Tant que cette liste n'est pas vide, `gameRevision` est la
révision du sous-ensemble migré et non celle de l'intégralité de la campagne.

## Suite recommandée

1. Extraire les dés avec une source aléatoire injectée et enregistrer leurs
   termes dans les événements.
2. Extraire l'exécution des intentions d'objet et de capacité.
3. Extraire le combat et ses validations de tour, portée et ressources.
4. Ajouter `projectStateForViewer()` pour retirer secrets et entités cachées.
5. Ajouter l'identité, les membres de campagne et l'adaptateur Supabase.
6. Faire de la passerelle serveur la seule autorité d'écriture.

## Vérification

```bash
npm run test:game-engine
npm run build
```
