#!/bin/bash

echo "🔍 Verifying Git setup..."

# Check if .env.local exists
if [[ ! -f ".env.local" ]]; then
    echo "❌ .env.local file not found!"
    echo "📝 Please copy .env.local.example to .env.local and add your GitHub PAT"
    echo "   cp .env.local.example .env.local"
    exit 1
fi

# Source the .env.local file
source .env.local

# Verify required variables
if [[ -z "$GIT_USERNAME" ]] || [[ -z "$GIT_PAT" ]]; then
    echo "❌ Missing required environment variables in .env.local"
    echo "📝 Please ensure GIT_USERNAME and GIT_PAT are set"
    exit 1
fi

# Verify correct username
if [[ "$GIT_USERNAME" != "tripleh1701-dev" ]]; then
    echo "❌ Invalid Git username: $GIT_USERNAME"
    echo "📝 Username must be 'tripleh1701-dev'"
    exit 1
fi

# Check Git config
CONFIGURED_USER=$(git config user.name)
CONFIGURED_EMAIL=$(git config user.email)

echo "✅ Git Configuration:"
echo "   User: $CONFIGURED_USER"
echo "   Email: $CONFIGURED_EMAIL"
echo "   Askpass: $(git config core.askPass)"

# Check remote
REMOTE_URL=$(git remote get-url origin)
echo "   Remote: $REMOTE_URL"

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "   Branch: $CURRENT_BRANCH"

echo ""
echo "✅ Setup verification complete!"
echo "🚀 Ready to push to GitHub with user: $GIT_USERNAME"
