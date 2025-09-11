# Repository Setup Instructions

## Step 1: Create .env.local file
Copy `.env.local.example` to `.env.local` and fill in your GitHub Personal Access Token:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` and add your PAT:
```
GIT_USERNAME=tripleh1701-dev
GIT_PAT=your_github_personal_access_token_here
GIT_EMAIL=tripleh1701@gmail.com
GIT_HOST=github.com
```

## Step 2: Set up SSH (Alternative to PAT)
For better security, you can use SSH instead:

1. Generate SSH key:
```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_tripleh1701 -C "tripleh1701@gmail.com"
```

2. Add to SSH agent:
```bash
ssh-add ~/.ssh/id_ed25519_tripleh1701
```

3. Add to GitHub account (copy public key):
```bash
cat ~/.ssh/id_ed25519_tripleh1701.pub
```

4. Configure SSH host in `~/.ssh/config`:
```
Host github-tripleh1701
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_tripleh1701
```

5. Update remote to use SSH:
```bash
git remote set-url origin git@github-tripleh1701:tripleh1701-dev/ppp-be.git
```

## Step 3: Push to GitHub
```bash
# Push main branch first
git checkout main
git push -u origin main

# Push the backend-main-mc branch
git checkout backend-main-mc
git push -u origin backend-main-mc
```

## Current Branch Status
- Currently on: `backend-main-mc`
- Remote configured: `https://github.com/tripleh1701-dev/ppp-be.git`
- Askpass script configured to enforce user validation
