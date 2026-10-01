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
  touched integer;
begin
  update public.profiles
     set is_admin = true,
         is_unlimited = true
   where lower(btrim(email)) = lower(target);

  get diagnostics touched = row_count;

  if touched = 0 then
    -- Volontairement une erreur et non un avertissement : « Success » sur un
    -- fichier qui n'a rien fait est exactement la façon dont on croit avoir
    -- réglé le problème et dont on cherche ailleurs pendant une heure.
    raise exception
      'Aucun compte avec l''adresse % — connectez-vous une fois sur le site avec cette adresse, puis repassez ce fichier.',
      target;
  end if;

  raise notice 'OK : % est administrateur et sans aucune limite.', target;
end $$;

-- Ce que la base dit maintenant. Les deux colonnes doivent être à true.
select
  email,
  is_admin     as administrateur,
  is_unlimited as illimite,
  created_at   as compte_cree_le
from public.profiles
where lower(btrim(email)) = lower('legendfotso@gmail.com');
