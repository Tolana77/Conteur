# Boucle IA automatique économique

## Invariants

- Le Narrateur est toujours le dernier appel.
- Le routage connu est local et ne consomme aucun token.
- Un message courant appelle normalement zéro ou un agent métier. Une chaîne de
  création peut déléguer à plusieurs spécialistes, avec un plafond strict de cinq.
- Il n'existe plus d'appel de classification séparé : une action libre inconnue va directement à l'arbitre générique.
- La validation et l'exécution des commandes restent locales.
- Le Narrateur ne reçoit jamais l'état complet du jeu.
- Une narration ne crée aucun état : seules les commandes exécutées par le moteur le peuvent.
- Chaque commande conserve son agent d'origine jusqu'à l'exécution et produit un reçu typé `success`, `error` ou `info`.
- Chaque action structurée conserve un reçu avant/après : source, cible, PV, quantités, charges, états, positions, ressources et jets visibles.
- Un objet doit exister comme instance `world` avant de pouvoir être ramassé.
- Les agents de jeu ordinaires ne peuvent ni créer ni donner arbitrairement un objet.
- Une clarification suspend la résolution; la réponse suivante complète l'intention originale.
- Les tests improvisés utilisent toujours les scores dérivés stockés par le moteur.

## Pipeline

1. `automaticLocalResolution.ts` tente une opération autoritaire enregistrée (lecture d'état, transfert, refus d'une mutation sans preuve).
2. Si aucune opération autoritaire ne correspond, `automaticRouting.ts` classe localement le message.
3. Une action libre formulée à la première personne est envoyée directement à `actionManager` si aucun domaine précis n'est reconnu.
4. `automaticPrompts.ts` construit une vue propre au domaine, avec au plus trois éléments de scène pertinents.
5. L'agent métier propose faits et, si nécessaire, une commande structurée. Il
   peut demander un spécialiste de création; le routeur local vérifie la transition.
6. Une question indispensable crée une décision suspendue; aucune commande préparée n'est alors exécutée.
7. Le moteur revalide puis exécute localement les commandes et produit des reçus typés.
8. Un paquet public borné est transmis au Narrateur, toujours en dernier.

## Improvisation

`resolveGameAction` est le contrat commun à toutes les actions non prévues. Il
porte la méthode, le résultat désiré, la caractéristique, la compétence, le DD,
les enjeux, les composantes engagées et quatre issues possibles. L'IA cadre le test; le moteur calcule le
bonus, lance `1d20`, choisit l'issue et inscrit le résultat dans l'historique.

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

## Autorité sur les objets

- `giveItem` est une commande d'administration ou de préparation, pas une action joueur.
- `pickupItem` transfère une instance existante de `world` vers `inventory`; elle ne clone rien.
- Une seconde tentative de ramassage échoue puisque l'instance n'est plus dans `world`.
- Les noms alternatifs sont déclarés dans `ItemTemplate.aliases`. Le résolveur ne contient pas d'exception liée à un objet précis.
- Les questions de contenu du sac lisent directement le store et produisent un instantané exhaustif.

## Contextes

- Personnage : fiche sélectionnée, scores dérivés, dix objets et six capacités au maximum.
- Action : caractéristiques, scores dérivés, cinq objets pertinents, trois éléments de scène, une accroche et deux conséquences récentes.
- Combat : douze combattants, seize obstacles et dix éléments de terrain au maximum.
- Monde : lore tronqué, cinq faits, cinq entités et trois entrées d'historique.
- Narration : action, paquet public, cadre très court et trois messages récents.

Les prompts et réponses sont visibles avec une estimation de tokens dans le
Journal API de la console admin.

Budgets de sortie par défaut : 420 tokens pour Action/Monde, 450 pour
Personnage, 550 pour Combat et 320 pour Narration. Une demande ordinaire coûte
donc zéro ou un appel métier, puis un appel narratif.
