---
source_url: https://github.com/newren/git-filter-repo + https://mintlify.com/newren/git-filter-repo/use-cases/removing-sensitive-data + https://www.mintlify.com/newren/git-filter-repo/guides/content-based-filtering + https://jkrussell.dev/blog/remove-sensitive-data-git-history-azure-devops/ + https://techcommunity.microsoft.com/blog/azureinfrastructureblog/how-to-safely-remove-secrets-from-your-git-history-the-right-way/4464722 + https://coreui.io/answers/how-to-remove-sensitive-data-from-git-history/ + https://www.harness.io/blog/how-to-remove-an-api-key-from-a-git-commit + https://itfromzero.com/en/git-en/git-filter-repo-permanently-remove-sensitive-data-and-large-files-from-repository-history.html
retrieved_on: 2026-05-20
source_type: github-readme + blog + official-docs
authority: official + practitioner
relevance: critical
topic: filter-repo
stinger: git-stinger
---

# git filter-repo: History Rewriting and Secrets Removal

## Summary

`git filter-repo` is the officially recommended replacement for the deprecated `git filter-branch`. It is 10-50x faster, has a significantly better API, prunes empty commits automatically, and handles edge cases that `filter-branch` gets wrong. It is used for: removing accidentally committed secrets from history, removing large files that bloated the repository, renaming paths, extracting subdirectories into new repositories, and general history surgery. After any rewrite, a force-push + team re-clone is mandatory.

---

## 1. Critical Context: filter-branch is Dead

**Never recommend `git filter-branch` in 2026.**

The official Git documentation now shows a warning on `git filter-branch`:

> "git filter-branch has a plethora of pitfalls that can produce non-obvious manglings of the intended history rewrite."

`git filter-repo` is the official replacement:
- Recommended by the Git project itself
- 10-50x faster on large repositories
- Automatically prunes empty commits
- More correct handling of edge cases (ref updates, tag handling, encoding)
- Written in Python, no external dependencies beyond Python 3.x

**BFG Repo-Cleaner** is a fast alternative for the specific use case of removing large files or simple string replacements. It requires Java and has fewer options than `filter-repo`, but it's easier to use for simple cases.

---

## 2. Installation

```bash
# macOS
brew install git-filter-repo

# Python pip (all platforms)
pip install git-filter-repo

# Linux (Debian/Ubuntu via pip)
pip3 install git-filter-repo

# Verify installation
git filter-repo --version
```

> Note: `git filter-repo` explicitly checks that you're working in a "fresh clone" and refuses to run without `--force` if it detects you're in your primary working copy. This is a safety feature - always work in a disposable clone.

---

## 3. CRITICAL: Pre-Rewrite Checklist

Before running ANY `git filter-repo` command:

```bash
# STEP 0: ROTATE/REVOKE EXPOSED CREDENTIALS IMMEDIATELY
# Do this BEFORE anything else - cleaning history takes time, credential rotation is instant
# - AWS: IAM Console → revoke access key
# - GitHub: Settings → Developer settings → Personal access tokens
# - Stripe: Dashboard → API keys → Roll key
# - Database: Change password immediately

# STEP 1: Create a backup bundle of the ENTIRE repository
git bundle create backup-$(date +%Y%m%d-%H%M%S).bundle --all
# Store this somewhere safe outside the repo directory

# STEP 2: Work in a FRESH CLONE, not your primary working copy
# Create a separate, disposable clone for the rewrite:
git clone --no-local /path/to/your/repo /tmp/repo-rewrite
cd /tmp/repo-rewrite
# OR use --mirror for a bare clone:
git clone --mirror https://github.com/user/repo.git /tmp/repo-mirror.git
cd /tmp/repo-mirror.git
```

---

## 4. Removing Sensitive Files

### Remove a single file from all history

```bash
# Remove .env from every commit in history
git filter-repo --path .env --invert-paths

# Remove config/secrets.yml
git filter-repo --path config/secrets.yml --invert-paths

# The --invert-paths flag means "remove these paths, keep everything else"
```

### Remove multiple files at once

```bash
git filter-repo --path .env --path config/secrets.yml --path credentials.json --invert-paths
```

### Remove files by pattern

```bash
# Remove all .env files anywhere in the repo
git filter-repo --path-glob '*.env' --invert-paths

# Remove all .pem certificates
git filter-repo --path-glob '*.pem' --invert-paths

# Remove all files in any credentials/ directory
git filter-repo --path-glob '**/credentials/*' --invert-paths
```

### Remove an entire directory

```bash
git filter-repo --path secrets/ --invert-paths
git filter-repo --path node_modules/ --invert-paths  # accidentally committed
```

### Remove files listed in a file

```bash
# Create a file listing paths to remove (one per line)
cat > ../files-to-delete.txt << 'EOF'
config/secrets.yml
.env
.env.production
assets/private-key.pem
EOF

git filter-repo --invert-paths --paths-from-file ../files-to-delete.txt
```

---

## 5. Replacing Sensitive Strings in File Contents

When you need to remove a secret value embedded inside a file (API key hard-coded in code):

### Create a replacements file

```bash
cat > ../replacements.txt << 'EOF'
# Format: LITERAL_STRING==>REPLACEMENT
# Or with ==> prefix only (default replacement is ***REMOVED***)
sk_live_abc123def456ghi789jkl==>REDACTED_API_KEY
AKIAIOSFODNN7EXAMPLE==>REDACTED_AWS_KEY
password123==>REDACTED_PASSWORD

# Regex patterns (prefix with 'regex:')
regex:sk_live_[a-zA-Z0-9]+==>[REDACTED_STRIPE_KEY]
regex:api[_-]?key\s*[:=]\s*['"]?[a-zA-Z0-9]{32,}==>[REDACTED_API_KEY]
regex:password\s*[:=]\s*['"]?[^'"\s]+==>[REDACTED_PASSWORD]
EOF
```

### Apply the replacements

```bash
git filter-repo --replace-text ../replacements.txt
```

### Using --sensitive-data-removal flag (comprehensive mode)

```bash
git filter-repo \
  --replace-text ../replacements.txt \
  --sensitive-data-removal
# This flag also: fetches all refs, tracks first changed commits,
# reports orphaned LFS objects, provides cleanup instructions
```

---

## 6. Removing Large Files

### Analyze what's large

```bash
# Analyze the repository and produce a report of large files
git filter-repo --analyze
# Creates .git/filter-repo/analysis/ with reports:
# - blob-shas-and-paths.txt
# - path-all-sizes.txt
# - path-deleted-sizes.txt
```

### Remove large files

```bash
# Remove a specific large file by path
git filter-repo --path assets/demo-video.mp4 --invert-paths

# Remove all files larger than 10 MB
git filter-repo --strip-blobs-bigger-than 10M

# Remove all files larger than 50 MB
git filter-repo --strip-blobs-bigger-than 50M
```

---

## 7. Advanced: Callbacks for Complex Scenarios

For scenarios that don't fit the standard flags, `filter-repo` supports Python callbacks:

```bash
# Remove a blob by its specific SHA (known sensitive blob)
git filter-repo --blob-callback '
    if blob.original_id == b"f4ede2e944868b9a08401dafeb2b944c7166fd0a":
        blob.data = b"REDACTED"
'

# Remove files with 'secret' or 'password' in the filename
git filter-repo --filename-callback '
    if b"secret" in filename.lower() or b"password" in filename.lower():
        return None  # None means remove the file
    return filename
'

# Rename all paths under src/ to lib/
git filter-repo --path-rename src/:lib/
```

---

## 8. Extracting a Subdirectory into a New Repository

A common use case: pull one subdirectory out of a monorepo into its own repository.

```bash
# Keep ONLY the src/payments/ directory (with history)
git filter-repo --path src/payments/ --force

# Then the repo only contains the payments/ path at its root
# Optionally rename it:
git filter-repo --path src/payments/ --path-rename src/payments/:./
```

---

## 9. Post-Rewrite: Force Push and Team Cleanup

After any `git filter-repo` run, the origin remote is **automatically removed** as a safety measure. You must re-add it:

```bash
# Step 1: Re-add the remote
git remote add origin https://github.com/user/repo.git
# Verify
git remote -v

# Step 2: Force push ALL branches and ALL tags
git push --force --all
git push --force --tags
```

### Team cleanup (mandatory)

Every team member must re-clone. A `git pull` will fail or restore the old history:

```bash
# Team members MUST do this - git pull is NOT sufficient:
rm -rf repo-name
git clone https://github.com/user/repo.git

# Do NOT: git pull (brings back old history)
# Do NOT: git rebase (may reintroduce old commits)
```

### Contact GitHub/GitLab support

Even after force-pushing, some cached data may persist:
- GitHub: Contact support to request a cache flush for PRs and search indexes
- GitLab: Similar process via support ticket
- GitHub Actions artifact caches may also contain the secrets

---

## 10. Verifying the Removal

```bash
# Check that the file no longer exists in any commit
git log --all --full-history -- path/to/secrets.yml
# Should return nothing

# Search for the sensitive string across all history
git log --all -S "my-secret-api-key" --oneline
# Should return nothing

# After force push, verify from a FRESH CLONE (not your rewrite copy)
cd /tmp
git clone https://github.com/user/repo.git fresh-verify
cd fresh-verify
git log --all -S "my-secret-api-key" --oneline
```

---

## 11. BFG Repo-Cleaner (Alternative)

BFG is a simpler, faster Java-based alternative for common cases:

```bash
# Prerequisites: Java installed, download bfg.jar from rtyley.github.io/bfg-repo-cleaner/

# Step 1: Make a mirror clone
git clone --mirror https://github.com/user/repo.git repo.git

# Step 2: Make sure latest commit is clean (BFG won't touch HEAD by default)
# Commit a clean version of the file first if needed

# Step 3: Delete a specific file from ALL history
java -jar bfg.jar --delete-files .env repo.git

# OR: Replace sensitive strings
echo 'my-secret-api-key' > secrets.txt
java -jar bfg.jar --replace-text secrets.txt repo.git

# Step 4: Cleanup and push
cd repo.git
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push
```

**BFG vs filter-repo decision:**

| Criteria | Use BFG | Use filter-repo |
|---|---|---|
| Simple file deletion | Better (simpler CLI) | Works too |
| Simple string replacement | Better (faster on large repos) | Works too |
| Complex path operations | Not possible | Use filter-repo |
| Path renaming | Not possible | Use filter-repo |
| Python callback logic | Not possible | Use filter-repo |
| Available Java runtime | ✓ | Not needed |
| Officially recommended by Git | ✗ | ✓ |

---

## 12. Complete Secrets Removal Workflow

```bash
# === IMMEDIATE ACTIONS (do these FIRST, before touching git) ===
# 1. Rotate/revoke the exposed credential at the service provider
# 2. Notify your security team / manager
# 3. Review access logs to see if the key was used

# === GIT CLEANUP ===

# Step 1: Create a backup
cd /path/to/original/repo
git bundle create ~/backup-$(date +%Y%m%d-%H%M%S).bundle --all

# Step 2: Create a fresh disposable clone
git clone --no-local /path/to/original/repo /tmp/repo-cleanup
cd /tmp/repo-cleanup

# Step 3: Install filter-repo if not available
pip install git-filter-repo

# Step 4: Create replacements file
cat > /tmp/replacements.txt << 'EOF'
ACTUAL_SECRET_VALUE_HERE==>REDACTED
EOF

# Step 5: Remove the sensitive file AND replace any embedded values
git filter-repo --invert-paths --path .env  # remove the file
git filter-repo --replace-text /tmp/replacements.txt  # replace embedded values

# Step 6: Verify removal
git log --all -S "ACTUAL_SECRET_VALUE_HERE" --oneline
# Expected: no output

# Step 7: Re-add remote and force push
git remote add origin https://github.com/user/repo.git
git push --force --all
git push --force --tags

# Step 8: Notify team - everyone must re-clone
# Template:
# "URGENT: Repository history was rewritten to remove a security incident.
#  All local clones are now out of date.
#  Please delete your local copy and re-clone:
#  rm -rf repo-name && git clone https://github.com/user/repo.git"

# Step 9: Contact GitHub/GitLab support for server-side cache flush
# Step 10: Update CI/CD secrets with new credentials
# Step 11: Add .env to .gitignore
echo ".env" >> .gitignore
echo ".env.*" >> .gitignore
git add .gitignore
git commit -m "chore: add .env files to .gitignore"

# Step 12: Add pre-commit hook to prevent future secrets commits
# (see hooks guide for gitleaks / detect-secrets setup)
```

---

## 13. Post-Cleanup Checklist

```
[ ] Credential rotated/revoked at provider
[ ] Access logs reviewed for unauthorized use
[ ] Security team notified
[ ] Backup bundle created before rewrite
[ ] git filter-repo ran successfully
[ ] Verified removal locally (git log -S)
[ ] Force push completed (--all + --tags)
[ ] All team members notified to re-clone
[ ] GitHub/GitLab support contacted for cache flush
[ ] CI/CD secrets updated with new credentials
[ ] .gitignore updated to prevent recurrence
[ ] Pre-commit secret scanning hook added (gitleaks/detect-secrets)
[ ] Repository size reduced as expected (git count-objects -vH)
```

---

## Key Quotations

- "git filter-repo is now recommended by the git project instead of git filter-branch." - github.com/newren/git-filter-repo
- "The git filter-repo tool can remove sensitive information and large files from your entire Git repository history, not just your last commit. It is a very flexible, open source tool hosted on GitHub and the recommended replacement for git-filter-branch." - Harness.io (2026)
- "Removing the data from Git history is not the finish line. If the repo was ever public, or anyone cloned it before you could act - treat those secrets as fully compromised. No exceptions." - itfromzero.com (2026)
- "Do not skip step 1 [rotating credentials]. Cleaning history takes time. Rotating the credential is immediate and stops the damage now." - coreui.io (2026)
- "filter-branch has a plethora of pitfalls that can produce non-obvious manglings of the intended history rewrite." - Official Git Documentation

---

## Citations

1. GitHub - newren/git-filter-repo README: https://github.com/newren/git-filter-repo
2. git-filter-repo docs - Removing Sensitive Data: https://mintlify.com/newren/git-filter-repo/use-cases/removing-sensitive-data
3. git-filter-repo docs - Content-Based Filtering: https://www.mintlify.com/newren/git-filter-repo/guides/content-based-filtering
4. John Russell Dev Blog - "Permanently Remove Sensitive Data from Git History in Azure DevOps" (2026-01-16): https://jkrussell.dev/blog/remove-sensitive-data-git-history-azure-devops/
5. Microsoft TechCommunity - "How to Safely Remove Secrets from Your Git History": https://techcommunity.microsoft.com/blog/azureinfrastructureblog/how-to-safely-remove-secrets-from-your-git-history-the-right-way/4464722
6. CoreUI - "How to remove sensitive data from Git history" (2026-03-24): https://coreui.io/answers/how-to-remove-sensitive-data-from-git-history/
7. Harness.io - "Learn How to Remove Sensitive Data From a Git History" (2026-01-21): https://www.harness.io/blog/how-to-remove-an-api-key-from-a-git-commit
8. itfromzero.com - "Git Filter-Repo: Permanently Remove Sensitive Data" (updated 2026-04-18): https://itfromzero.com/en/git-en/git-filter-repo-permanently-remove-sensitive-data-and-large-files-from-repository-history.html
