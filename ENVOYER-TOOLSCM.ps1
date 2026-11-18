# Envoie Tools.cm sur GitHub depuis une copie propre du dépôt.
#
# Pourquoi : le dépôt git de ce dossier a été abîmé par une coupure pendant un
# envoi (fichiers internes de .git remplis de zéros). Plutôt que de le
# bricoler, ce script travaille dans une copie neuve :
#   1. clone (ou met à jour) github.com/legendfotso-source/toolscm dans
#      Téléchargements\toolscm-github ;
#   2. y recopie les fichiers de ce dossier (sans .git, node_modules, .next,
#      .vercel ni les .env) ;
#   3. enregistre et envoie. Vercel construit le site tout seul ensuite.
# Résultat dans envoi-log.txt, à côté de ce script.
$ErrorActionPreference = 'Continue'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$depot = Join-Path $env:USERPROFILE 'Downloads\toolscm-github'
$url = 'https://github.com/legendfotso-source/toolscm.git'
$log = Join-Path $source 'envoi-log.txt'
Start-Transcript -Path $log -Force | Out-Null
try {
  Write-Output "Tools.cm -> GitHub, $(Get-Date)"
  if (Test-Path (Join-Path $depot '.git')) {
    Write-Output "Copie propre existante : mise à jour"
    git -C $depot fetch origin 2>&1 | ForEach-Object { "$_" }
    git -C $depot reset --hard origin/main 2>&1 | ForEach-Object { "$_" }
  } else {
    Write-Output "Clonage dans $depot"
    git clone $url $depot 2>&1 | ForEach-Object { "$_" }
  }
  if (-not (Test-Path (Join-Path $depot '.git'))) { Write-Output "ARRET - le clonage a échoué."; return }
  Write-Output ("GitHub est à : " + (git -C $depot log -1 --oneline))

  # Recopie : robocopy /MIR remplace tout sauf les dossiers et fichiers exclus.
  robocopy $source $depot /MIR /XD .git node_modules .next .vercel /XF .env .env.local .env.production envoi-log.txt push-log.txt reparation-log.txt /NFL /NDL /NJH /NJS /NP | Out-Null
  Write-Output "Fichiers recopiés (code robocopy $LASTEXITCODE, moins de 8 = normal)"

  Push-Location $depot
  git add -A 2>&1 | Out-Null
  $changes = git status --short
  if (-not $changes) { Write-Output "Rien de nouveau à envoyer."; Pop-Location; return }
  $changes | Select-Object -First 40 | ForEach-Object { "  $_" }
  git -c user.name="legendfotso-source" -c user.email="legendfotso-source@users.noreply.github.com" commit -q -m "Accueil 3D : pages qui se plient, scanner de verre, caméra qui voyage" 2>&1 | ForEach-Object { "$_" }
  Write-Output "envoi..."
  $env:GCM_INTERACTIVE = 'always'
  git push origin main 2>&1 | ForEach-Object { "$_" }
  Write-Output "push exit code: $LASTEXITCODE"
  Write-Output ("Dernier commit : " + (git log -1 --oneline))
  Pop-Location
  Write-Output "TERMINE - Vercel construit le site tout seul."
} finally { Stop-Transcript | Out-Null }
