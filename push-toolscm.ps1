# Commit and push the Tools.cm update.
#
# Everything it prints goes to push-log.txt so the result can be read back
# from the conversation — including a refusal, which is the point of the
# checks below.
#
# It REFUSES rather than guesses — but it works out what to expect instead of
# being told. It fetches origin/main and checks that this copy is sitting on
# it. If this copy is BEHIND, somebody pushed from elsewhere and committing on
# top would bury that work; if it is AHEAD, there is already a commit here to
# push and nothing new to make.
#
# The expected commit used to be written into this file by hand, and every
# successful push made it stale: the next run stopped on a number that was
# only out of date. The repository already knows where it is. Ask it.

$root = 'C:\Users\ARTHUR\Downloads\toolscm_1\toolscm'
$log = Join-Path $root 'push-log.txt'
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

    # The remote. A clone made from a .zip has no remote at all, and `git push
    # origin main` would then fail on a name that does not exist — so it is
    # set here rather than assumed. Replaced, not added, so running this twice
    # is safe.
    Write-Output "=== remote ==="
    git remote remove origin 2>$null | Out-Null
    git remote add origin $remoteUrl
    git remote -v
    Write-Output ""

    # Where GitHub is, asked rather than assumed.
    Write-Output "=== comparing with GitHub ==="
    git fetch origin 2>&1 | ForEach-Object { Write-Output $_ }
    $head = (git rev-parse HEAD).Trim()
    $remote = (git rev-parse origin/main 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not $remote) {
        Write-Output "STOPPED - could not read origin/main. Send this log back."
        return
    }
    $remote = $remote.Trim()
    Write-Output ("here:   " + $head.Substring(0, 7))
    Write-Output ("GitHub: " + $remote.Substring(0, 7))

    if ($head -ne $remote) {
        # Behind is the dangerous one: committing on top of an older state
        # buries whatever was pushed from elsewhere.
        git merge-base --is-ancestor HEAD origin/main
        if ($LASTEXITCODE -eq 0) {
            Write-Output ""
            Write-Output "STOPPED - this copy is BEHIND GitHub. Nothing was committed."
            Write-Output "Run:  git pull --ff-only    then start this script again."
            return
        }
        Write-Output "This copy is ahead of GitHub - there is already a commit here to push."
    }
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
Changes prepared in the Cowork session and verified against the test suite

Pushed from Fortune's PC: the session's git proxy will not write to this
repository, so the commit is made here and the work was byte-verified onto
this machine before this script ran.

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
