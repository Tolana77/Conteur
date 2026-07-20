# Mise en place du multijoueur

Le multijoueur utilise Supabase pour l'identité anonyme, les salons, les
intentions persistantes et la présence temps réel. Le navigateur du MJ reste
l'autorité de jeu : lui seul exécute le moteur et appelle le narrateur.

## 1. Créer le projet Supabase

1. Crée un projet sur Supabase.
2. Dans **Authentication > Providers > Anonymous**, active les connexions
   anonymes.
3. Dans **SQL Editor**, exécute dans l'ordre
   `supabase/migrations/202607190001_multiplayer_foundation.sql`, puis
   `supabase/migrations/202607190002_multiplayer_character_onboarding.sql`, puis
   `supabase/migrations/202607190003_multiplayer_perception.sql`, puis
   `supabase/migrations/202607190004_multiplayer_onboarding_repair.sql`, puis
   `supabase/migrations/202607200001_multiplayer_roles_and_admin.sql`.
   Les dernières migrations recréent les RPC d'accueil de façon idempotente et forcent
   le rechargement du cache PostgREST. Elles corrigent notamment l'erreur
   `Could not find the function create_multiplayer_character_preset`.
4. Dans **Project Settings > API**, relève l'URL du projet et la clé
   publishable. La clé `service_role` ne doit jamais être utilisée ici.

## 2. Configurer Vercel

Ajoute dans **Settings > Environment Variables** :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Ces deux variables sont publiques par conception. Les données restent
protégées par Supabase Auth et les politiques RLS du fichier SQL. Relance un
déploiement après leur ajout.

Pour le développement local, place les mêmes valeurs dans `.env.local`, puis
relance Vite. Ce fichier ne doit pas être commité.

## 3. Boucle autoritaire

1. Le MJ ouvre la campagne locale et crée un salon.
2. Les autres navigateurs rejoignent avec le code à six caractères.
3. Lecture guide d'abord la création de campagne, puis celle du personnage dans
   l'onglet temporaire **Création**.
4. Chaque nouveau joueur choisit un préfabriqué ou crée une fiche équilibrée.
5. Le navigateur du Conteur valide la demande, installe la fiche dans la campagne et
   l'attribue à son auteur.
6. Une intention est écrite dans `multiplayer_turns` avec l'identité Supabase
   réelle du joueur.
7. Le navigateur du Conteur traite les intentions dans l'ordre, appelle le moteur et
   le narrateur, puis publie une projection filtrée par destinataire.
8. Les joueurs ne reçoivent ni secrets du monde, ni traces IA, ni jets cachés,
   ni inventaires privés des autres personnages.

Les paroles et écrits cités sont projetés séparément pour chaque destinataire.
Le moteur croise la maîtrise du locuteur et celle du destinataire, avec quatre
niveaux (`none`, `fragments`, `limited`, `fluent`). L'oral dépend de la parole
et de l'audition; l'écrit dépend de la maîtrise écrite et de la vision.

Le MJ doit rester connecté pour résoudre de nouvelles intentions. La dernière
projection reçue reste disponible côté Supabase, mais aucune règle n'est
exécutée sans l'autorité du MJ.

## 4. Rôles, administration et personnages de rechange

- Chaque participant possède un rôle de table : **Joueur**, **MJ** ou
  **Spectateur**.
- Le statut **Admin** est indépendant de ce rôle. Le créateur du salon commence
  comme **MJ + Admin**.
- Un admin accède à **Univers**, à la console et à l'Atelier des mondes. La
  section **Persos préfabriqués** de l'onglet Univers permet de publier ou
  supprimer les personnages de rechange.
- Un admin peut modifier séparément le rôle et le statut Admin de chaque
  participant depuis **Groupe**, ainsi que les attributions de personnages.
- Pour transférer le rôle de MJ sans perdre l'état complet de la campagne, le
  futur MJ doit d'abord recevoir temporairement le statut Admin.
- Une couleur stable identifie chaque participant dans le chat et l'annuaire
  **Personnages**.
