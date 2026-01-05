# Frontend OAuth Implementation Instructions

## ⚠️ CRITICAL: NO HARDCODED VALUES

**IMPORTANT:** All parameters (accountId, accountName, enterpriseId, enterpriseName, workstream, product, service) MUST be retrieved from your application's context/state/props. **DO NOT hardcode any values.**

## Backend Changes Summary

The backend has been updated to store and retrieve OAuth tokens with the following parameters:
- `accountId` - Get from your application context
- `accountName` - Get from your application context
- `enterpriseId` - Get from your application context
- `enterpriseName` - Get from your application context
- `workstream` - Get from your application context
- `product` - Get from your application context (NEW - DO NOT hardcode)
- `service` - Get from your application context (NEW - DO NOT hardcode)

## Frontend Changes Required

### Step 1: Update OAuth Authorization URL

**CRITICAL:** When initiating the OAuth flow, you MUST include ALL context parameters in the `redirect_uri` query string. GitHub will redirect back to this exact URL, preserving all query parameters.

**Location:** Wherever you're building the GitHub OAuth authorization URL (typically in a modal or component that handles OAuth)

**Current code pattern (example):**
```typescript
const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo&state=${state}`;
```

**Updated code pattern:**
```typescript
// Get all context values from your component state/props/context
// DO NOT hardcode any values - get them from your application state
const accountId = selectedAccountId || getAccountIdFromContext(); // Get from your context
const accountName = selectedAccountName || getAccountNameFromContext(); // Get from your context
const enterpriseId = selectedEnterpriseId || getEnterpriseIdFromContext(); // Get from your context
const enterpriseName = selectedEnterpriseName || getEnterpriseNameFromContext(); // Get from your context
const workstream = selectedWorkstream || getWorkstreamFromContext(); // Get from your context
const product = getProductFromContext(); // Get from your context/state - DO NOT hardcode
const service = getServiceFromContext(); // Get from your context/state - DO NOT hardcode

// Build query parameters object - only include non-empty values
const queryParams = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  scope: 'repo',
  state: state,
});

// Add context parameters only if they exist
if (accountId) queryParams.set('accountId', accountId);
if (accountName) queryParams.set('accountName', accountName);
if (enterpriseId) queryParams.set('enterpriseId', enterpriseId);
if (enterpriseName) queryParams.set('enterpriseName', enterpriseName);
if (workstream) queryParams.set('workstream', workstream);
if (product) queryParams.set('product', product);
if (service) queryParams.set('service', service);

const authUrl = `https://github.com/login/oauth/authorize?${queryParams.toString()}`;
```

### Step 2: Update OAuth Callback Handler

Ensure the callback page/component extracts and passes all query parameters to the backend.

**Location:** OAuth callback page/component (e.g., `/security-governance/credentials/github/oauth2/callback`)

**Important:** The callback page doesn't need to do anything special - GitHub redirects directly to your backend callback URL with all query parameters. The backend will automatically receive them.

However, you can verify parameters are being passed by checking the URL:

```typescript
// In your callback page component (optional - for debugging)
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  console.log('🔑 [OAuth Callback] URL Parameters:', {
    code: urlParams.get('code'),
    accountId: urlParams.get('accountId'),
    accountName: urlParams.get('accountName'),
    enterpriseId: urlParams.get('enterpriseId'),
    enterpriseName: urlParams.get('enterpriseName'),
    workstream: urlParams.get('workstream'),
    product: urlParams.get('product'),
    service: urlParams.get('service'),
  });
}, []);
```

**The backend callback endpoint (`/api/oauth/github/callback`) will automatically receive all query parameters from the URL. No additional code needed in the callback page.**

### Step 3: Update Test Connection Request

When calling the test-connection endpoint, include `product` and `service` in the request body.

**Location:** Wherever you call `/api/connectors/github/test-connection`

**Current request body (example):**
```typescript
const payload = {
  connectorName: 'GitHub',
  url: githubUrl,
  credentialName: selectedCredentialName,
  authenticationType: 'OAuth',
  accountId: selectedAccountId,
  enterpriseId: selectedEnterpriseId,
};
```

**Updated request body:**
```typescript
// Get all values from your component state/props/context
// DO NOT hardcode any values
const accountId = getAccountIdFromContext(); // Get from your context
const accountName = getAccountNameFromContext(); // Get from your context
const enterpriseId = getEnterpriseIdFromContext(); // Get from your context
const enterpriseName = getEnterpriseNameFromContext(); // Get from your context
const workstream = getWorkstreamFromContext(); // Get from your context
const product = getProductFromContext(); // Get from your context - DO NOT hardcode
const service = getServiceFromContext(); // Get from your context - DO NOT hardcode

const payload = {
  connectorName: 'GitHub',
  url: githubUrl,
  credentialName: selectedCredentialName,
  authenticationType: 'OAuth',
  accountId: accountId,
  accountName: accountName,
  enterpriseId: enterpriseId,
  enterpriseName: enterpriseName,
  workstream: workstream,
  product: product,
  service: service,
};

// Make API call
const response = await fetch('/api/connectors/github/test-connection', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
```

### Step 4: Find Where OAuth URL is Built

Search for these patterns in your frontend codebase:

1. **Search for:** `github.com/login/oauth/authorize`
2. **Search for:** `oauth/authorize`
3. **Search for:** `GITHUB_CLIENT_ID` or `clientId`
4. **Search for:** OAuth button click handlers
5. **Search for:** `window.open` with GitHub URLs

**Common locations:**
- Connector modal components
- Credential management components
- OAuth button handlers
- Settings/configuration components

### Step 5: Example Complete Implementation

Here's a complete example of how to build the OAuth URL with all parameters:

```typescript
// Example: In your connector modal or credential component

const handleGitHubOAuth = () => {
  // Get values from your component state/props
  const clientId = 'your-github-client-id'; // From API or config
  const redirectUri = `${window.location.origin}/security-governance/credentials/github/oauth2/callback`;
  
  // Generate CSRF token
  const state = generateCSRFToken(); // Your CSRF token generation function
  
  // Get all context values from your component state/props/context
  // DO NOT hardcode any values - retrieve from your application state
  const accountId = selectedAccountId || getAccountIdFromContext();
  const accountName = selectedAccountName || getAccountNameFromContext();
  const enterpriseId = selectedEnterpriseId || getEnterpriseIdFromContext();
  const enterpriseName = selectedEnterpriseName || getEnterpriseNameFromContext();
  const workstream = selectedWorkstream || getWorkstreamFromContext();
  const product = getProductFromContext(); // Get from context - DO NOT hardcode
  const service = getServiceFromContext(); // Get from context - DO NOT hardcode
  
  // Build query parameters with ALL context
  const queryParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'repo',
    state: state,
  });
  
  // Add context parameters only if they exist
  if (accountId) queryParams.set('accountId', accountId);
  if (accountName) queryParams.set('accountName', accountName);
  if (enterpriseId) queryParams.set('enterpriseId', enterpriseId);
  if (enterpriseName) queryParams.set('enterpriseName', enterpriseName);
  if (workstream) queryParams.set('workstream', workstream);
  if (product) queryParams.set('product', product);
  if (service) queryParams.set('service', service);
  
  const authUrl = `https://github.com/login/oauth/authorize?${queryParams.toString()}`;
  
  // Open OAuth popup
  const popup = window.open(
    authUrl,
    'GitHub OAuth',
    'width=600,height=700,scrollbars=yes,resizable=yes'
  );
  
  // Handle popup message (if using postMessage)
  window.addEventListener('message', (event) => {
    if (event.data.type === 'oauth-success') {
      // Handle success
      popup?.close();
    }
  });
};
```

### Step 6: Verify Parameters Are Passed

Add console logging to verify parameters are being sent (get from context, not hardcoded):

```typescript
// Get all values from context first
const accountId = getAccountIdFromContext();
const accountName = getAccountNameFromContext();
const enterpriseId = getEnterpriseIdFromContext();
const enterpriseName = getEnterpriseNameFromContext();
const workstream = getWorkstreamFromContext();
const product = getProductFromContext(); // Get from context - DO NOT hardcode
const service = getServiceFromContext(); // Get from context - DO NOT hardcode

console.log('🔑 [Frontend] OAuth URL parameters:', {
  accountId: accountId,
  accountName: accountName,
  enterpriseId: enterpriseId,
  enterpriseName: enterpriseName,
  workstream: workstream,
  product: product,
  service: service,
});

console.log('🔑 [Frontend] Full OAuth URL:', authUrl);
```

## Testing Checklist

After implementing the changes:

1. ✅ Open browser DevTools → Network tab
2. ✅ Click "Authorize with GitHub" button
3. ✅ Check the authorization URL includes all query parameters
4. ✅ Complete OAuth flow
5. ✅ Check backend logs for: `💾 [OAuth Callback] Storing token with parameters:`
6. ✅ Verify all parameters are logged (accountId, enterpriseId, product, service, etc.)
7. ✅ Test connection - should find token using all parameters

## Important Notes

1. **NO HARDCODED VALUES:** All parameters (accountId, accountName, enterpriseId, enterpriseName, workstream, product, service) MUST be retrieved from your application's context/state/props. Do not hardcode any values.

2. **How to Get Values:** These values are typically available in:
   - Component props (passed from parent components)
   - React Context (if using Context API)
   - Redux/Zustand store (if using state management)
   - URL parameters (if stored in route)
   - LocalStorage/SessionStorage (if persisted)
   - Global state/configuration

3. **Parameter Encoding:** URLSearchParams automatically handles encoding, but ensure values are not null/undefined before adding to query params

4. **Backward Compatibility:** The backend will still work with tokens stored without product/service, but new tokens should include them

5. **Token Lookup:** The backend will look up tokens using accountId + enterpriseId primarily, but product/service can be used for additional filtering if needed

6. **Example Context Sources:**
   ```typescript
   // Example: Getting from React Context
   const { selectedAccount, selectedEnterprise, selectedWorkstream, product, service } = useAppContext();
   
   // Example: Getting from props
   const { accountId, accountName, enterpriseId, enterpriseName, workstream, product, service } = props;
   
   // Example: Getting from Redux store
   const accountId = useSelector(state => state.selectedAccount?.id);
   const enterpriseId = useSelector(state => state.selectedEnterprise?.id);
   const product = useSelector(state => state.config?.product);
   const service = useSelector(state => state.config?.service);
   ```

## Quick Copy-Paste Code Blocks

### Block 1: Build OAuth URL with All Parameters
```typescript
// This function expects all context values to be passed in
// DO NOT hardcode any values - get them from your application state
const buildGitHubOAuthUrl = (clientId: string, context: {
  accountId?: string;
  accountName?: string;
  enterpriseId?: string;
  enterpriseName?: string;
  workstream?: string;
  product?: string;
  service?: string;
}) => {
  const baseRedirectUri = `${window.location.origin}/security-governance/credentials/github/oauth2/callback`;
  const state = generateCSRFToken(); // Your CSRF function
  
  // CRITICAL: Build redirect_uri with ALL context parameters as query params
  // GitHub will redirect back to this exact URL, preserving the query parameters
  const redirectParams = new URLSearchParams();
  if (context.accountId) redirectParams.set('accountId', context.accountId);
  if (context.accountName) redirectParams.set('accountName', context.accountName);
  if (context.enterpriseId) redirectParams.set('enterpriseId', context.enterpriseId);
  if (context.enterpriseName) redirectParams.set('enterpriseName', context.enterpriseName);
  if (context.workstream) redirectParams.set('workstream', context.workstream);
  if (context.product) redirectParams.set('product', context.product);
  if (context.service) redirectParams.set('service', context.service);
  
  const redirectUri = `${baseRedirectUri}?${redirectParams.toString()}`;
  
  // Build OAuth authorization URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri, // This URL includes all context parameters
    scope: 'repo',
    state: state,
  });
  
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
};

// Usage example - get all values from your context/state
const handleOAuth = () => {
  // Get values from your application context (example - adjust to your actual context)
  const context = {
    accountId: getAccountIdFromContext(), // Your function to get from context
    accountName: getAccountNameFromContext(),
    enterpriseId: getEnterpriseIdFromContext(),
    enterpriseName: getEnterpriseNameFromContext(),
    workstream: getWorkstreamFromContext(),
    product: getProductFromContext(), // Get from context - DO NOT hardcode
    service: getServiceFromContext(), // Get from context - DO NOT hardcode
  };
  
  const authUrl = buildGitHubOAuthUrl(clientId, context);
  window.open(authUrl, 'GitHub OAuth', 'width=600,height=700');
};
```

### Block 2: Test Connection Payload
```typescript
// This function expects all context values to be passed in
// DO NOT hardcode any values - get them from your application state
const testGitHubConnection = async (config: {
  url: string;
  credentialName: string;
  accountId?: string;
  accountName?: string;
  enterpriseId?: string;
  enterpriseName?: string;
  workstream?: string;
  product?: string;
  service?: string;
}) => {
  // Build payload with only provided values (no hardcoded defaults)
  const payload: any = {
    connectorName: 'GitHub',
    url: config.url,
    credentialName: config.credentialName,
    authenticationType: 'OAuth',
  };
  
  // Add context parameters only if they exist
  if (config.accountId) payload.accountId = config.accountId;
  if (config.accountName) payload.accountName = config.accountName;
  if (config.enterpriseId) payload.enterpriseId = config.enterpriseId;
  if (config.enterpriseName) payload.enterpriseName = config.enterpriseName;
  if (config.workstream) payload.workstream = config.workstream;
  if (config.product) payload.product = config.product; // Get from context - DO NOT hardcode
  if (config.service) payload.service = config.service; // Get from context - DO NOT hardcode
  
  const response = await fetch('/api/connectors/github/test-connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  
  return response.json();
};

// Usage example - get all values from your context/state
const handleTestConnection = async () => {
  // Get values from your application context (example - adjust to your actual context)
  const config = {
    url: githubUrl,
    credentialName: selectedCredentialName,
    accountId: getAccountIdFromContext(), // Your function to get from context
    accountName: getAccountNameFromContext(),
    enterpriseId: getEnterpriseIdFromContext(),
    enterpriseName: getEnterpriseNameFromContext(),
    workstream: getWorkstreamFromContext(),
    product: getProductFromContext(), // Get from context - DO NOT hardcode
    service: getServiceFromContext(), // Get from context - DO NOT hardcode
  };
  
  const result = await testGitHubConnection(config);
  return result;
};
```

