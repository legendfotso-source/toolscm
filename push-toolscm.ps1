# Commit and push the Tools.cm update.
#
# Everything it prints goes to push-log.txt so the result can be read back
# from the conversation — including a refusal, which is the point of the
# checks below.
#
# It REFUSES rather than guesses. The copy of this repository on this PC is
# expected to be at 6a6fbe9, the same commit GitHub has. If it is at anything
# else, somebody has worked in it since, and committing on top would quietly
# bury that work. In that case the script stops and prints what it found.

$root = 'C:\Users\ARTHUR\Downloads\toolscm_1\toolscm'
$log = Join-Path $root 'push-log.txt'
$expected = '6a6fbe9'
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

    git add -A

    # Nothing to do is not a failure — it means this script already ran.
    git diff --cached --quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Output "Nothing to commit: this update is already committed here."
    } else {
        $message = @"
Unlimited owner accounts, and an approval queue for customers who have paid

Two things that were missing, and one property they share: neither may be
settable from a browser.

An account with no limits. A fourth tier, 'owner': no daily cap, no batch
cap, no file-size cap. It is not a plan - no price, absent from TIER_IDS so
it can never reach the pricing page, and tierOf() refuses to return it, so a
subscription row saying "owner" buys nothing however it got there. It is
granted by profiles.is_unlimited, a column 'authenticated' has no UPDATE
grant on, bootstrapped once from OWNER_EMAILS the way ADMIN_EMAIL makes the
first admin, and toggled per account from /admin.

NO_LIMIT is MAX_SAFE_INTEGER rather than Infinity: these limits cross into
the browser as JSON, where Infinity becomes null and null > size is false -
the unlimited account would have had the tightest limit of the four.

"I have paid". A customer who sent 2,000 FCFA by Mobile Money had no way to
tell the site. payment_claims holds the declaration: it grants nothing, the
server prices it with the same planForTier the pricing page uses so the
amount can never come from the browser, and a unique index on
lower(btrim(transaction_id)) means a reference can only be claimed once.
Approving runs the existing idempotent grantPro under the customer's own
reference, so two admins pressing the button grant one month between them.
Refusing keeps a reason.

/admin now lists every account with Pro, Max and Illimite on each row, and
the payments waiting to be confirmed above it, oldest first.

Proven: 226 checks across seven suites, up from 196. 13 new ones, each
mutation-tested - a flag defaulting to true, a browser-writable flag, a
non-unique reference, a missing status constraint, an RLS policy reading
'using (true)', an insertable status, the owner's caps put back, tierOf
accepting "owner", owner on the pricing page, entitlement ignoring the flag,
the price taken from the request, approve-twice, and the missing
one-open-claim rule all fail the right check and nothing else.

test:db now applies EVERY migration, in order, read off the directory rather
than a hand-written list - and applies them twice, because each file claims
to be safe to re-run and that claim is why it is safe to paste one into the
Supabase SQL editor when you are not sure.

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
