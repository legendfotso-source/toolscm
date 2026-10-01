# Commit and push the Tools.cm update.
#
# Everything it prints goes to push-log.txt so the result can be read back
# from the conversation — including a refusal, which is the point of the
# checks below.
#
# It REFUSES rather than guesses. The copy of this repository on this PC is
# expected to be at 7ad2ef8, the same commit GitHub has. If it is at anything
# else, somebody has worked in it since, and committing on top would quietly
# bury that work. In that case the script stops and prints what it found.

$root = 'C:\Users\ARTHUR\Downloads\toolscm_1\toolscm'
$log = Join-Path $root 'push-log.txt'
$expected = '7ad2ef8'
$remoteUrl = 'https://github.com/legendfotso-source/toolscm.git'

Start-Transcript -Path $log -Force | Out-Null
try {
    if (-not (Test-Path $root)) {
        Write-Output "STOPPED - $root does not exist on this PC."
        return
    }
    Set-Location $root

    # Git itself. Without this the failure arrives as a confusing
    # "not recognized as a cmdlet" twelve lines further down.
    $git = Get-Command git -ErrorAction SilentlyContinue
    if (-not $git) {
        Write-Output "STOPPED - git is not installed, or not on the PATH."
        Write-Output "Install it from https://git-scm.com/download/win, then run this again."
        return
    }
    Write-Output "git: $(git --version)"
    Write-Output ""

    Write-Output "=== where this copy is ==="
    git log --oneline -3
    Write-Output ""

    $head = (git rev-parse --short HEAD).Trim()
    if ($head -ne $expected) {
        Write-Output "STOPPED - this copy is at $head, expected $expected."
        Write-Output "Nothing was committed. Send this log back before doing anything else."
        return
    }

    # The remote. A clone made from a .zip has no remote at all, and `git push
    # origin main` would then fail on a name that does not exist — so it is
    # set here rather than assumed. Replaced, not added, so running this twice
    # is safe.
    Write-Output "=== remote ==="
    git remote remove origin 2>$null | Out-Null
    git remote add origin $remoteUrl
    git remote -v
    Write-Output ""

    Write-Output "=== what changed ==="
    git status --short
    Write-Output ""

    # push-log.txt was committed by accident in 3a27ced — this script's own
    # transcript, which no clone needs. .gitignore now lists it, but ignoring
    # a file that is ALREADY tracked does nothing, so it has to be removed
    # from the index by name. --cached keeps the file on disk.
    git rm --cached --ignore-unmatch -q push-log.txt

    git add -A

    # Nothing to do is not a failure — it means this script already ran.
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Output "Nothing to commit: this update is already committed here."
    } else {
        $message = @"
Put a way in to /admin on the site

Fortune ran the SQL, reached /account, saw "Illimite" - and could not find the
account list, because nothing on the site pointed at /admin. The screen had
worked for days; the only way to reach it was to type the address.

This has now happened twice on this site. /signin worked for weeks while
nothing linked to it, and the honest report from outside was "there is no
Google sign-in". A page nobody can navigate to does not exist, however well it
works.

getEntitlement now carries isAdmin, read from the SAME profile row as
is_unlimited rather than a second query. It survives the pre-migration window:
when is_unlimited does not exist yet, the fallback SELECT keeps asking for
is_admin, so the order of the code deploy and the hand-run migration cannot
decide who can reach /admin.

The link is drawn on /account and in the account menu on every page. It is a
signpost and nothing more: /admin and both of its endpoints still answer
notFound() to anybody the server does not recognise.

238 checks. Three more mutations, all caught.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ptx4ZF647YBxv6EfVtEvew
"@

        $messageFile = Join-Path $env:TEMP 'toolscm-commit-message.txt'
        Set-Content -Path $messageFile -Value $message -Encoding UTF8
        git commit -F $messageFile
        Remove-Item $messageFile -ErrorAction SilentlyContinue
    }

    Write-Output ""
    Write-Output "=== committed ==="
    git log --oneline -1
    Write-Output ""
    Write-Output "pushing..."

    # A Git sign-in window may appear here. That is Git's own; nothing about
    # it passes through this script or through the conversation.
    git push -u origin main 2>&1 | ForEach-Object { Write-Output $_ }
    $code = $LASTEXITCODE

    Write-Output ""
    Write-Output "push exit code: $code"
    if ($code -eq 0) {
        Write-Output "DONE - Vercel starts building by itself."
    } else {
        Write-Output "FAILED - read the lines above."
    }
} catch {
    Write-Output "ERROR: $_"
} finally {
    Stop-Transcript | Out-Null
}
