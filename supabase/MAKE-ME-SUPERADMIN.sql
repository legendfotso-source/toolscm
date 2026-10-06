-- ===========================================================================
-- Tools.cm — faire de legendfotso@gmail.com le compte propriétaire
--
-- À coller dans l'éditeur SQL de Supabase, puis Run. Une seule fois suffit,
-- et le repasser ne change rien.
--
-- Ce fichier existe parce que les deux autres chemins passent par Vercel :
-- ADMIN_EMAIL donne /admin, OWNER_EMAILS donne l'accès illimité, et les deux
-- n'agissent qu'au prochain déploiement et à la prochaine connexion. Ici les
-- deux drapeaux sont posés directement sur la ligne, tout de suite, et c'est
-- la colonne qui fait autorité ensuite — les variables peuvent rester vides.
--
-- PRÉALABLE : le compte doit exister. Il est créé la première fois que vous
-- vous connectez sur le site. Si vous ne l'avez pas encore fait, ce fichier
-- vous le dira au lieu de ne rien faire en silence.
-- ===========================================================================

-- Pas de \set ici, ni dans aucun fichier destiné à l'éditeur SQL de Supabase :
-- les commandes commençant par une barre oblique inverse appartiennent à psql,
-- l'éditeur les lit comme du SQL et répond « syntax error at or near "\" ».
-- L'arrêt sur erreur n'en a pas besoin : le raise exception ci-dessous annule
-- toute la requête de lui-même.

do $$
declare
  target constant text := 'legendfotso@gmail.com';
  created integer;
  touched integer;
begin
  -- 1. Une ligne de profil pour chaque compte portant cette adresse.
  --
  -- La ligne est normalement créée par un déclencheur à l'inscription. Quand
  -- elle manque, isAdmin() cherche le profil par l'identifiant de la session,
  -- ne trouve rien, et répond non — sans que rien nulle part ne dise pourquoi.
  insert into public.profiles (id, email)
  select u.id, u.email
    from auth.users u
   where lower(btrim(coalesce(u.email, ''))) = lower(target)
  on conflict (id) do nothing;
  get diagnostics created = row_count;

  -- 2. Les deux drapeaux sur TOUTES les lignes qui portent cette adresse.
  --
  -- Toutes, pas une seule. La version précédente faisait « limit 1 » : avec
  -- deux comptes pour la même adresse — ce que Supabase crée quand on s'est
  -- connecté une fois par e-mail et une fois par Google — elle en marquait un
  -- au hasard. Le 1er octobre 2026 le tableau de résultats affichait
  -- « administrateur : true » pendant que /admin répondait 404, parce que la
  -- session de Fortune était sur l'AUTRE ligne.
  update public.profiles p
     set is_admin = true,
         is_unlimited = true,
         -- Réparée au passage : /admin liste les gens par adresse, et une
         -- adresse vide est une ligne sur laquelle personne ne peut agir.
         -- btrim : l'adresse dans auth.users garde les espaces que la personne
         -- a tapés, et une adresse avec un espace au bout est une adresse que
         -- personne ne retrouvera en cherchant.
         email = btrim(coalesce(nullif(p.email, ''), u.email, target))
    from auth.users u
   where u.id = p.id
     and lower(btrim(coalesce(nullif(p.email, ''), u.email, ''))) = lower(target);
  get diagnostics touched = row_count;

  if touched = 0 then
    -- Volontairement une erreur et non un avertissement : « Success » sur un
    -- fichier qui n'a rien fait est exactement la façon dont on croit avoir
    -- réglé le problème et dont on cherche ailleurs pendant une heure.
    raise exception
      'Aucun compte avec l''adresse % — connectez-vous une fois sur le site avec cette adresse, puis repassez ce fichier.',
      target;
  end if;

  raise notice 'OK : % compte(s) mis à jour (% profil(s) créé(s) au passage).', touched, created;
end $$;

-- ===========================================================================
-- TOUS les comptes de la base, pas seulement ceux qui correspondent.
--
-- Affiché en entier exprès. Une requête qui ne montre que les lignes qu'elle
-- vient de modifier répond toujours « tout va bien » : le 1er octobre 2026
-- elle affichait « administrateur : true » pendant que /admin renvoyait 404,
-- parce que la ligne de la session n'était pas dans le résultat. On regarde
-- donc la base entière, et la vérité se voit au lieu de se déduire.
--
-- Sur VOTRE ligne, les deux colonnes doivent être à true. S'il y a plusieurs
-- lignes pour la même adresse, c'est normal : Supabase crée un compte par
-- méthode de connexion, et elles sont toutes marquées.
-- ===========================================================================
select
  p.id,
  coalesce(nullif(p.email, ''), u.email, '(aucune adresse)') as email,
  p.is_admin     as administrateur,
  p.is_unlimited as illimite,
  case when u.id is null then 'profil orphelin' else 'ok' end as etat,
  p.created_at   as compte_cree_le
from public.profiles p
left join auth.users u on u.id = p.id

union all

-- Et les comptes qui n'ont AUCUNE ligne de profil. isAdmin() cherche le
-- profil par l'identifiant de la session : s'il n'existe pas, la réponse est
-- non, et rien nulle part ne dit pourquoi. Ceux-là doivent avoir disparu
-- après le bloc ci-dessus ; s'il en reste un, c'est lui le problème.
select
  u.id,
  coalesce(u.email, '(aucune adresse)'),
  null, null,
  'SANS PROFIL',
  u.created_at
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)

order by compte_cree_le
limit 50;
