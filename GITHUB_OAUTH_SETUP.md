# GitHub OAuth Setup Guide

This guide will help you set up GitHub OAuth 2.0 for your application.

## Prerequisites

- A GitHub account
- Access to your backend server's `.env` file

## Step-by-Step Setup

### 1. Create a GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"New OAuth App"** (or **"OAuth Apps"** → **"New OAuth App"**)
3. Fill in the application details:
   - **Application name**: `DevOps Automate` (or your preferred name)
   - **Homepage URL**: `http://localhost:3000` (or your app URL)
   - **Authorization callback URL**: `http://localhost:3000/security-governance/credentials/github/oauth2/callback`
     - ⚠️ **Important**: This must match exactly, including the path
4. Click **"Register application"**

### 2. Copy Your Credentials

After creating the app, you'll see:
- **Client ID** (public, can be shared)
- **Client Secret** (private, keep secure!)

Copy both values - you'll need them in the next step.

### 3. Configure Backend Environment Variables

1. Open your backend `.env` file (located in the project root: `C:\Users\admin\Documents\ppp-be\.env`)
2. Add the following lines:

```env
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
APP_BASE_URL=http://localhost:3000
```

Replace `your_client_id_here` and `your_client_secret_here` with the actual values from GitHub.

### 4. Restart Backend Server

After saving the `.env` file, restart your backend server for the changes to take effect.

### 5. Verify Setup

1. The frontend should now be able to fetch the Client ID
2. When users click "Authorize", they'll be redirected to GitHub
3. After authorization, the app will appear in:
   - **GitHub Settings** → **Applications** → **Authorized OAuth Apps**

## Troubleshooting

### Error: "GitHub OAuth Client ID not configured"

- ✅ Check that `.env` file exists in the backend root directory
- ✅ Verify `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are set
- ✅ Ensure there are no extra spaces or quotes around the values
- ✅ Restart the backend server after making changes

### Error: "redirect_uri_mismatch"

- ✅ Ensure the callback URL in GitHub matches exactly:
  - `http://localhost:3000/security-governance/credentials/github/oauth2/callback`
- ✅ Check that `APP_BASE_URL` in `.env` matches your frontend URL

### App doesn't appear in Authorized OAuth Apps

- ✅ Complete the full OAuth flow (authorize on GitHub)
- ✅ Check that the authorization was successful (no errors)
- ✅ The app name will be whatever you set when creating the OAuth App

## Security Notes

- ⚠️ **Never commit** `.env` file to version control
- ⚠️ **Keep Client Secret secure** - treat it like a password
- ⚠️ Use different OAuth Apps for development and production
- ⚠️ In production, use HTTPS URLs

## API Endpoints

- `GET /api/oauth/github/client-id` - Get Client ID (returns setup instructions if not configured)
- `GET /api/oauth/github/setup-instructions` - Get detailed setup instructions
- `GET /api/oauth/github/callback` - OAuth callback handler
- `POST /api/oauth-token` - Exchange authorization code for access token

## Need Help?

Check the backend console logs for detailed error messages. The backend will log warnings if OAuth is not properly configured.


