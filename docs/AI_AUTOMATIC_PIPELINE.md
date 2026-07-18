# Boucle IA automatique économique

## Invariants

- Le Narrateur est toujours le dernier appel.
- Le routage connu est local et ne consomme aucun token.
- Un message courant appelle normalement zéro ou un agent métier. Une chaîne de
  création peut déléguer à plusieurs spécialistes, avec un plafond strict de cinq.
- Il n'existe plus d'appel de classification séparé : une action libre inconnue va directement à l'arbitre générique.
- La validation et l'exécution des commandes restent locales.
- Une phrase du joueur est une intention ou une affirmation, jamais une nouvelle
  vérité du monde. Les possessions, relations et présences sont confrontées au
  store avant tout appel IA.
- Le Narrateur ne reçoit jamais l'état complet du jeu.
- Une narration ne crée aucun état : seules les commandes exécutées par le moteur le peuvent.
- Un PNJ mentionné reçoit un dossier social compact : présence, rôle, rang,
  accès, disposition, objectif, crainte, protocole et règle d'attention.
- Chaque commande conserve son agent d'origine jusqu'à l'exécution et produit un reçu typé `success`, `error` ou `info`.
- Chaque action structurée conserve un reçu avant/après : source, cible, PV, quantités, charges, états, positions, ressources et jets visibles.
- Un objet doit exister comme instance `world` avant de pouvoir être ramassé.
- Les objets manipulables de la scène possèdent une vue canonique compacte :
  identité, description, quantité, détenteur, visibilité et actions possibles.
- Les agents de jeu ordinaires ne peuvent ni créer ni donner arbitrairement un objet.
- Une clarification suspend la résolution; la réponse suivante complète l'intention originale.
- Les tests improvisés utilisent toujours les scores dérivés stockés par le moteur.

## Pipeline

1. `grounding.ts` compare les affirmations du joueur aux objets, relations,
   entités et faits réellement établis. Il construit aussi les dossiers des PNJ
   concernés et détecte attente ou incident social observable.
2. `automaticLocalResolution.ts` tente une opération autoritaire enregistrée (lecture d'état, transfert, refus d'une mutation sans preuve).
3. Si aucune opération autoritaire ne correspond, `automaticRouting.ts` classe localement le message. Une référence non établie force le spécialiste Personnage ou Monde compétent.
4. Une action libre formulée à la première personne est envoyée directement à `actionManager` si aucun domaine précis n'est reconnu.
5. `automaticPrompts.ts` construit une vue propre au domaine, avec seulement les éléments pertinents.
6. L'agent métier propose faits et, si nécessaire, une commande structurée. Il
   peut demander un spécialiste de création; le routeur local vérifie la transition.
7. Une question indispensable crée une décision suspendue; aucune commande préparée n'est alors exécutée.
8. Le moteur revalide puis exécute localement les commandes et produit des reçus typés. Une commande qui tenterait de matérialiser une affirmation non établie est refusée.
9. Un paquet public borné est transmis au Narrateur, toujours en dernier.
10. La narration est contrôlée localement. Une ressource inventée, un PNJ absent
    qui agit, un souverain anormalement disponible, une transgression ignorée ou
    une scène répétée déclenche une seule réécriture corrective, puis un repli
    fondé exclusivement sur les faits validés.

## Improvisation

`resolveGameAction` est le contrat commun à toutes les actions non prévues. Il
porte la méthode, le résultat désiré, la caractéristique, la compétence, le DD,
les enjeux, les composantes engagées et quatre issues possibles. L'IA cadre le test; le moteur calcule le
bonus, lance `1d20`, choisit l'issue et inscrit le résultat dans l'historique.

Le cycle visible est volontairement scindé :

1. le Narrateur reçoit l'action et une indication qualitative, puis écrit une
   courte mise en situation qui s'arrête avant l'issue ;
2. la carte de jet apparaît sans DD et verrouille temporairement les autres
   entrées narratives ;
3. le joueur lance lui-même le dé ;
4. le moteur résout le degré de réussite ;
5. seul le Narrateur est rappelé avec ce résultat définitif pour poursuivre la
   scène.

Le DD et la catégorie de difficulté restent privés dans `PlayerCheckRequest`.
Ils ne sont transmis ni au composant de narration, ni au message visible. Le
contrat `PlayerCheckNarrationContext` contient seulement l'action, la méthode,
le type de test, une indication diégétique avant le jet, puis le degré de
réussite et l'issue validée après le jet.

Les composantes sont référencées par l'id d'une instance réellement présente
dans l'inventaire compact. Le moteur vérifie leur propriétaire et leur quantité,
puis les consomme au début de la tentative ou seulement en cas de réussite selon
`timing`. Aucun nom d'objet inventé par le modèle ne peut être consommé.

- `routine` : pas de jet recommandé ;
- `plausible` : DD 10 ;
- `difficult` : DD 15 ;
- `extreme` : DD 22 ;
- `legendary` : DD 28, ajustable jusqu'à 35.

Un résultat inférieur au DD de trois points ou moins devient une réussite
partielle. Un 20 naturel est une réussite critique; un 1 naturel est un échec
avec conséquence. Les issues narratives ne peuvent pas créer silencieusement
un objet, des PV, une capacité ou une ressource.

Pour une action `legendary` dont le total reste sous le DD, un 20 naturel
déclenche une confirmation. Un second 20 produit le miracle (0,25 % avant les
autres modificateurs); sinon l'action obtient seulement une réussite partielle.

## Gravité narrative

`narrativeMomentum.ts` suit sans IA le nombre d'actions libres qui ne touchent
pas l'accroche active. Il ne bloque ni ne pénalise ces actions. Après deux
actions éloignées, le Narrateur peut glisser un indice (`subtle`), puis une
accroche claire (`clear`) et enfin faire croiser une conséquence logique de
l'intrigue avec la route du personnage (`consequence`). Le joueur conserve
toujours plusieurs choix et peut continuer à ignorer l'accroche.

Le Narrateur interprète l'état courant comme un état **postérieur** aux reçus. Un
consommable absent après l'action reste donc une source valide si le reçu indique
sa quantité avant consommation. Les jets de soin et le gain effectif de PV sont
conservés séparément afin de tenir compte du plafond de PV.

## Continuité et autorité sociale

- `NarrativeSceneState` reste l'autorité spatiale et chronologique : lieu,
  présents, position, temps, tension, alerte, événements et conséquences.
- Attendre fait diminuer les échéances. Un événement arrivé à zéro doit produire
  une nouvelle étape puis est archivé comme conséquence, ce qui interdit la
  répétition indéfinie de « des pas approchent ».
- Les champs sociaux explicites des entités priment. Pour les anciens mondes,
  rang, accès et protocole sont inférés à partir du rôle.
- Un rang élevé n'interdit pas toute interaction : connexion établie, incident
  majeur ou audience déjà accordée autorisent l'attention directe.
- Une transgression perçue doit provoquer une réaction proportionnée, mais le
  système ne décide pas à la place du spécialiste si une action secrète a été vue.

## Autorité sur les objets

- `manipulableObjects.ts` fusionne les instances au sol ou détenues et les
  objets narratifs du monde. Il exclut les objets distants et ne révèle jamais
  un objet caché au Narrateur.
- Une simple mention ne crée rien. Un objet établi peut être décrit ou inspecté,
  mais son déplacement exige une commande moteur.
- `giveItem` est une commande d'administration ou de préparation, pas une action joueur.
- `pickupItem` transfère une instance existante de `world` vers `inventory`; elle ne clone rien.
- Une seconde tentative de ramassage échoue puisque l'instance n'est plus dans `world`.
- Après un test d'acquisition réussi, Monde choisit un id établi, Personnage
  demande son transfert, puis le moteur publie `inventoryMutation` avec les ids
  réellement présents dans le sac avant que Narration ne réponde.
- Pour une fouille générique réussie sans contenu préétabli, Monde peut autoriser
  un seul butin ordinaire plausible. Création de contenu l'instancie alors à
  partir d'un template existant. Cette exception ne peut jamais matérialiser
  l'objet précis affirmé par le joueur.
- Les noms alternatifs sont déclarés dans `ItemTemplate.aliases`. Le résolveur ne contient pas d'exception liée à un objet précis.
- Les questions de contenu du sac lisent directement le store et produisent un instantané exhaustif.

## Contextes

- Personnage : fiche sélectionnée, scores dérivés, inventaire exhaustif compact,
  cinq fiches d'objet pertinentes et six capacités au maximum.
- Action : caractéristiques, scores dérivés, cinq objets pertinents, trois éléments de scène, une accroche et deux conséquences récentes.
- Combat : douze combattants, seize obstacles et dix éléments de terrain au maximum.
- Monde : scène stable, trois faits, six entités au maximum, dossiers des seuls
  PNJ concernés et trois entrées d'historique.
- Narration : action, paquet public, scène stable, jusqu'à cinq objets
  manipulables visibles, dossiers concernés, cadre très court et trois messages récents.

Les prompts et réponses sont visibles avec une estimation de tokens dans le
Journal API de la console admin.

Budgets de sortie par défaut : 420 tokens pour Action, 500 pour Monde, 450 pour
Personnage, 550 pour Combat et 400 pour Narration. Une demande ordinaire coûte
donc zéro ou un appel métier, puis un appel narratif.
