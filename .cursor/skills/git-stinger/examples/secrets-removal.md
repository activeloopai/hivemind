# Example: Secrets Removal from Git History

End-to-end walkthrough: a developer discovers an AWS key was committed to the repo.

---

## Situation

Developer commits a `.env` file containing `AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG` to `main`. The secret has been in history for 3 days.

---

## Step 1: Immediate triage

```bash
# Confirm the secret is in history:
git log --all --full-history -- .env
git show HEAD:.env | grep AWS_SECRET_ACCESS_KEY
```

**Treat the credential as compromised immediately.** Escalate to `security-worker-bee` for credential rotation in parallel with history cleanup.

---

## Step 2: Backup

```bash
cd /path/to/repo

# Create a full backup bundle:
git bundle create ../repo-backup-$(date +%Y%m%d).bundle --all

# Verify:
git bundle verify ../repo-backup-*.bundle
echo "Backup verified: $(ls -lh ../repo-backup-*.bundle | awk '{print $5}')"
```

---

## Step 3: Remove the secret with git-filter-repo

```bash
# Install git-filter-repo if not present:
pip install git-filter-repo

# Option A: Remove the entire .env file from all history:
git filter-repo --path .env --invert-paths

# Option B: Replace only the secret value (keep the file, redact the value):
cat > ../replace.txt << 'EOF'
wJalrXUtnFEMI/K7MDENG==>REDACTED_AWS_SECRET
EOF
git filter-repo --replace-text ../replace.txt
```

After `filter-repo` runs, the remote configuration is removed from the local repo. Verify the secret is gone:

```bash
git log --all --full-history -- .env          # Option A: should return nothing
git grep "wJalrXUtnFEMI" $(git log --all --format="%H") # should return nothing
```

---

## Step 4: Re-add the remote and force-push

```bash
# filter-repo removes the remote - add it back:
git remote add origin https://github.com/org/repo.git

# Force-push all branches:
git push origin --force --all

# Force-push tags (they also contain rewritten history):
git push origin --force --tags
```

---

## Step 5: Team coordination

Notify the team:

> "We've force-pushed to all branches to remove a leaked secret. Everyone must discard their local clone and re-clone:
>
> `git clone https://github.com/org/repo.git`
>
> Do NOT merge, rebase, or cherry-pick from your old local clone - it contains the old history."

Any PRs open against rewritten branches need to be rebased onto the new history.

---

## Step 6: Credential rotation (escalate to security-worker-bee)

History rewrite does NOT undo the exposure. The credential must be rotated:
1. Revoke the AWS key in the IAM console.
2. Generate a new key.
3. Update all systems that used the old key.
4. Audit access logs for the period the key was exposed.

This step is `security-worker-bee`'s domain - escalate immediately.

---

## Step 7: Prevention

```bash
# Add .env to .gitignore:
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
git add .gitignore
git commit -m "chore: add .env to .gitignore"

# Add a pre-commit hook to block secrets (using git-secrets or detect-secrets):
pip install detect-secrets
detect-secrets scan > .secrets.baseline
# Configure in lefthook.yml or .husky/pre-commit
```

---

## Recovery from a bad filter-repo run

If `filter-repo` produced wrong results:

```bash
# Restore from the bundle:
cd /tmp
git clone ../repo-backup-*.bundle restored-repo
cd restored-repo

# Restore the original remote:
git remote set-url origin https://github.com/org/repo.git

# You're back to the pre-filter state. Do not force-push the backup to the remote
# unless you want to undo the rewrite.
```
