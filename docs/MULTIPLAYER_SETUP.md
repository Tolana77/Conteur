# Mise en place du multijoueur

Le multijoueur utilise Supabase pour l'identité anonyme, les salons, les
intentions persistantes et la présence temps réel. Le navigateur du MJ reste
l'autorité de jeu : lui seul exécute le moteur et appelle le narrateur.

## 1. Créer le projet Supabase

1. Crée un projet sur Supabase.
2. Dans **Authentication > Providers > Anonymous**, active les connexions
   anonymes.
3. Dans **SQL Editor**, exécute le fichier
   `supabase/migrations/202607190001_multiplayer_foundation.sql`.
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
3. Chaque joueur reçoit un personnage encore libre.
4. Une intention est écrite dans `multiplayer_turns` avec l'identité Supabase
   réelle du joueur.
5. Le navigateur du MJ traite les intentions dans l'ordre, appelle le moteur et
   le narrateur, puis publie une projection filtrée par destinataire.
6. Les joueurs ne reçoivent ni secrets du monde, ni traces IA, ni jets cachés,
   ni inventaires privés des autres personnages.

Le MJ doit rester connecté pour résoudre de nouvelles intentions. La dernière
projection reçue reste disponible côté Supabase, mais aucune règle n'est
exécutée sans l'autorité du MJ.
