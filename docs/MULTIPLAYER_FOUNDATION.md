# Fondation multijoueur

La première boucle distante s'appuie sur Supabase Auth, Postgres et Realtime.
Le navigateur du MJ est l'autorité de jeu : les joueurs soumettent des
intentions persistantes, puis reçoivent uniquement l'état confirmé et filtré
qui leur est destiné.

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

## Mode local et autorité distante

`createLocalGameRuntimeAdapter()` exécute actuellement les commandes dans le
navigateur. Zustand persiste la projection, `gameRevision` et les 200 derniers
événements dans `localStorage`.

Le mode local reste le comportement par défaut lorsque Supabase n'est pas
configuré. En ligne, le MJ traite les intentions dans l'ordre et republie une
projection par membre. Une projection joueur retire notamment les secrets du
monde, les entités absentes de la scène, les jets privés, les traces IA, les
inventaires des autres personnages et les adversaires hors ligne de vue.

Les jets demandés au joueur passent également par cette file : le navigateur du
MJ effectue le tirage et poursuit la narration. Un joueur ne choisit donc pas
son résultat localement.

Chaque nouveau joueur passe désormais par une demande de personnage. Le paquet
est validé par les mêmes règles que la création locale, puis installé et
attribué par l'hôte. Les personnages préfabriqués, les couleurs de joueur et le
rôle administrateur sont stockés au niveau du salon Supabase.

Les intentions narratives sont privées entre leur auteur et le MJ. La
projection des autres participants ne conserve que les paroles explicitement
placées entre guillemets ; les conséquences confirmées restent transmises par
la narration du MJ et les jets publics.

Cette frontière applique désormais une perception propre à chaque personnage.
Chaque langue possède deux maîtrises indépendantes, oral pour entendre/parler
et écrit pour lire/écrire. Les niveaux sont aucune maîtrise, quelques mots,
presque tout sauf certains mots et maîtrise complète. Le contenu partiellement
compris est masqué de façon déterministe; un destinataire ne peut donc pas
retrouver les mots cachés en resynchronisant. Mutisme, surdité et cécité
bloquent respectivement l'émission orale, la réception orale et les
informations visuelles exactes de la carte.

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

L'utilisation d'objets, les capacités, les sorts et les attaques préparés dans
le chat sont exécutés par le MJ. Certaines interactions directes utilisent
encore leurs mutations Zustand historiques : équiper/ranger un objet,
déplacement tactique, désengagement et commandes administrateur. Elles ne sont
pas encore des commandes distantes et doivent rester sous contrôle du MJ dans
cette version.

Tant que cette liste n'est pas vide, `gameRevision` est la révision du
sous-ensemble migré et non celle de l'intégralité de la campagne.

## Suite recommandée

1. Convertir déplacement, désengagement et équipement en intentions moteur.
2. Étendre les événements à toutes les mutations d'objet et de combat.
3. Remplacer progressivement l'autorité du navigateur MJ par une fonction
   serveur transactionnelle.
4. Ajouter reprise de partie et transfert volontaire de l'autorité MJ.
5. Ajouter comptes durables et invitations révocables avant une ouverture
   publique.

## Vérification

```bash
npm run test:game-engine
npm run test:multiplayer
npm run build
```
