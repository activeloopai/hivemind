# History Rewriting - git-stinger

Removing files, secrets, or paths from Git history using `git filter-repo` and BFG Repo Cleaner.

---

## Step 0: Backup before rewriting (mandatory)

Always create a full backup bundle before any history rewrite. This is the escape hatch.

```bash
# Create a complete backup (all refs, all objects)
git bundle create ../backup-$(basename "$PWD")-$(date +%Y%m%d).bundle --all

# Verify the bundle is valid
git bundle verify ../backup-*.bundle

# If anything goes wrong, restore from the bundle:
git clone ../backup-*.bundle restored-repo
```

Never skip this step. A bad `filter-repo` run can be recovered from the bundle even if the remote is force-pushed.

---

## Tool selection

| Scenario | Recommended tool |
|---|---|
| Remove a file from all history | `git filter-repo --path <file> --invert-paths` |
| Remove a string/secret from all blobs | `git filter-repo --replace-text <expressions-file>` |
| Remove all files matching a pattern | `git filter-repo --path-glob '*.zip' --invert-paths` |
| Remove a large file (fastest) | BFG Repo Cleaner |
| Rename/move paths in history | `git filter-repo --path-rename old/:new/` |
| Extract a subdirectory as a new repo | `git filter-repo --subdirectory-filter <dir>` |

**Never use `git filter-branch`.** It is deprecated as of Git 2.36, 10-100x slower, and has known correctness bugs.

---

## Installing git-filter-repo

```bash
# pip (recommended):
pip install git-filter-repo

# Homebrew (macOS):
brew install git-filter-repo

# Manual: download the single Python script and put it on $PATH
# https://github.com/newren/git-filter-repo
```

Verify: `git filter-repo --version`

---

## Removing a file from all history

```bash
# Escape hatch:
git bundle create ../backup.bundle --all

# Remove the file from every commit:
git filter-repo --path secrets.env --invert-paths

# If you want to keep a local copy before removing:
cp secrets.env ../secrets.env.bak
git filter-repo --path secrets.env --invert-paths
```

After running, the file will not exist in any commit in the local repo.

---

## Removing a secret string from all blobs

```bash
# Create an expressions file:
cat > ../replace-expressions.txt << 'EOF'
AKIAIOSFODNN7EXAMPLE==>REDACTED_AWS_KEY
ghp_abc123def456==>REDACTED_GH_TOKEN
EOF

# Replace all occurrences in all blob contents:
git filter-repo --replace-text ../replace-expressions.txt
```

The syntax in the expressions file is `literal==>replacement`. Use `regex:` prefix for regex patterns:
```
regex:ghp_[A-Za-z0-9_]{36}==>REDACTED_GH_TOKEN
```

---

## BFG Repo Cleaner (faster for large repos)

BFG is a JVM tool that excels at removing specific files or credentials across large histories.

```bash
# Download: https://rtyley.github.io/bfg-repo-cleaner/
# Requires Java 8+

# Remove a specific file from all history:
java -jar bfg.jar --delete-files secrets.env

# Remove all files larger than 100 MB:
java -jar bfg.jar --strip-blobs-bigger-than 100M

# Replace text (password, token):
java -jar bfg.jar --replace-text ../passwords.txt

# BFG does NOT modify the most recent commit by default.
# To also clean the latest commit, make a "cleaning commit" first
# (delete the file, commit), then run BFG.
```

After BFG runs:
```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
```

---

## Force-push coordination after history rewrite

After any history rewrite, a force-push is required for every branch that was rewritten. This is a team coordination event.

1. **Notify the team.** Everyone who has a local clone must discard their local copy and re-clone (or `git fetch && git reset --hard origin/<branch>`).
2. **Rotate the compromised credential.** Even after removal from history, assume the credential is compromised. Rotate it immediately. Escalate to `security-worker-bee` for this step.
3. **Force-push all affected branches:**
   ```bash
   git push origin --force --all  # after filter-repo (it removes remote tracking refs)
   git push origin --force --tags
   ```
   Note: `filter-repo` removes the remote configuration from the local repo. You may need to re-add the remote: `git remote add origin <url>`.
4. **Verify** the file/secret is gone from the remote:
   ```bash
   git log --all --full-history -- secrets.env  # should show nothing
   ```

---

## Extracting a subdirectory as a new repo

```bash
# Clone the original repo first (preserves original)
git clone https://github.com/org/mono-repo.git extracted-repo
cd extracted-repo

# Keep only the subdirectory's history:
git filter-repo --subdirectory-filter packages/my-lib

# The repo now contains only the history for packages/my-lib,
# with paths rewritten to be relative to that directory.
```

Sources: research/external/05-filter-repo.md
