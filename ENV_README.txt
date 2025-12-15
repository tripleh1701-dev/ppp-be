PORT=4000
NODE_ENV=development
STORAGE_DIR=./data
STORAGE_MODE=filesystem # options: filesystem | postgres | dynamodb
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=postgres
PGDATABASE=postgres
LOG_LEVEL=dev
ALLOW_ORIGIN=http://localhost:3000

# Copy the above into a local .env file for development.

# GitHub OAuth 2.0 Configuration (required for GitHub OAuth integration)
# Get these from: https://github.com/settings/developers
# Create a new OAuth App and set callback URL to: {APP_BASE_URL}/security-governance/credentials/github/oauth2/callback
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_client_secret
APP_BASE_URL=http://localhost:3000

# Token Encryption Key (required for secure token storage)
# Use a strong random string of at least 32 characters
# If not set, will fall back to PASSWORD_ENCRYPTION_KEY
TOKEN_ENCRYPTION_KEY=your_32_character_encryption_key_here

# See GITHUB_OAUTH_SETUP.md for detailed setup instructions

# Azure OpenAI (optional for AI insights)
# AZURE_OPENAI_ENDPOINT=https://your-azure-endpoint
# AZURE_OPENAI_API_KEY=your-key
# AZURE_OPENAI_API_VERSION=2024-04-01-preview
# AZURE_OPENAI_DEPLOYMENT=gpt-35-turbo
