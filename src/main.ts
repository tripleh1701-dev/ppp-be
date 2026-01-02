import 'reflect-metadata';
import * as dotenv from 'dotenv';
import {NestFactory} from '@nestjs/core';
import {Module} from '@nestjs/common';
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Query,
    Req,
    Res,
    HttpStatus,
    Patch,
} from '@nestjs/common';

import path from 'path';
import * as fs from 'fs';
import {AccountsService} from './services/accounts';
import {AccountsDynamoDBService} from './services/accounts-dynamodb';
import {EnterprisesService} from './services/enterprises';
import {EnterprisesDynamoDBService} from './services/enterprises-dynamodb';
import {BusinessUnitsService} from './services/businessUnits';
import {UsersService} from './services/users';
import {UserGroupsService} from './services/userGroups';
import {GroupsService} from './services/groups';
import {TemplatesService} from './services/templates';
import {PipelineYamlService} from './services/pipelineYaml';
import {PipelineConfigService} from './services/pipelineConfig';
import {ServicesService} from './services/services';
import {ServicesDynamoDBService} from './services/services-dynamodb';
import {ProductsService} from './services/products';
import {ProductsDynamoDBService} from './services/products-dynamodb';
import {EnterpriseProductsServicesService} from './services/enterpriseProductsServices';
import {EnterpriseProductsServicesDynamoDBService} from './services/enterpriseProductsServices-dynamodb';
import {RolesService} from './services/roles';
import {AttributesService} from './services/attributes';
import {AccessControl_DynamoDBService} from './services/AccessControl_DynamoDB';
import {AccountLicensesDynamoDBService} from './services/accountLicenses-dynamodb';
import {UserManagementDynamoDBService} from './services/userManagement-dynamodb';
import {EnvironmentsService} from './services/environments';
import {EnvironmentsDynamoDBService} from './services/environments-dynamodb';
import {GlobalSettingsDynamoDBService} from './services/globalSettings-dynamodb';
import {testConnection, withPg} from './db';
import {testDynamoDBConnection, getStorageMode} from './dynamodb';
import {validatePasswordEncryptionConfig} from './utils/passwordEncryption';
import * as pipelineCanvas from './services/pipelineCanvas';
import {PipelineCanvasDynamoDBService} from './services/pipelineCanvas-dynamodb';
import {BuildExecutionsDynamoDBService} from './services/buildExecutions-dynamodb';
import {BuildsDynamoDBService} from './services/builds-dynamodb';
import {JWTService} from './services/jwt';
import {safeConsoleError} from './utils/sanitizeError';
import axios from 'axios';
import {GitHubOAuthService} from './services/githubOAuth';
import {CognitoAuthService} from './services/cognitoAuth';

// Cognito auth service instance
const cognitoAuth = new CognitoAuthService();

dotenv.config();

const STORAGE_DIR = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.join(process.cwd(), 'data');

// Load geo data from file
let GEO_DATA: Record<string, Record<string, string[]>> = {};
try {
    const geoDataPath = path.join(STORAGE_DIR, 'geo', 'geo.json');
    const geoDataContent = fs.readFileSync(geoDataPath, 'utf-8');
    GEO_DATA = JSON.parse(geoDataContent);
} catch (error) {
    console.error('Warning: Could not load geo data from file:', error);
    GEO_DATA = {};
}

// Initialize storage mode from environment variables immediately
// This must happen before services are used by controllers
const storageMode: string = process.env.STORAGE_MODE || 'dynamodb';

// Infrastructure provisioning API URL (for account onboarding/offboarding)
// This should be set via environment variable in deployment
const INFRA_PROVISIONING_API_BASE_URL =
    process.env.INFRA_PROVISIONING_API_URL || '';

console.log('🔧 Storage mode (from env):', storageMode);
console.log('🔧 Environment variables at load time:', {
    STORAGE_MODE: process.env.STORAGE_MODE,
    NODE_ENV: process.env.NODE_ENV,
    WORKSPACE: process.env.WORKSPACE,
    ACCOUNT_REGISTRY_TABLE_NAME: process.env.ACCOUNT_REGISTRY_TABLE_NAME,
    DYNAMODB_SYSTIVA_TABLE: process.env.DYNAMODB_SYSTIVA_TABLE,
    INFRA_PROVISIONING_API_URL: INFRA_PROVISIONING_API_BASE_URL
        ? '***configured***'
        : 'NOT SET',
});

// Providers (plain classes)
const accounts = new AccountsService(STORAGE_DIR);

// Initialize DynamoDB services immediately based on storage mode
// This ensures they are available when controllers are instantiated
// Using definite assignment assertion (!) to indicate these will be initialized before use
let accountsDynamoDB: AccountsDynamoDBService;
let enterprises: any;
let services: any;
let products: any;
let enterpriseProductsServices: any;
let accountLicenses: AccountLicensesDynamoDBService;
let userManagement: UserManagementDynamoDBService;
let AccessControl_Service: AccessControl_DynamoDBService;
let environments: any;
let globalSettings: GlobalSettingsDynamoDBService;
let pipelineCanvasDynamoDB: PipelineCanvasDynamoDBService;
let buildExecutionsDynamoDB: BuildExecutionsDynamoDBService;
let buildsDynamoDB: BuildsDynamoDBService;

// Initialize services based on storage mode at module load time
if (storageMode === 'dynamodb') {
    console.log('🔧 Initializing DynamoDB services at module load...');
    try {
        accountsDynamoDB = new AccountsDynamoDBService();
        enterprises = new EnterprisesDynamoDBService(STORAGE_DIR);
        services = new ServicesDynamoDBService(STORAGE_DIR);
        products = new ProductsDynamoDBService(STORAGE_DIR);
        enterpriseProductsServices =
            new EnterpriseProductsServicesDynamoDBService(STORAGE_DIR);
        accountLicenses = new AccountLicensesDynamoDBService();
        userManagement = new UserManagementDynamoDBService();
        AccessControl_Service = new AccessControl_DynamoDBService();
        environments = new EnvironmentsDynamoDBService();
        globalSettings = new GlobalSettingsDynamoDBService();
        pipelineCanvasDynamoDB = new PipelineCanvasDynamoDBService();
        buildExecutionsDynamoDB = new BuildExecutionsDynamoDBService();
        buildsDynamoDB = new BuildsDynamoDBService();
        console.log('✅ DynamoDB services initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize DynamoDB services:', error);
    }
} else {
    console.log('🔧 Using filesystem/postgres services');
    enterprises = new EnterprisesService(STORAGE_DIR);
    services = new ServicesService(STORAGE_DIR);
    products = new ProductsService(STORAGE_DIR);
    enterpriseProductsServices = new EnterpriseProductsServicesService(
        STORAGE_DIR,
    );
    environments = new EnvironmentsService(STORAGE_DIR);
}

const businessUnits = new BusinessUnitsService(STORAGE_DIR);
const templates = new TemplatesService(STORAGE_DIR);
const pipelineYaml = new PipelineYamlService(STORAGE_DIR);
const pipelineConfig = new PipelineConfigService(STORAGE_DIR);
// Legacy services (will be replaced by AccessControl_Service)
const users = new UsersService();
const userGroups = new UserGroupsService(STORAGE_DIR);
const groups = new GroupsService(STORAGE_DIR);
const roles = new RolesService(STORAGE_DIR);
const attributes = new AttributesService(STORAGE_DIR);

@Controller('health')
class HealthController {
    @Get()
    get() {
        return {ok: true};
    }
}

@Controller('api/auth')
class AuthController {
    @Post('login')
    async login(@Body() body: any, @Res() res: any) {
        try {
            const {email, password, username} = body;
            const loginId = username || email; // Support both email and username

            if (!loginId || !password) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Email/username and password are required',
                });
            }

            // Try Cognito authentication first (if IMS_API_URL is configured)
            if (cognitoAuth.isAvailable()) {
                console.log('Attempting Cognito authentication via IMS...');
                const cognitoResult = await cognitoAuth.login(
                    loginId,
                    password,
                );

                // Handle NEW_PASSWORD_REQUIRED challenge
                if (cognitoResult.requiresPasswordChange) {
                    return res.status(HttpStatus.OK).json({
                        success: false,
                        requiresPasswordChange: true,
                        challengeName: cognitoResult.challengeName,
                        session: cognitoResult.session,
                        message:
                            cognitoResult.message ||
                            'Password change required on first login',
                        data: {
                            user: {
                                id: cognitoResult.user?.username || loginId,
                                emailAddress:
                                    cognitoResult.user?.email || loginId,
                                firstName: '',
                                lastName: '',
                            },
                        },
                    });
                }

                if (cognitoResult.success && cognitoResult.tokens) {
                    const user = cognitoResult.user;
                    return res.status(HttpStatus.OK).json({
                        success: true,
                        data: {
                            user: {
                                id: user?.username || loginId,
                                firstName:
                                    user?.username?.split('@')[0] || 'User',
                                middleName: '',
                                lastName: '',
                                emailAddress: user?.email || loginId,
                                status: 'active',
                                technicalUser: false,
                                role: user?.userRoles?.[0] || 'User',
                                tenantId: user?.tenantId,
                                permissions: user?.permissions || [],
                                groups: user?.groups || [],
                            },
                            token: cognitoResult.tokens.AccessToken,
                            refreshToken: cognitoResult.tokens.RefreshToken,
                            idToken: cognitoResult.tokens.IdToken,
                            expiresIn: cognitoResult.tokens.ExpiresIn,
                        },
                    });
                }

                // Cognito auth failed - return error (don't fallback to local auth)
                return res.status(HttpStatus.UNAUTHORIZED).json({
                    success: false,
                    error: cognitoResult.error || 'Invalid email or password',
                });
            }

            // Fallback: Use local DynamoDB authentication
            if (storageMode !== 'dynamodb' || !userManagement) {
                return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
                    success: false,
                    error: 'Authentication service not available. Configure IMS_API_URL for Cognito auth.',
                });
            }

            const user = await userManagement.authenticateUser(
                loginId,
                password,
            );

            if (!user) {
                return res.status(HttpStatus.UNAUTHORIZED).json({
                    success: false,
                    error: 'Invalid email or password',
                });
            }

            // Get user's groups and roles
            let userRole = 'User'; // Default role
            try {
                const userGroups = await userManagement.getUserGroups(user.id);
                if (userGroups && userGroups.length > 0) {
                    const groupRoles = await userManagement.getGroupRoles(
                        userGroups[0].id,
                    );
                    if (groupRoles && groupRoles.length > 0) {
                        userRole = groupRoles[0].name || 'User';
                    }
                }
            } catch (roleError) {
                safeConsoleError('Error fetching user roles:', roleError);
            }

            // Generate JWT token (secure)
            const token = JWTService.generateToken({
                userId: user.id,
                email: user.emailAddress,
                name: `${user.firstName} ${user.lastName}`,
                role: userRole,
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    user: {
                        id: user.id,
                        firstName: user.firstName,
                        middleName: user.middleName,
                        lastName: user.lastName,
                        emailAddress: user.emailAddress,
                        status: user.status,
                        technicalUser: user.technicalUser,
                        role: userRole,
                    },
                    token,
                },
            });
        } catch (error) {
            safeConsoleError('Error during login', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Authentication failed',
            });
        }
    }

    @Post('complete-password-challenge')
    async completePasswordChallenge(@Body() body: any, @Res() res: any) {
        try {
            const {username, email, newPassword, session} = body;
            const loginId = username || email;

            if (!loginId || !newPassword || !session) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Username, new password, and session are required',
                });
            }

            if (!cognitoAuth.isAvailable()) {
                return res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
                    success: false,
                    error: 'Cognito authentication not configured',
                });
            }

            const result = await cognitoAuth.completeNewPasswordChallenge(
                loginId,
                newPassword,
                session,
            );

            if (result.success && result.tokens) {
                const user = result.user;
                return res.status(HttpStatus.OK).json({
                    success: true,
                    message: 'Password updated successfully',
                    data: {
                        user: {
                            id: user?.username || loginId,
                            firstName: user?.username?.split('@')[0] || 'User',
                            middleName: '',
                            lastName: '',
                            emailAddress: user?.email || loginId,
                            status: 'active',
                            technicalUser: false,
                            role: user?.userRoles?.[0] || 'User',
                            tenantId: user?.tenantId,
                            permissions: user?.permissions || [],
                            groups: user?.groups || [],
                        },
                        token: result.tokens.AccessToken,
                        refreshToken: result.tokens.RefreshToken,
                        idToken: result.tokens.IdToken,
                        expiresIn: result.tokens.ExpiresIn,
                    },
                });
            }

            return res.status(HttpStatus.BAD_REQUEST).json({
                success: false,
                error: result.error || 'Failed to update password',
            });
        } catch (error) {
            safeConsoleError('Error completing password challenge', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to update password',
            });
        }
    }

    @Post('logout')
    async logout(@Res() res: any) {
        return res.status(HttpStatus.OK).json({
            success: true,
            message: 'Logged out successfully',
        });
    }
}

@Controller('api/oauth')
class OAuthController {
    private githubOAuthService: GitHubOAuthService;

    constructor() {
        this.githubOAuthService = new GitHubOAuthService();
    }

    @Get('github/client-id')
    async getGitHubClientId(
        @Res() res: any,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
        @Query('workstream') workstream?: string,
    ) {
        const clientId = process.env.GITHUB_CLIENT_ID;
        const clientSecret = process.env.GITHUB_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            // Return a helpful response that allows the frontend to show setup instructions
            return res.status(HttpStatus.OK).json({
                clientId: null,
                configured: false,
                error: 'GitHub OAuth Client ID not configured in backend',
                message:
                    'GitHub OAuth Client ID is not configured. Please configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.',
                setupInstructions: {
                    step1: 'Create a GitHub OAuth App at https://github.com/settings/developers',
                    step2:
                        'Set Authorization callback URL to: ' +
                        (process.env.APP_BASE_URL || 'http://localhost:3000') +
                        '/security-governance/credentials/github/oauth2/callback',
                    step3: 'Copy the Client ID and Client Secret',
                    step4: 'Add to backend .env file: GITHUB_CLIENT_ID=your_client_id',
                    step5: 'Add to backend .env file: GITHUB_CLIENT_SECRET=your_client_secret',
                    step6: 'Restart the backend server',
                },
            });
        }

        return res.status(HttpStatus.OK).json({
            clientId,
            configured: true,
        });
    }

    /**
     * Get GitHub OAuth setup instructions
     */
    @Get('github/setup-instructions')
    async getSetupInstructions(@Res() res: any) {
        const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:3000';
        const callbackUrl = `${appBaseUrl}/security-governance/credentials/github/oauth2/callback`;

        return res.status(HttpStatus.OK).json({
            configured: !!(
                process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
            ),
            instructions: {
                title: 'GitHub OAuth Setup Instructions',
                steps: [
                    {
                        step: 1,
                        title: 'Create GitHub OAuth App',
                        description:
                            'Go to https://github.com/settings/developers and click "New OAuth App"',
                        details: [
                            'Application name: Your App Name (e.g., "DevOps Automate")',
                            'Homepage URL: ' + appBaseUrl,
                            'Authorization callback URL: ' + callbackUrl,
                        ],
                    },
                    {
                        step: 2,
                        title: 'Copy Credentials',
                        description:
                            'After creating the app, copy the Client ID and Client Secret',
                    },
                    {
                        step: 3,
                        title: 'Configure Backend',
                        description:
                            'Add the following to your backend .env file:',
                        code: `GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
APP_BASE_URL=${appBaseUrl}`,
                    },
                    {
                        step: 4,
                        title: 'Restart Backend',
                        description:
                            'Restart your backend server for the changes to take effect',
                    },
                ],
                callbackUrl: callbackUrl,
                note: 'After setup, the app will appear in GitHub Settings → Applications → Authorized OAuth Apps when users authorize it.',
            },
        });
    }

    /**
     * OAuth callback endpoint - handles redirect from GitHub
     * This endpoint receives the authorization code and exchanges it for an access token
     */
    @Get('github/callback')
    async handleCallback(
        @Res() res: any,
        @Query('code') code?: string,
        @Query('state') state?: string,
        @Query('error') error?: string,
        @Query('error_description') errorDescription?: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
        @Query('workstream') workstream?: string,
        @Query('userId') userId?: string,
    ) {
        try {
            // Handle OAuth errors from GitHub
            if (error) {
                console.error('GitHub OAuth error:', error, errorDescription);
                return res.status(HttpStatus.BAD_REQUEST).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>GitHub OAuth Error</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .error { color: #d32f2f; }
                        </style>
                    </head>
                    <body>
                        <h1 class="error">Authorization Failed</h1>
                        <p>${errorDescription || error}</p>
                        <script>
                            // Close window if opened as popup, otherwise redirect
                            if (window.opener) {
                                window.opener.postMessage({ type: 'oauth-error', error: '${error}', errorDescription: '${
                    errorDescription || ''
                }' }, '*');
                                window.close();
                            } else {
                                setTimeout(() => window.location.href = '/security-governance/credentials', 3000);
                            }
                        </script>
                    </body>
                    </html>
                `);
            }

            // Check if authorization code is present
            if (!code) {
                return res.status(HttpStatus.BAD_REQUEST).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>GitHub OAuth Error</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .error { color: #d32f2f; }
                        </style>
                    </head>
                    <body>
                        <h1 class="error">Authorization Code Missing</h1>
                        <p>No authorization code received from GitHub.</p>
                        <script>
                            if (window.opener) {
                                window.opener.postMessage({ type: 'oauth-error', error: 'missing_code' }, '*');
                                window.close();
                            } else {
                                setTimeout(() => window.location.href = '/security-governance/credentials', 3000);
                            }
                        </script>
                    </body>
                    </html>
                `);
            }

            const clientId = process.env.GITHUB_CLIENT_ID;
            const clientSecret = process.env.GITHUB_CLIENT_SECRET;

            if (!clientId || !clientSecret) {
                return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>GitHub OAuth Configuration Error</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .error { color: #d32f2f; }
                        </style>
                    </head>
                    <body>
                        <h1 class="error">Configuration Error</h1>
                        <p>GitHub OAuth is not properly configured on the server.</p>
                        <script>
                            if (window.opener) {
                                window.opener.postMessage({ type: 'oauth-error', error: 'not_configured' }, '*');
                                window.close();
                            } else {
                                setTimeout(() => window.location.href = '/security-governance/credentials', 3000);
                            }
                        </script>
                    </body>
                    </html>
                `);
            }

            // Build redirect URI (must match the one used in authorization request)
            const appBaseUrl =
                process.env.APP_BASE_URL || 'http://localhost:3000';
            const redirectUri = `${appBaseUrl}/security-governance/credentials/github/oauth2/callback`;

            // Exchange code for access token with GitHub
            const tokenResponse = await axios.post(
                'https://github.com/login/oauth/access_token',
                {
                    client_id: clientId,
                    client_secret: clientSecret,
                    code: code,
                    redirect_uri: redirectUri,
                },
                {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                },
            );

            const {
                access_token,
                token_type,
                scope,
                error: tokenError,
                error_description: tokenErrorDescription,
            } = tokenResponse.data;

            if (tokenError) {
                console.error(
                    'GitHub OAuth token error:',
                    tokenError,
                    tokenErrorDescription,
                );
                return res.status(HttpStatus.BAD_REQUEST).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>GitHub OAuth Error</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .error { color: #d32f2f; }
                        </style>
                    </head>
                    <body>
                        <h1 class="error">Token Exchange Failed</h1>
                        <p>${
                            tokenErrorDescription ||
                            tokenError ||
                            'Failed to exchange authorization code'
                        }</p>
                        <script>
                            if (window.opener) {
                                window.opener.postMessage({ type: 'oauth-error', error: '${tokenError}', errorDescription: '${
                    tokenErrorDescription || ''
                }' }, '*');
                                window.close();
                            } else {
                                setTimeout(() => window.location.href = '/security-governance/credentials', 3000);
                            }
                        </script>
                    </body>
                    </html>
                `);
            }

            if (!access_token) {
                return res.status(HttpStatus.BAD_REQUEST).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>GitHub OAuth Error</title>
                        <style>
                            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                            .error { color: #d32f2f; }
                        </style>
                    </head>
                    <body>
                        <h1 class="error">No Access Token Received</h1>
                        <p>GitHub did not return an access token.</p>
                        <script>
                            if (window.opener) {
                                window.opener.postMessage({ type: 'oauth-error', error: 'no_token' }, '*');
                                window.close();
                            } else {
                                setTimeout(() => window.location.href = '/security-governance/credentials', 3000);
                            }
                        </script>
                    </body>
                    </html>
                `);
            }

            // Store the access token securely
            try {
                await this.githubOAuthService.storeAccessToken({
                    userId: userId,
                    accountId: accountId,
                    accountName: accountName,
                    enterpriseId: enterpriseId,
                    enterpriseName: enterpriseName,
                    workstream: workstream,
                    accessToken: access_token,
                    tokenType: token_type || 'bearer',
                    scope: scope,
                });
            } catch (storageError) {
                console.error('Failed to store access token:', storageError);
                // Continue - token exchange was successful even if storage fails
            }

            // Return success page that closes the window or redirects
            return res.status(HttpStatus.OK).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>GitHub Authorization Successful</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .success { color: #2e7d32; }
                        .spinner { border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 20px auto; }
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    </style>
                </head>
                <body>
                    <h1 class="success">✓ Authorization Successful!</h1>
                    <p>Your GitHub account has been successfully connected.</p>
                    <p>This window will close automatically...</p>
                    <div class="spinner"></div>
                    <script>
                        // Send success message to parent window if opened as popup
                        if (window.opener) {
                            window.opener.postMessage({
                                type: 'oauth-success',
                                accessToken: '${access_token}',
                                tokenType: '${token_type || 'bearer'}',
                                scope: '${scope || 'repo'}'
                            }, '*');
                            // Close the popup window
                            setTimeout(() => window.close(), 1000);
                        } else {
                            // If not a popup, redirect to credentials page
                            setTimeout(() => {
                                window.location.href = '/security-governance/credentials';
                            }, 2000);
                        }
                    </script>
                </body>
                </html>
            `);
        } catch (error: any) {
            console.error('OAuth callback error:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>GitHub OAuth Error</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #d32f2f; }
                    </style>
                </head>
                <body>
                    <h1 class="error">An Error Occurred</h1>
                    <p>${error.message || 'Failed to process authorization'}</p>
                    <script>
                        if (window.opener) {
                            window.opener.postMessage({ type: 'oauth-error', error: 'server_error', errorDescription: '${
                                error.message || ''
                            }' }, '*');
                            window.close();
                        } else {
                            setTimeout(() => window.location.href = '/security-governance/credentials', 3000);
                        }
                    </script>
                </body>
                </html>
            `);
        }
    }
}

@Controller('api')
class OAuthTokenController {
    private githubOAuthService: GitHubOAuthService;

    constructor() {
        this.githubOAuthService = new GitHubOAuthService();
    }

    @Post('oauth-token')
    async exchangeToken(
        @Res() res: any,
        @Body() body: any,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
        @Query('workstream') workstream?: string,
        @Query('userId') userId?: string,
    ) {
        try {
            const {code, redirectUri: customRedirectUri} = body;

            if (!code) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    message: 'Authorization code is required',
                });
            }

            const clientId = process.env.GITHUB_CLIENT_ID;
            const clientSecret = process.env.GITHUB_CLIENT_SECRET;

            if (!clientId || !clientSecret) {
                return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    message:
                        'GitHub OAuth is not properly configured. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.',
                });
            }

            // Build redirect URI (use custom if provided, otherwise default)
            const appBaseUrl =
                process.env.APP_BASE_URL || 'http://localhost:3000';
            const redirectUri =
                customRedirectUri ||
                `${appBaseUrl}/security-governance/credentials/github/oauth2/callback`;

            // Exchange code for access token with GitHub
            const tokenResponse = await axios.post(
                'https://github.com/login/oauth/access_token',
                {
                    client_id: clientId,
                    client_secret: clientSecret,
                    code: code,
                    redirect_uri: redirectUri,
                },
                {
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                },
            );

            const {access_token, token_type, scope, error, error_description} =
                tokenResponse.data;

            if (error) {
                console.error('GitHub OAuth error:', error, error_description);
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    message:
                        error_description ||
                        error ||
                        'Failed to exchange authorization code',
                });
            }

            if (!access_token) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    message: 'No access token received from GitHub',
                });
            }

            // Store the access token securely
            try {
                await this.githubOAuthService.storeAccessToken({
                    userId: userId,
                    accountId: accountId,
                    accountName: accountName,
                    enterpriseId: enterpriseId,
                    enterpriseName: enterpriseName,
                    workstream: workstream,
                    accessToken: access_token,
                    tokenType: token_type || 'bearer',
                    scope: scope,
                });
            } catch (storageError) {
                console.error('Failed to store access token:', storageError);
                // Continue even if storage fails - token exchange was successful
            }

            // Return success response
            return res.status(HttpStatus.OK).json({
                success: true,
                accessToken: access_token,
                tokenType: token_type || 'bearer',
                scope: scope || 'repo',
                message:
                    'GitHub authorization successful. The app will appear in your GitHub Authorized OAuth Apps.',
            });
        } catch (error: any) {
            console.error('Token exchange error:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                message:
                    error.message || 'Failed to exchange authorization code',
            });
        }
    }
}

// ============================================================================
// JIRA CONNECTIVITY TEST ENDPOINT
// ============================================================================
// Endpoint: POST /api/connectors/jira/test-connection
// Purpose: Test JIRA connectivity using provided URL, username, and API token
// ============================================================================

@Controller('api/connectors')
class ConnectorsController {
    /**
     * POST /api/connectors/jira/test-connection
     *
     * Tests JIRA connectivity using Username and API key:
     * - Calls: <url>/rest/api/3/myself
     *
     * Request Body:
     * {
     *   "connectorName": "Jira",
     *   "url": "https://v88654876-1765564400100.atlassian.net",
     *   "credentialName": "JIRA_Cred_Fin",
     *   "username": "v88654876@gmail.com",
     *   "apiToken": "ATATT3xFfGF0..."
     * }
     *
     * Response:
     * {
     *   "success": true,
     *   "status": "success",
     *   "connected": true,
     *   "message": "Successfully connected to JIRA",
     *   "userInfo": {
     *     "accountId": "...",
     *     "displayName": "...",
     *     "emailAddress": "..."
     *   }
     * }
     */
    @Post('jira/test-connection')
    async testJiraConnection(@Res() res: any, @Body() body: any) {
        try {
            // Extract credentials from request body
            const {url, username, apiToken, credentialName} = body;

            // Log received data for debugging
            console.log('🧪 [JIRA Test] Received request:', {
                hasUrl: !!url,
                hasUsername: !!username,
                hasApiToken: !!apiToken,
                hasCredentialName: !!credentialName,
                originalUrl: url,
                bodyKeys: Object.keys(body),
            });

            // Normalize URL - extract base domain
            let normalizedUrl = url ? url.trim() : '';

            if (normalizedUrl) {
                try {
                    const urlObj = new URL(normalizedUrl);
                    // Extract just the protocol, hostname, and port (if any)
                    // This removes any path components
                    normalizedUrl = `${urlObj.protocol}//${urlObj.host}`;
                    // Remove trailing slash if present
                    normalizedUrl = normalizedUrl.replace(/\/$/, '');
                } catch (error) {
                    // If URL parsing fails, try to clean it manually
                    normalizedUrl = normalizedUrl
                        .replace(/\/rest\/.*$/, '')
                        .replace(/\/$/, '');
                }
            }

            // Validate URL format
            if (!normalizedUrl) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    status: 'failed',
                    connected: false,
                    message: 'Missing required field: url',
                });
            }

            try {
                new URL(normalizedUrl);
            } catch (error) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    status: 'failed',
                    connected: false,
                    message: 'Invalid URL format',
                });
            }

            console.log('🔗 [JIRA Test] URL normalized:', {
                original: url,
                normalized: normalizedUrl,
            });

            // Validate required fields
            const missingFields: string[] = [];
            if (!url) missingFields.push('url');
            if (!username) missingFields.push('username');
            if (!apiToken) missingFields.push('apiToken');

            if (missingFields.length > 0) {
                const errorMessage = `Missing required fields: ${missingFields.join(
                    ', ',
                )}. Please provide url, username, and apiToken.`;

                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    status: 'failed',
                    connected: false,
                    message: errorMessage,
                    missingFields: missingFields,
                });
            }

            // Test JIRA connection using Username and API key
            console.log(
                '👤 [JIRA Test] Using Username authentication (direct API call):',
                {
                    url: normalizedUrl,
                    username: username,
                    hasApiToken: !!apiToken,
                },
            );

            // Convert username:apiToken to Base64 for Basic Authentication
            const credentials = `${username}:${apiToken}`;
            const base64Credentials =
                Buffer.from(credentials).toString('base64');
            console.log(
                '🔐 [JIRA Test] Base64 credentials generated (length):',
                base64Credentials.length,
            );

            // Construct JIRA API endpoint for testing connectivity
            // Using /rest/api/3/myself endpoint which returns current user info
            const jiraApiUrl = `${normalizedUrl}/rest/api/3/myself`;
            console.log(
                '🌐 [JIRA Test] Calling JIRA API directly:',
                jiraApiUrl,
            );

            try {
                // Make API call to JIRA with Basic Authentication
                const response = await axios.get(jiraApiUrl, {
                    headers: {
                        Authorization: `Basic ${base64Credentials}`,
                        Accept: 'application/json',
                        'Content-Type': 'application/json',
                    },
                    timeout: 10000, // 10 second timeout
                });

                console.log(
                    '✅ [JIRA Test] JIRA API response status:',
                    response.status,
                );
                console.log('📦 [JIRA Test] JIRA API response data:', {
                    accountId: response.data.accountId,
                    displayName: response.data.displayName,
                    emailAddress: response.data.emailAddress,
                });

                // If we get a successful response (200-299), connection is successful
                if (response.status >= 200 && response.status < 300) {
                    return res.status(HttpStatus.OK).json({
                        success: true,
                        status: 'success',
                        connected: true,
                        message: 'Successfully connected to JIRA',
                        userInfo: {
                            accountId: response.data.accountId,
                            displayName: response.data.displayName,
                            emailAddress: response.data.emailAddress,
                        },
                    });
                } else {
                    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                        success: false,
                        status: 'failed',
                        connected: false,
                        message: `Unexpected response status: ${response.status}`,
                    });
                }
            } catch (error: any) {
                console.error(
                    '❌ [JIRA Test] Error testing connectivity:',
                    error,
                );

                // Handle different types of errors
                let errorMessage = 'Failed to connect to JIRA';
                let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;

                if (error.response) {
                    statusCode = error.response.status;

                    if (statusCode === HttpStatus.UNAUTHORIZED) {
                        errorMessage =
                            'Authentication failed. Please check your username and API token.';
                    } else if (statusCode === HttpStatus.FORBIDDEN) {
                        errorMessage =
                            'Access forbidden. Please check your API token permissions.';
                    } else if (statusCode === HttpStatus.NOT_FOUND) {
                        errorMessage =
                            'JIRA instance not found. Please check the URL.';
                    } else {
                        errorMessage = `JIRA API error: ${error.response.status} - ${error.response.statusText}`;
                    }

                    console.error('📛 [JIRA Test] JIRA API error response:', {
                        status: error.response.status,
                        statusText: error.response.statusText,
                        data: error.response.data,
                    });
                } else if (error.request) {
                    errorMessage =
                        'No response from JIRA server. Please check the URL and network connectivity.';
                    console.error(
                        '📛 [JIRA Test] No response received:',
                        error.request,
                    );
                } else if (error.code === 'ECONNREFUSED') {
                    errorMessage =
                        'Connection refused. Please check the JIRA URL.';
                } else if (
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ECONNABORTED'
                ) {
                    errorMessage =
                        'Connection timeout. Please check the JIRA URL and network connectivity.';
                } else {
                    errorMessage =
                        error.message ||
                        'Unknown error occurred while testing connectivity';
                }

                return res.status(statusCode).json({
                    success: false,
                    status: 'failed',
                    connected: false,
                    message: errorMessage,
                    error:
                        process.env.NODE_ENV === 'development'
                            ? error.message
                            : undefined,
                });
            }
        } catch (error: any) {
            // This catch block handles unexpected errors during validation
            console.error(
                '❌ [JIRA Test] Unexpected error during validation:',
                error,
            );

            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                status: 'failed',
                connected: false,
                message:
                    'An unexpected error occurred while processing the request',
                error:
                    process.env.NODE_ENV === 'development'
                        ? error.message
                        : undefined,
            });
        }
    }
}

@Controller('api/accounts')
class AccountsController {
    @Get()
    async list() {
        try {
            console.log('📋 GET /api/accounts - storageMode:', storageMode);
            if (storageMode === 'dynamodb' && accountsDynamoDB) {
                console.log('📋 Using DynamoDB service to list accounts');
                const result = await accountsDynamoDB.list();
                console.log('✅ Listed', result?.length || 0, 'accounts');
                return result;
            }
            console.log('📋 Using filesystem service to list accounts');
            return await accounts.list();
        } catch (error: any) {
            console.error('❌ Error listing accounts:', error);
            return {
                error: 'Failed to list accounts',
                message: error?.message || 'Unknown error',
                stack:
                    process.env.NODE_ENV === 'dev' ? error?.stack : undefined,
            };
        }
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            return await accountsDynamoDB.get(id); // String ID for DynamoDB
        }
        return await accounts.get(Number(id)); // Number ID for PostgreSQL
    }

    @Post()
    async create(@Body() body: any) {
        try {
            console.log(
                '📝 POST /api/accounts - Creating account:',
                body?.accountName,
            );
            if (storageMode === 'dynamodb' && accountsDynamoDB) {
                const result = await accountsDynamoDB.create(body);
                console.log('✅ Account created:', result?.id);
                return result;
            }
            return await accounts.create(body);
        } catch (error: any) {
            console.error('❌ Error creating account:', error);
            return {
                error: 'Failed to create account',
                message: error?.message || 'Unknown error',
            };
        }
    }

    @Put()
    async update(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};

        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            const updated = await accountsDynamoDB.update(id, rest); // String ID for DynamoDB
            if (!updated) return {error: 'Not found'};
            return updated;
        }

        const updated = await accounts.update(Number(id), rest); // Number ID for PostgreSQL
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            await accountsDynamoDB.remove(id); // String ID for DynamoDB
            return {};
        }
        await accounts.remove(Number(id)); // Number ID for PostgreSQL
        return {};
    }

    /**
     * Onboard a new account
     * POST /api/accounts/onboard
     *
     * Required fields: accountName, masterAccount, subscriptionTier
     * Optional fields: addressDetails, technicalUser, email, firstName, lastName, etc.
     */
    @Post('onboard')
    async onboard(@Body() body: any, @Req() req: any, @Res() res: any) {
        try {
            // Get authorization header to forward to infrastructure API
            const authHeader =
                req.headers?.authorization || req.headers?.Authorization || '';

            // Validate required fields
            const requiredFields = [
                'accountName',
                'masterAccount',
                'subscriptionTier',
            ];
            const missingFields = requiredFields.filter(
                (field) => !body[field],
            );

            if (missingFields.length > 0) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    result: 'failed',
                    msg: `Missing required fields: ${missingFields.join(', ')}`,
                });
            }

            // Validate subscription tier
            const validTiers = ['public', 'private', 'platform'];
            if (!validTiers.includes(body.subscriptionTier)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    result: 'failed',
                    msg: `Invalid subscriptionTier. Must be one of: ${validTiers.join(
                        ', ',
                    )}`,
                });
            }

            console.log('🚀 Onboarding new account:', body.accountName);

            const now = new Date();
            let infraProvisioningResult: any = null;
            let savedAccount: any = null;

            // If infrastructure API is configured, let it handle persistence
            // to avoid duplicate entries in DynamoDB
            if (INFRA_PROVISIONING_API_BASE_URL) {
                const infraApiUrl = `${INFRA_PROVISIONING_API_BASE_URL}/onboard`;

                try {
                    console.log(
                        '🔧 Triggering infrastructure provisioning:',
                        infraApiUrl,
                    );

                    // Build payload for infrastructure API
                    // Generate default email if not provided (infra API requires email)
                    const sanitizedAccountName = body.accountName
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '');
                    const defaultEmail = `admin@${sanitizedAccountName}.local`;

                    const infraPayload = {
                        accountName: body.accountName,
                        subscriptionTier: body.subscriptionTier,
                        email: body.email || body.adminEmail || defaultEmail,
                        firstName: body.firstName || 'Admin',
                        lastName: body.lastName || body.accountName,
                        adminUsername: body.adminUsername || 'admin',
                        adminEmail:
                            body.adminEmail || body.email || defaultEmail,
                        adminPassword: body.adminPassword || 'TempPass123!',
                        createdBy: body.createdBy || 'admin',
                    };

                    console.log('📦 Infrastructure payload:', {
                        ...infraPayload,
                        adminPassword: '***hidden***',
                    });

                    // Build headers - forward auth token if present
                    const infraHeaders: Record<string, string> = {
                        'Content-Type': 'application/json',
                    };
                    if (authHeader) {
                        infraHeaders['Authorization'] = authHeader;
                        console.log(
                            '🔐 Forwarding authorization header to infra API',
                        );
                    } else {
                        console.log('⚠️ No authorization header to forward');
                    }

                    const infraResponse = await axios.post(
                        infraApiUrl,
                        infraPayload,
                        {
                            headers: infraHeaders,
                            timeout: 30000, // 30 second timeout
                        },
                    );

                    infraProvisioningResult = infraResponse.data;
                    console.log(
                        '✅ Infrastructure provisioning initiated:',
                        infraProvisioningResult,
                    );

                    // Use the account created by infra API as the source of truth
                    if (infraProvisioningResult?.data) {
                        savedAccount = {
                            id: infraProvisioningResult.data.accountId,
                            accountId: infraProvisioningResult.data.accountId,
                            accountName:
                                infraProvisioningResult.data.accountName ||
                                body.accountName,
                            masterAccount: body.masterAccount,
                            subscriptionTier:
                                infraProvisioningResult.data.subscriptionTier ||
                                body.subscriptionTier,
                            email: infraProvisioningResult.data.email,
                            firstName: infraProvisioningResult.data.firstName,
                            lastName: infraProvisioningResult.data.lastName,
                            provisioningState:
                                infraProvisioningResult.data.provisioningState,
                            stepFunctionExecutionArn:
                                infraProvisioningResult.data
                                    .stepFunctionExecutionArn,
                            createdAt:
                                infraProvisioningResult.data.registeredOn ||
                                now.toISOString(),
                            updatedAt:
                                infraProvisioningResult.data.lastModified ||
                                now.toISOString(),
                        };
                    }
                } catch (infraError: any) {
                    console.error(
                        '⚠️ Infrastructure provisioning failed:',
                        infraError?.response?.data || infraError.message,
                    );
                    infraProvisioningResult = {
                        error: 'Infrastructure provisioning failed',
                        message:
                            infraError?.response?.data?.msg ||
                            infraError.message,
                    };
                }
            } else {
                // Infra API not configured - save locally to DynamoDB
                console.log(
                    '⚠️ INFRA_PROVISIONING_API_URL not configured - saving locally only',
                );

                // Generate account ID
                const dateStr = now
                    .toISOString()
                    .slice(0, 10)
                    .replace(/-/g, '');
                const randomSuffix = Math.floor(Math.random() * 99)
                    .toString()
                    .padStart(2, '0');
                const accountId = `${dateStr.slice(0, 6)}${randomSuffix}`;

                // Build account data
                const accountData: any = {
                    id: accountId,
                    accountId: accountId,
                    accountName: body.accountName,
                    masterAccount: body.masterAccount,
                    subscriptionTier: body.subscriptionTier,
                    provisioningState: 'active',
                    status: 'ACTIVE',
                    createdAt: now.toISOString(),
                    updatedAt: now.toISOString(),
                    createdBy: body.createdBy || 'admin',
                };

                // Add optional fields if provided
                if (body.email) accountData.email = body.email;
                if (body.firstName) accountData.firstName = body.firstName;
                if (body.lastName) accountData.lastName = body.lastName;
                if (body.adminUsername)
                    accountData.adminUsername = body.adminUsername;
                if (body.adminEmail) accountData.adminEmail = body.adminEmail;
                if (body.addressDetails)
                    accountData.addressDetails = body.addressDetails;
                if (body.technicalUser)
                    accountData.technicalUser = body.technicalUser;

                // Save to DynamoDB or PostgreSQL
                if (storageMode === 'dynamodb' && accountsDynamoDB) {
                    savedAccount = await accountsDynamoDB.create(accountData);
                } else {
                    savedAccount = await accounts.create(accountData);
                }

                console.log(
                    '✅ Account saved to local database:',
                    savedAccount?.id,
                );

                infraProvisioningResult = {
                    skipped: true,
                    message:
                        'Infrastructure provisioning API not configured - saved locally',
                };
            }

            const finalAccountId =
                savedAccount?.id || savedAccount?.accountId || 'unknown';
            console.log('✅ Account onboarded successfully:', finalAccountId);

            return res.status(HttpStatus.CREATED).json({
                result: 'success',
                msg: 'Account onboarded successfully',
                data: {
                    ...savedAccount,
                    infraProvisioning: infraProvisioningResult,
                },
                accountId: finalAccountId,
            });
        } catch (error: any) {
            console.error('❌ Error onboarding account:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                result: 'failed',
                msg: `Failed to onboard account: ${error.message}`,
            });
        }
    }

    /**
     * Offboard (delete) an account
     * DELETE /api/accounts/offboard?accountId=xxx
     *
     * This triggers infrastructure deprovisioning via external API
     * and removes the account from the database
     */
    @Delete('offboard')
    async offboard(
        @Query('accountId') accountId: string,
        @Req() req: any,
        @Res() res: any,
    ) {
        try {
            // Get authorization header to forward to infrastructure API
            const authHeader =
                req.headers?.authorization || req.headers?.Authorization || '';

            if (!accountId) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    result: 'failed',
                    msg: 'accountId query parameter is required',
                });
            }

            console.log('🗑️ Offboarding account:', accountId);

            let infraDeprovisioningResult: any = null;
            let infraApiSuccess = false;

            // Try infrastructure API first if configured
            if (INFRA_PROVISIONING_API_BASE_URL) {
                const infraApiUrl = `${INFRA_PROVISIONING_API_BASE_URL}/offboard`;

                try {
                    console.log(
                        '🔧 Triggering infrastructure deprovisioning:',
                        infraApiUrl,
                    );

                    // Build headers - forward auth token if present
                    const infraHeaders: Record<string, string> = {
                        'Content-Type': 'application/json',
                    };
                    if (authHeader) {
                        infraHeaders['Authorization'] = authHeader;
                        console.log(
                            '🔐 Forwarding authorization header to infra API',
                        );
                    } else {
                        console.log('⚠️ No authorization header to forward');
                    }

                    const infraResponse = await axios.delete(
                        `${infraApiUrl}?accountId=${accountId}`,
                        {
                            headers: infraHeaders,
                            timeout: 30000, // 30 second timeout
                        },
                    );

                    infraDeprovisioningResult = infraResponse.data;
                    infraApiSuccess = true;
                    console.log(
                        '✅ Infrastructure deprovisioning initiated:',
                        infraDeprovisioningResult,
                    );
                } catch (infraError: any) {
                    console.error(
                        '⚠️ Infrastructure deprovisioning failed:',
                        infraError?.response?.data || infraError.message,
                    );
                    infraDeprovisioningResult = {
                        error: 'Infrastructure deprovisioning failed',
                        message:
                            infraError?.response?.data?.msg ||
                            infraError.message,
                    };

                    // Infra API failed - mark account as "deletion_failed" for manual review
                    // This is better than orphaning infrastructure
                    try {
                        if (storageMode === 'dynamodb' && accountsDynamoDB) {
                            await accountsDynamoDB.update(accountId, {
                                status: 'deletion_failed',
                                provisioningState: 'deletion_failed',
                                deletionError:
                                    infraError?.response?.data?.msg ||
                                    infraError.message,
                                deletionAttemptedAt: new Date().toISOString(),
                            } as any);
                            console.log(
                                '📝 Account marked as deletion_failed for manual review',
                            );
                        }
                    } catch (updateError: any) {
                        console.error(
                            '⚠️ Failed to update account status:',
                            updateError.message,
                        );
                    }

                    // Return failure so user knows deletion didn't complete
                    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                        result: 'failed',
                        msg: 'Infrastructure deprovisioning failed. Account marked for manual cleanup.',
                        data: {
                            accountId: accountId,
                            infraDeprovisioning: infraDeprovisioningResult,
                            status: 'deletion_failed',
                        },
                    });
                }
            } else {
                // Infra API not configured - delete locally only
                console.log(
                    '⚠️ INFRA_PROVISIONING_API_URL not configured - deleting locally only',
                );

                try {
                    if (storageMode === 'dynamodb' && accountsDynamoDB) {
                        await accountsDynamoDB.remove(accountId);
                        console.log('✅ Account deleted from local DynamoDB');
                    } else {
                        await accounts.remove(Number(accountId));
                        console.log('✅ Account deleted from local storage');
                    }
                } catch (deleteError: any) {
                    console.error(
                        '❌ Local deletion failed:',
                        deleteError.message,
                    );
                    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                        result: 'failed',
                        msg: `Failed to delete account: ${deleteError.message}`,
                    });
                }

                infraDeprovisioningResult = {
                    skipped: true,
                    message:
                        'Infrastructure API not configured - deleted locally only',
                };
            }

            console.log('✅ Account offboarded successfully:', accountId);

            return res.status(HttpStatus.OK).json({
                result: 'success',
                msg: 'Account offboarded successfully',
                data: {
                    accountId: accountId,
                    deletedAt: new Date().toISOString(),
                    infraDeprovisioning: infraDeprovisioningResult,
                },
            });
        } catch (error: any) {
            console.error('❌ Error offboarding account:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                result: 'failed',
                msg: `Failed to offboard account: ${error.message}`,
            });
        }
    }

    // Technical User endpoints
    @Post(':accountId/technical-users')
    async createTechnicalUser(
        @Param('accountId') accountId: string,
        @Body() body: any,
    ) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            return await accountsDynamoDB.createTechnicalUser(accountId, body);
        }
        return {error: 'Technical users only supported in DynamoDB mode'};
    }

    @Get(':accountId/technical-users')
    async getTechnicalUser(@Param('accountId') accountId: string) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            return await accountsDynamoDB.getTechnicalUser(accountId);
        }
        return {error: 'Technical users only supported in DynamoDB mode'};
    }

    @Put(':accountId/technical-users/:techUserId')
    async updateTechnicalUser(
        @Param('accountId') accountId: string,
        @Param('techUserId') techUserId: string,
        @Body() body: any,
    ) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            return await accountsDynamoDB.updateTechnicalUser(
                accountId,
                techUserId,
                body,
            );
        }
        return {error: 'Technical users only supported in DynamoDB mode'};
    }

    @Delete(':accountId/technical-users/:techUserId')
    async deleteTechnicalUser(
        @Param('accountId') accountId: string,
        @Param('techUserId') techUserId: string,
    ) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            await accountsDynamoDB.deleteTechnicalUser(accountId, techUserId);
            return {};
        }
        return {error: 'Technical users only supported in DynamoDB mode'};
    }

    // License endpoints
    @Post(':accountId/licenses')
    async createLicense(
        @Param('accountId') accountId: string,
        @Body() body: any,
    ) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            return await accountsDynamoDB.createLicense(accountId, body);
        }
        return {error: 'Licenses only supported in DynamoDB mode'};
    }

    @Get(':accountId/licenses')
    async listLicenses(@Param('accountId') accountId: string) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            return await accountsDynamoDB.listLicenses(accountId);
        }
        return {error: 'Licenses only supported in DynamoDB mode'};
    }

    @Get(':accountId/licenses/:licenseId')
    async getLicense(
        @Param('accountId') accountId: string,
        @Param('licenseId') licenseId: string,
    ) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            return await accountsDynamoDB.getLicense(accountId, licenseId);
        }
        return {error: 'Licenses only supported in DynamoDB mode'};
    }

    @Put(':accountId/licenses/:licenseId')
    async updateLicense(
        @Param('accountId') accountId: string,
        @Param('licenseId') licenseId: string,
        @Body() body: any,
    ) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            return await accountsDynamoDB.updateLicense(
                accountId,
                licenseId,
                body,
            );
        }
        return {error: 'Licenses only supported in DynamoDB mode'};
    }

    @Delete(':accountId/licenses/:licenseId')
    async deleteLicense(
        @Param('accountId') accountId: string,
        @Param('licenseId') licenseId: string,
    ) {
        if (storageMode === 'dynamodb' && accountsDynamoDB) {
            await accountsDynamoDB.deleteLicense(accountId, licenseId);
            return {};
        }
        return {error: 'Licenses only supported in DynamoDB mode'};
    }
}

@Controller('api/enterprises')
class EnterprisesController {
    @Get()
    async list() {
        return await enterprises.list();
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            return await enterprises.get(id); // String ID for DynamoDB
        } else {
            return await enterprises.get(Number(id)); // Number ID for PostgreSQL
        }
    }

    @Post()
    async create(@Body() body: any) {
        return await enterprises.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await enterprises.update(id, body); // String ID for DynamoDB
        } else {
            updated = await enterprises.update(Number(id), body); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await enterprises.update(id, rest); // String ID for DynamoDB
        } else {
            updated = await enterprises.update(Number(id), rest); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await enterprises.remove(id); // String ID for DynamoDB
        } else {
            await enterprises.remove(Number(id)); // Number ID for PostgreSQL
        }
        return {};
    }

    @Get('debug/dynamodb')
    async debugDynamoDB() {
        if (storageMode !== 'dynamodb') {
            return {error: 'DynamoDB not enabled', storageMode};
        }

        try {
            const enterpriseService = enterprises as EnterprisesDynamoDBService;
            return await enterpriseService.debugTableContents();
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                storageMode,
            };
        }
    }
}

@Controller('api/business-units')
class BusinessUnitsController {
    @Get()
    async list() {
        return await businessUnits.list();
    }
    @Get('entities')
    async listEntities(
        @Query('accountId') accountId?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        const entities = await businessUnits.listEntities(
            accountId,
            enterpriseId,
        );
        // Transform to match expected format
        return entities.map((entity) => ({
            id: entity,
            name: entity,
            description: `${entity} entity`,
        }));
    }
    @Post()
    async create(@Body() body: any) {
        return await businessUnits.create(body);
    }
    @Put()
    async update(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        const updated = await businessUnits.update(Number(id), rest);
        if (!updated) return {error: 'Not found'};
        return updated;
    }
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await businessUnits.remove(Number(id));
        return {};
    }
}

@Controller('api/services')
class ServicesController {
    @Get()
    async list() {
        return await services.list();
    }

    @Get('debug')
    async debug() {
        return await services.debugTableContents();
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            return await services.get(id); // String ID for DynamoDB
        } else {
            return await services.get(Number(id)); // Number ID for PostgreSQL
        }
    }

    @Post()
    async create(@Body() body: any) {
        return await services.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await services.update(id, body); // String ID for DynamoDB
        } else {
            updated = await services.update(Number(id), body); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await services.update(id, rest); // String ID for DynamoDB
        } else {
            updated = await services.update(Number(id), rest); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await services.remove(id); // String ID for DynamoDB
        } else {
            await services.remove(Number(id)); // Number ID for PostgreSQL
        }
        return {};
    }
}

@Controller('api/products')
class ProductsController {
    @Get()
    async list() {
        return await products.list();
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            return await products.get(id); // String ID for DynamoDB
        } else {
            return await products.get(Number(id)); // Number ID for PostgreSQL
        }
    }

    @Post()
    async create(@Body() body: any) {
        return await products.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await products.update(id, body); // String ID for DynamoDB
        } else {
            updated = await products.update(Number(id), body); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await products.update(id, rest); // String ID for DynamoDB
        } else {
            updated = await products.update(Number(id), rest); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await products.remove(id); // String ID for DynamoDB
        } else {
            await products.remove(Number(id)); // Number ID for PostgreSQL
        }
        return {};
    }
}

@Controller('api/pipelines')
class PipelinesController {
    @Get()
    async list() {
        // Return pipeline names (reusing enterprises for now as a placeholder)
        return await enterprises.list();
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            return await enterprises.get(id);
        } else {
            return await enterprises.get(Number(id));
        }
    }

    @Post()
    async create(@Body() body: any) {
        return await enterprises.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await enterprises.update(id, body);
        } else {
            updated = await enterprises.update(Number(id), body);
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await enterprises.update(id, rest);
        } else {
            updated = await enterprises.update(Number(id), rest);
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await enterprises.remove(id);
        } else {
            await enterprises.remove(Number(id));
        }
        return {};
    }
}

@Controller('api/pipeline-details')
class PipelineDetailsController {
    @Get()
    async list() {
        // Return pipeline details (reusing products for now as a placeholder)
        return await products.list();
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            return await products.get(id);
        } else {
            return await products.get(Number(id));
        }
    }

    @Post()
    async create(@Body() body: any) {
        return await products.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await products.update(id, body);
        } else {
            updated = await products.update(Number(id), body);
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await products.update(id, rest);
        } else {
            updated = await products.update(Number(id), rest);
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await products.remove(id);
        } else {
            await products.remove(Number(id));
        }
        return {};
    }
}

@Controller('api/pipeline-services')
class PipelineServicesController {
    @Get()
    async list() {
        // Return services
        return await services.list();
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            return await services.get(id);
        } else {
            return await services.get(Number(id));
        }
    }

    @Post()
    async create(@Body() body: any) {
        return await services.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await services.update(id, body);
        } else {
            updated = await services.update(Number(id), body);
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await services.update(id, rest);
        } else {
            updated = await services.update(Number(id), rest);
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await services.remove(id);
        } else {
            await services.remove(Number(id));
        }
        return {};
    }
}

@Controller('api/pipeline-canvas')
class PipelineCanvasController {
    @Get()
    async list(
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
    ) {
        try {
            // Return pipeline canvas data (separate from enterprise configuration)
            if (storageMode === 'dynamodb' && pipelineCanvasDynamoDB) {
                // If account/enterprise filters provided, use filtered query
                if (accountId && accountName) {
                    return await pipelineCanvasDynamoDB.listByAccountEnterprise(
                        accountId,
                        accountName,
                        enterpriseId,
                    );
                }
                return await pipelineCanvasDynamoDB.list();
            } else {
                return await pipelineCanvas.list();
            }
        } catch (error: any) {
            console.error('Error listing pipeline canvas:', error);
            throw error;
        }
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb' && pipelineCanvasDynamoDB) {
            return await pipelineCanvasDynamoDB.get(id);
        }
        return await pipelineCanvas.get(id);
    }

    @Post()
    async create(@Body() body: any) {
        try {
            console.log('Creating pipeline canvas with body:', body);

            const data = {
                pipelineName: body.pipelineName || '',
                details: body.details || '',
                service: body.service || '',
                entity: body.entity || '',
                status: body.status || 'Active',
                lastUpdated: new Date().toISOString(),
                accountId: body.accountId,
                accountName: body.accountName,
                enterpriseId: body.enterpriseId,
                enterpriseName: body.enterpriseName,
                yamlContent: body.yamlContent,
                createdBy: body.createdBy,
            };

            if (storageMode === 'dynamodb' && pipelineCanvasDynamoDB) {
                return await pipelineCanvasDynamoDB.create(data);
            }
            return await pipelineCanvas.create(data);
        } catch (error: any) {
            console.error('Error creating pipeline canvas:', error);
            throw error;
        }
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any, @Res() res: any) {
        try {
            const data: any = {};
            if (body.pipelineName !== undefined)
                data.pipelineName = body.pipelineName;
            if (body.details !== undefined) data.details = body.details;
            if (body.service !== undefined) data.service = body.service;
            if (body.entity !== undefined) data.entity = body.entity;
            if (body.status !== undefined) data.status = body.status;
            if (body.yamlContent !== undefined)
                data.yamlContent = body.yamlContent;
            data.lastUpdated = new Date().toISOString();

            let result;
            if (storageMode === 'dynamodb' && pipelineCanvasDynamoDB) {
                result = await pipelineCanvasDynamoDB.update(id, data);
            } else {
                result = await pipelineCanvas.update(id, data);
            }

            if (!result) {
                return res.status(404).json({error: 'Pipeline not found'});
            }

            return res.json(result);
        } catch (error: any) {
            console.error('Error updating pipeline-canvas:', error.message);
            return res.status(500).json({
                error: 'Failed to update pipeline',
                message: error.message,
            });
        }
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb' && pipelineCanvasDynamoDB) {
            await pipelineCanvasDynamoDB.remove(id);
        } else {
            await pipelineCanvas.remove(id);
        }
        return {success: true};
    }
}

@Controller('api/users')
class UsersController {
    @Get()
    async list(
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                // Determine if filtering by account
                // Check for empty strings, null, undefined, or "systiva"
                const isSystivaAccount =
                    !accountId ||
                    accountId === '' ||
                    !accountName ||
                    accountName === '' ||
                    accountName.toLowerCase() === 'systiva';

                // Determine if filtering by enterprise
                const isGlobalEnterprise =
                    !enterpriseId ||
                    enterpriseId === '' ||
                    !enterpriseName ||
                    enterpriseName === '' ||
                    enterpriseName.toLowerCase() === 'global';

                let usersFromDB;
                if (isSystivaAccount) {
                    usersFromDB = await userManagement.listUsers();
                } else {
                    usersFromDB = await userManagement.listUsersByAccount(
                        accountId,
                        accountName,
                    );
                }

                // Filter by enterprise if not Global
                if (!isGlobalEnterprise && usersFromDB) {
                    usersFromDB = usersFromDB.filter(
                        (user: any) =>
                            !user.enterpriseId ||
                            user.enterpriseId === enterpriseId ||
                            user.enterpriseName?.toLowerCase() ===
                                enterpriseName?.toLowerCase(),
                    );
                }

                // Fetch assigned groups for each user
                const usersWithGroups = await Promise.all(
                    usersFromDB.map(async (user: any) => {
                        try {
                            const assignedGroups =
                                await userManagement.getUserGroups(
                                    user.id,
                                    accountId, // Pass account context
                                    accountName, // Pass account context
                                    enterpriseId, // Pass enterprise context
                                    enterpriseName, // Pass enterprise context
                                );
                            return {
                                ...user,
                                assignedUserGroups: assignedGroups,
                            };
                        } catch (error) {
                            console.error(
                                `❌ Failed to get groups for user ${user.id}:`,
                                error,
                            );
                            return {
                                ...user,
                                assignedUserGroups: [],
                            };
                        }
                    }),
                );

                return usersWithGroups;
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                const result = await users.listUsers({limit: 1000});
                return result.users;
            } else {
                // Filesystem mode - return empty array for now
                console.log('📁 Filesystem mode: returning empty users array');
                return [];
            }
        } catch (error) {
            console.error('Error in list endpoint:', error);
            throw error;
        }
    }
    @Post()
    async create(@Body() body: any, @Res() res: any) {
        try {
            // Check both email and emailAddress fields for compatibility
            const emailToCheck = body?.emailAddress || body?.email;

            if (storageMode === 'dynamodb' && userManagement) {
                const userPayload = {
                    firstName: body.firstName,
                    middleName: body.middleName,
                    lastName: body.lastName,
                    emailAddress: emailToCheck,
                    password: body.password,
                    status: (body.status === 'Active'
                        ? 'ACTIVE'
                        : 'INACTIVE') as 'ACTIVE' | 'INACTIVE',
                    startDate:
                        body.startDate ||
                        new Date().toISOString().split('T')[0],
                    endDate: body.endDate,
                    technicalUser:
                        body.technicalUser === true ||
                        body.technicalUser === 'true',
                    assignedGroups: body.assignedUserGroups
                        ? body.assignedUserGroups.map(
                              (group: any) => group.id || group,
                          )
                        : [],
                };

                // Determine which table to use based on selected account
                const selectedAccountId = body.selectedAccountId;
                const selectedAccountName = body.selectedAccountName;

                // If Systiva is selected or no account is selected, use systiva table
                // Check for null, undefined, empty string, or string "null"
                const isSystivaAccount =
                    !selectedAccountId ||
                    !selectedAccountName ||
                    selectedAccountId === 'null' ||
                    selectedAccountName === 'null' ||
                    selectedAccountName.toLowerCase() === 'systiva';

                if (isSystivaAccount) {
                    const created = await userManagement.createUser(
                        userPayload,
                    );
                    return res.status(HttpStatus.CREATED).json(created);
                } else {
                    const created =
                        await userManagement.createUserInAccountTable(
                            userPayload,
                            selectedAccountId,
                            selectedAccountName,
                        );
                    return res.status(HttpStatus.CREATED).json(created);
                }
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                if (emailToCheck) {
                    const emailAvailable = await users.isEmailAvailable(
                        emailToCheck,
                    );
                    if (!emailAvailable) {
                        return res
                            .status(HttpStatus.CONFLICT)
                            .json({error: 'Email address already exists'});
                    }
                }

                const created = await users.createUser({
                    firstName: body.firstName,
                    middleName: body.middleName,
                    lastName: body.lastName,
                    emailAddress: emailToCheck,
                    password: body.password,
                    status: body.status || 'Active',
                    startDate:
                        body.startDate ||
                        new Date().toISOString().split('T')[0],
                    endDate: body.endDate,
                    technicalUser: body.technicalUser || false,
                    assignedUserGroups: body.assignedUserGroups || [],
                });

                // Remove password from response
                const {password, ...userResponse} = created;
                return res.status(HttpStatus.CREATED).json(userResponse);
            } else {
                // Filesystem mode not supported for user creation
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'User creation requires database storage mode',
                    message:
                        'Please configure STORAGE_MODE to postgres or dynamodb',
                });
            }
        } catch (error: any) {
            console.error('Error creating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to create user',
                details: error.message,
            });
        }
    }

    // Standard REST API endpoints
    @Get(':id')
    async getById(@Param('id') id: string, @Res() res: any) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    error: 'User not found',
                });
            }

            // Remove password from response
            const {password, ...userResponse} = user;
            return res.status(HttpStatus.OK).json(userResponse);
        } catch (error: any) {
            console.error('Error fetching user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to fetch user',
                details: error.message,
            });
        }
    }
    @Put(':id')
    async updateById(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                // Check account context from request body
                const selectedAccountId = body.selectedAccountId;
                const selectedAccountName = body.selectedAccountName;

                const isSystivaAccount =
                    !selectedAccountId ||
                    !selectedAccountName ||
                    selectedAccountId === 'null' ||
                    selectedAccountName === 'null' ||
                    selectedAccountName.toLowerCase() === 'systiva';

                const updatePayload: any = {
                    firstName: body.firstName,
                    middleName: body.middleName,
                    lastName: body.lastName,
                    emailAddress: body.emailAddress,
                    status: body.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
                    startDate: body.startDate,
                    endDate: body.endDate,
                    technicalUser: body.technicalUser || false,
                };

                // Handle user group assignments if provided
                if (
                    body.assignedUserGroups &&
                    Array.isArray(body.assignedUserGroups)
                ) {
                    updatePayload.assignedGroups = body.assignedUserGroups.map(
                        (group: any) => group.id || group,
                    );
                }

                let updatedUser;
                if (isSystivaAccount) {
                    // Update in systiva table
                    updatedUser = await userManagement.updateUser(
                        id,
                        updatePayload,
                    );
                } else {
                    // Update in sys_accounts table
                    updatedUser = await userManagement.updateUserInAccountTable(
                        id,
                        updatePayload,
                        selectedAccountId,
                        selectedAccountName,
                    );
                }

                if (!updatedUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                return res.status(HttpStatus.OK).json(updatedUser);
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                const existingUser = await users.getById(id);
                if (!existingUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                // Check email uniqueness if email is being updated
                if (
                    body.emailAddress &&
                    body.emailAddress !== existingUser.emailAddress
                ) {
                    const emailAvailable = await users.isEmailAvailable(
                        body.emailAddress,
                        id,
                    );
                    if (!emailAvailable) {
                        return res.status(HttpStatus.CONFLICT).json({
                            error: 'Email address already exists',
                        });
                    }
                }

                // Use the enhanced updateUser method
                const updatedUser = await users.updateUser(id, body);
                if (!updatedUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                // Remove password from response
                const {password, ...userResponse} = updatedUser;
                return res.status(HttpStatus.OK).json(userResponse);
            } else {
                // Filesystem mode - mock update for testing
                console.log(`📁 Filesystem mode: mock updating user ${id}`);
                const mockUser = {
                    id: id,
                    firstName: body.firstName,
                    middleName: body.middleName,
                    lastName: body.lastName,
                    emailAddress: body.emailAddress,
                    status: body.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
                    startDate: body.startDate,
                    endDate: body.endDate,
                    technicalUser: body.technicalUser || false,
                    updatedAt: new Date().toISOString(),
                };
                return res.status(HttpStatus.OK).json(mockUser);
            }
        } catch (error: any) {
            console.error('Error updating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to update user',
                details: error.message,
            });
        }
    }

    @Patch(':id')
    async partialUpdateById(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                // Use UserManagement DynamoDB service for partial updates (saves to systiva table)
                const updatePayload: any = {
                    ...(body.firstName && {firstName: body.firstName}),
                    ...(body.middleName && {middleName: body.middleName}),
                    ...(body.lastName && {lastName: body.lastName}),
                    ...(body.emailAddress && {emailAddress: body.emailAddress}),
                    ...(body.status && {
                        status:
                            body.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
                    }),
                    ...(body.startDate && {startDate: body.startDate}),
                    ...(body.endDate && {endDate: body.endDate}),
                    ...(body.technicalUser !== undefined && {
                        technicalUser: body.technicalUser,
                    }),
                };

                // Handle assigned groups if provided
                if (
                    body.assignedUserGroups &&
                    Array.isArray(body.assignedUserGroups)
                ) {
                    updatePayload.assignedGroups = body.assignedUserGroups.map(
                        (group: any) => group.id || group,
                    );
                }

                const updatedUser = await userManagement.updateUser(
                    id,
                    updatePayload,
                );

                if (!updatedUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                console.log(`✅ User ${id} partially updated in systiva table`);

                return res.status(HttpStatus.OK).json(updatedUser);
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                const existingUser = await users.getById(id);
                if (!existingUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                // Check email uniqueness if email is being updated
                if (
                    body.emailAddress &&
                    body.emailAddress !== existingUser.emailAddress
                ) {
                    const emailAvailable = await users.isEmailAvailable(
                        body.emailAddress,
                        id,
                    );
                    if (!emailAvailable) {
                        return res.status(HttpStatus.CONFLICT).json({
                            error: 'Email address already exists',
                        });
                    }
                }

                // Use the enhanced updateUser method for partial updates too
                const updatedUser = await users.updateUser(id, body);
                if (!updatedUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                // Remove password from response
                const {password, ...userResponse} = updatedUser;
                return res.status(HttpStatus.OK).json(userResponse);
            } else {
                // Filesystem mode - mock partial update for testing
                console.log(
                    `📁 Filesystem mode: mock partial updating user ${id}`,
                );
                const mockUser = {
                    id: id,
                    ...(body.firstName && {firstName: body.firstName}),
                    ...(body.middleName && {middleName: body.middleName}),
                    ...(body.lastName && {lastName: body.lastName}),
                    ...(body.emailAddress && {emailAddress: body.emailAddress}),
                    ...(body.status && {
                        status:
                            body.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
                    }),
                    ...(body.startDate && {startDate: body.startDate}),
                    ...(body.endDate && {endDate: body.endDate}),
                    ...(body.technicalUser !== undefined && {
                        technicalUser: body.technicalUser,
                    }),
                    updatedAt: new Date().toISOString(),
                };
                return res.status(HttpStatus.OK).json(mockUser);
            }
        } catch (error: any) {
            console.error('Error updating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to update user',
                details: error.message,
            });
        }
    }

    // Legacy PUT endpoint (keeping for backward compatibility)
    @Put('legacy')
    async updateLegacy(@Body() body: any, @Res() res: any) {
        const {id, ...rest} = body || {};
        if (!id)
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: 'id required'});
        const exists = users.getById(id);
        if (!exists)
            return res.status(HttpStatus.NOT_FOUND).json({error: 'Not found'});
        const updated = await users.updateUser(id, rest);
        return res.status(HttpStatus.OK).json(updated);
    }
    // Cleanup endpoint to remove incomplete users
    @Delete('cleanup/incomplete')
    async cleanupIncompleteUsers(@Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                // Get all users from systiva table
                const allUsers = await userManagement.listUsers();
                const incompleteUsers = allUsers.filter(
                    (user) =>
                        !user.firstName ||
                        !user.lastName ||
                        !user.emailAddress ||
                        user.firstName.trim() === '' ||
                        user.lastName.trim() === '' ||
                        user.emailAddress.trim() === '',
                );

                console.log(
                    `🧹 Found ${incompleteUsers.length} incomplete users to cleanup`,
                );

                // Delete incomplete users
                for (const user of incompleteUsers) {
                    await userManagement.deleteUser(user.id);
                    console.log(
                        `🗑️ Deleted incomplete user: ${user.id} from systiva table`,
                    );
                }

                return res.status(HttpStatus.OK).json({
                    success: true,
                    deletedCount: incompleteUsers.length,
                    message: `Cleaned up ${incompleteUsers.length} incomplete users`,
                });
            } else {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    error: 'Cleanup only available in DynamoDB mode',
                });
            }
        } catch (error: any) {
            console.error('Error cleaning up incomplete users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to cleanup incomplete users',
                details: error.message,
            });
        }
    }

    @Delete(':id')
    async remove(
        @Param('id') id: string,
        @Res() res: any,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                // Check account context from query parameters
                const isSystivaAccount =
                    !accountId ||
                    !accountName ||
                    accountId === 'null' ||
                    accountName === 'null' ||
                    accountName.toLowerCase() === 'systiva';

                if (isSystivaAccount) {
                    // Delete from systiva table
                    await userManagement.deleteUser(id);
                } else {
                    // Delete from sys_accounts table
                    await userManagement.deleteUserFromAccountTable(
                        id,
                        accountId,
                        accountName,
                    );
                }

                return res.status(HttpStatus.NO_CONTENT).send();
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                const exists = await users.getById(id);
                if (!exists) {
                    return res
                        .status(HttpStatus.NOT_FOUND)
                        .json({error: 'User not found'});
                }

                const deleted = await users.deleteUser(id);
                if (!deleted) {
                    return res
                        .status(HttpStatus.NOT_FOUND)
                        .json({error: 'User not found'});
                }

                return res.status(HttpStatus.NO_CONTENT).send();
            } else {
                // Filesystem mode - mock deletion
                console.log(`📁 Filesystem mode: mock deleting user ${id}`);
                return res.status(HttpStatus.NO_CONTENT).send();
            }
        } catch (error: any) {
            console.error('Error deleting user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to delete user',
                details: error.message,
            });
        }
    }

    // Optional granular endpoints
    @Patch(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const exists = await users.getById(id);
            if (!exists)
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User not found'});

            // Accept both uppercase and title case
            const normalizedStatus = body?.status?.toUpperCase();
            if (!['ACTIVE', 'INACTIVE'].includes(normalizedStatus)) {
                return res
                    .status(HttpStatus.BAD_REQUEST)
                    .json({error: 'Status must be ACTIVE or INACTIVE'});
            }

            const updated = await users.updateUser(id, {
                status: normalizedStatus,
            });
            if (!updated) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User not found'});
            }

            // Remove password from response
            const {password, ...userResponse} = updated;
            return res.status(HttpStatus.OK).json(userResponse);
        } catch (error: any) {
            console.error('Error updating user status:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to update user status',
                details: error.message,
            });
        }
    }

    @Patch(':id/lock')
    async updateLock(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const exists = await users.getById(id);
            if (!exists)
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User not found'});

            if (typeof body?.locked !== 'boolean') {
                return res
                    .status(HttpStatus.BAD_REQUEST)
                    .json({error: 'locked must be a boolean value'});
            }

            // Note: This is a legacy field - modern implementations might not use this
            // Since 'locked' is not in our current schema, we'll just return success for compatibility
            const user = await users.getById(id);
            if (!user) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User not found'});
            }
            const updated = user; // Return existing user since locked field doesn't exist
            return res.status(HttpStatus.OK).json(updated);
        } catch (error: any) {
            console.error('Error updating user lock status:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to update user lock status',
                details: error.message,
            });
        }
    }

    @Post(':id/password/legacy')
    async updatePasswordLegacy(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        const exists = users.getById(id);
        if (!exists)
            return res.status(HttpStatus.NOT_FOUND).json({error: 'Not found'});
        const pwd: string = body?.password || '';
        const valid =
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(pwd);
        if (!valid)
            return res.status(HttpStatus.BAD_REQUEST).json({
                error: 'password does not meet complexity requirements',
            });
        // No-op store for filesystem mode
        return res.status(HttpStatus.NO_CONTENT).send();
    }

    // Group assignment endpoints
    @Post(':id/groups/legacy')
    async assignGroupLegacy(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        const user = await users.getById(id);
        if (!user)
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'User not found'});
        const group = groups.get(body?.groupId);
        if (!group)
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'Group not found'});
        await userGroups.create(user.emailAddress, {
            id: group.id,
            name: group.name,
            description: group.description,
        });
        return res.status(HttpStatus.NO_CONTENT).send();
    }

    @Delete(':id/groups/:groupId/legacy')
    async unassignGroupLegacy(
        @Param('id') id: string,
        @Param('groupId') groupId: string,
        @Res() res: any,
    ) {
        const user = await users.getById(id);
        if (!user)
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'User not found'});
        await userGroups.removeForUser(user.emailAddress, groupId);
        return res.status(HttpStatus.NO_CONTENT).send();
    }

    // ===============================
    // NEW COMPREHENSIVE USER MANAGEMENT APIS
    // ===============================

    // Enhanced list with pagination and filtering
    @Get('paginated')
    async listPaginated(
        @Res() res: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
        @Query('status') status?: 'Active' | 'Inactive',
        @Query('technicalUser') technicalUser?: string,
        @Query('groupId') groupId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        try {
            const query = {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                search,
                status: status
                    ? ((status === 'Active' ? 'ACTIVE' : 'INACTIVE') as
                          | 'ACTIVE'
                          | 'INACTIVE')
                    : undefined,
                technicalUser: technicalUser
                    ? technicalUser === 'true'
                    : undefined,
                groupId: groupId ? parseInt(groupId) : undefined,
                startDate,
                endDate,
            };

            const result = await users.listUsers(query);

            // Remove passwords from response
            const usersWithoutPasswords = result.users.map((user) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    ...result,
                    users: usersWithoutPasswords,
                },
            });
        } catch (error: any) {
            console.error('Error listing users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to list users',
            });
        }
    }

    // Enhanced create user
    @Post('enhanced')
    async createEnhanced(@Body() body: any, @Res() res: any) {
        try {
            // Validate required fields
            const requiredFields = [
                'firstName',
                'lastName',
                'emailAddress',
                'password',
                'startDate',
            ];
            for (const field of requiredFields) {
                if (!body[field]) {
                    return res.status(HttpStatus.BAD_REQUEST).json({
                        success: false,
                        error: `${field} is required`,
                    });
                }
            }

            // Check if email already exists
            const existing = await users.getByEmailAddress(body.emailAddress);
            if (existing) {
                return res.status(HttpStatus.CONFLICT).json({
                    success: false,
                    error: 'Email address already exists',
                });
            }

            // Validate password complexity
            const pwd: string = body.password || '';
            const valid =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(
                    pwd,
                );
            if (!valid) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Password does not meet complexity requirements (min 8 chars, uppercase, lowercase, number, special char)',
                });
            }

            const user = await users.createUser({
                firstName: body.firstName,
                middleName: body.middleName,
                lastName: body.lastName,
                emailAddress: body.emailAddress,
                status: body.status || 'Active',
                startDate: body.startDate,
                endDate: body.endDate,
                password: body.password,
                technicalUser: body.technicalUser || false,
                assignedUserGroups: body.assignedUserGroups || [],
            });

            // Remove password from response
            const {password, ...userResponse} = user;

            return res.status(HttpStatus.CREATED).json({
                success: true,
                message: 'User created successfully',
                data: userResponse,
            });
        } catch (error: any) {
            console.error('Error creating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to create user',
                details: error.message || error,
            });
        }
    }

    // Enhanced get by ID
    @Get('enhanced/:id')
    async getByIdEnhanced(@Param('id') id: string, @Res() res: any) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            // Remove password from response
            const {password, ...userResponse} = user;

            return res.status(HttpStatus.OK).json({
                success: true,
                data: userResponse,
            });
        } catch (error: any) {
            console.error('Error getting user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get user',
            });
        }
    }

    // Enhanced update user
    @Put('enhanced/:id')
    async updateEnhanced(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const existingUser = await users.getById(id);
            if (!existingUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            // Check email uniqueness if email is being updated
            if (
                body.emailAddress &&
                body.emailAddress !== existingUser.emailAddress
            ) {
                const emailAvailable = await users.isEmailAvailable(
                    body.emailAddress,
                    id,
                );
                if (!emailAvailable) {
                    return res.status(HttpStatus.CONFLICT).json({
                        success: false,
                        error: 'Email address already exists',
                    });
                }
            }

            const updatedUser = await users.updateUser(id, body);
            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            // Remove password from response
            const {password, ...userResponse} = updatedUser;

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User updated successfully',
                data: userResponse,
            });
        } catch (error: any) {
            console.error('Error updating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to update user',
            });
        }
    }

    // Enhanced delete user
    @Delete('enhanced/:id')
    async deleteEnhanced(@Param('id') id: string, @Res() res: any) {
        try {
            const success = await users.deleteUser(id);
            if (!success) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User deleted successfully',
            });
        } catch (error: any) {
            console.error('Error deleting user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to delete user',
            });
        }
    }

    // Password Management
    @Put(':id/password')
    async updatePasswordEnhanced(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            if (!body.currentPassword || !body.newPassword) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'currentPassword and newPassword are required',
                });
            }

            // Validate new password complexity
            const valid =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(
                    body.newPassword,
                );
            if (!valid) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'New password does not meet complexity requirements',
                });
            }

            const success = await users.updatePassword(
                id,
                body.currentPassword,
                body.newPassword,
            );
            if (!success) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Current password is incorrect',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Password updated successfully',
            });
        } catch (error: any) {
            console.error('Error updating password:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to update password',
            });
        }
    }

    @Post(':id/password/reset')
    async resetPassword(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            if (!body.newPassword) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'newPassword is required',
                });
            }

            // Validate new password complexity
            const valid =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(
                    body.newPassword,
                );
            if (!valid) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Password does not meet complexity requirements',
                });
            }

            const success = await users.resetPassword(id, body.newPassword);
            if (!success) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Password reset successfully',
                data: {
                    temporaryPassword: body.newPassword,
                    requiresChange: true,
                },
            });
        } catch (error: any) {
            console.error('Error resetting password:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to reset password',
            });
        }
    }

    // User Status Management
    @Put(':id/status/enhanced')
    async updateStatusEnhanced(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            if (!['Active', 'Inactive'].includes(body.status)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Status must be Active or Inactive',
                });
            }

            const updatedUser = await users.updateUser(id, {
                status: body.status,
                endDate: body.endDate,
            });

            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            const {password, ...userResponse} = updatedUser;

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User status updated successfully',
                data: userResponse,
            });
        } catch (error: any) {
            console.error('Error updating user status:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to update user status',
            });
        }
    }

    @Put(':id/activate')
    async activate(@Param('id') id: string, @Res() res: any) {
        try {
            const updatedUser = await users.updateUser(id, {status: 'Active'});
            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User activated successfully',
            });
        } catch (error: any) {
            console.error('Error activating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to activate user',
            });
        }
    }

    @Put(':id/deactivate')
    async deactivate(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const updatedUser = await users.updateUser(id, {
                status: 'Inactive',
                endDate: body.endDate,
            });

            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User deactivated successfully',
            });
        } catch (error: any) {
            console.error('Error deactivating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to deactivate user',
            });
        }
    }

    // Technical User Management
    @Put(':id/technical-flag')
    async updateTechnicalFlag(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            if (typeof body.technicalUser !== 'boolean') {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'technicalUser must be a boolean',
                });
            }

            const updatedUser = await users.updateUser(id, {
                technicalUser: body.technicalUser,
            });

            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            const {password, ...userResponse} = updatedUser;

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Technical user flag updated successfully',
                data: {
                    technicalUser: userResponse.technicalUser,
                    updatedAt: userResponse.updatedAt,
                },
            });
        } catch (error: any) {
            console.error('Error updating technical flag:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to update technical user flag',
            });
        }
    }

    @Get('technical')
    async getTechnicalUsers(
        @Res() res: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        try {
            const query = {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                technicalUser: true,
            };

            const result = await users.listUsers(query);

            // Remove passwords from response
            const usersWithoutPasswords = result.users.map((user) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    ...result,
                    users: usersWithoutPasswords,
                },
            });
        } catch (error: any) {
            console.error('Error getting technical users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get technical users',
            });
        }
    }

    // User Validation
    @Post('validate-email')
    async validateEmail(@Body() body: any, @Res() res: any) {
        try {
            if (!body.emailAddress) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'emailAddress is required',
                });
            }

            const available = await users.isEmailAvailable(
                body.emailAddress,
                body.excludeUserId,
            );

            return res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    available,
                    message: available
                        ? 'Email address is available'
                        : 'Email address is already taken',
                },
            });
        } catch (error: any) {
            console.error('Error validating email:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to validate email',
            });
        }
    }

    @Get('search')
    async searchUsers(
        @Res() res: any,
        @Query('q') searchQuery?: string,
        @Query('fields') fields?: string,
        @Query('exact') exact?: string,
    ) {
        try {
            if (!searchQuery) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Search query (q) is required',
                });
            }

            const result = await users.listUsers({search: searchQuery});

            // Remove passwords from response
            const usersWithoutPasswords = result.users.map((user) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    users: usersWithoutPasswords,
                    total: result.pagination.totalUsers,
                    query: searchQuery,
                    fields: fields
                        ? fields.split(',')
                        : ['firstName', 'lastName', 'emailAddress'],
                },
            });
        } catch (error: any) {
            console.error('Error searching users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to search users',
            });
        }
    }

    // Bulk Operations
    @Post('bulk')
    async bulkCreate(@Body() body: any, @Res() res: any) {
        try {
            if (!body.users || !Array.isArray(body.users)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'users array is required',
                });
            }

            const result = await users.bulkCreate(body.users);

            // Remove passwords from created users
            const createdWithoutPasswords = result.created.map((user: any) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                message: `${result.created.length} users created successfully`,
                data: {
                    created: createdWithoutPasswords,
                    errors: result.errors,
                },
            });
        } catch (error: any) {
            console.error('Error bulk creating users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to bulk create users',
            });
        }
    }

    @Put('bulk')
    async bulkUpdate(@Body() body: any, @Res() res: any) {
        try {
            if (!body.updates || !Array.isArray(body.updates)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'updates array is required',
                });
            }

            const result = await users.bulkUpdate(body.updates);

            // Remove passwords from updated users
            const updatedWithoutPasswords = result.updated.map((user: any) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                message: `${result.updated.length} users updated successfully`,
                data: {
                    updated: updatedWithoutPasswords,
                    errors: result.errors,
                },
            });
        } catch (error: any) {
            console.error('Error bulk updating users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to bulk update users',
            });
        }
    }

    @Delete('bulk')
    async bulkDelete(@Body() body: any, @Res() res: any) {
        try {
            if (!body.userIds || !Array.isArray(body.userIds)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'userIds array is required',
                });
            }

            const result = await users.bulkDelete(body.userIds);

            return res.status(HttpStatus.OK).json({
                success: true,
                message: `${result.deleted.length} users deleted successfully`,
                data: {
                    deleted: result.deleted,
                    errors: result.errors,
                },
            });
        } catch (error: any) {
            console.error('Error bulk deleting users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to bulk delete users',
            });
        }
    }

    // User Group Management
    @Post(':id/groups')
    async assignGroupToUser(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            console.log(
                `🔗 Assigning group to user ${id}, body:`,
                JSON.stringify(body, null, 2),
            );

            // Check if this is a single group assignment {groupId: "..."} or bulk assignment {groupIds: [...]}
            if (body.groupId) {
                // Single group assignment (new format for individual assignments)
                if (storageMode === 'dynamodb' && userManagement) {
                    // Get current user to update assigned groups
                    const user = await userManagement.getUser(id);
                    if (!user) {
                        return res.status(HttpStatus.NOT_FOUND).json({
                            success: false,
                            error: 'User not found',
                        });
                    }

                    const currentGroups = user.assignedGroups || [];
                    if (!currentGroups.includes(body.groupId)) {
                        await userManagement.updateUser(id, {
                            assignedGroups: [...currentGroups, body.groupId],
                        });
                    }

                    console.log(
                        `✅ Assigned user ${id} to group ${body.groupId} in systiva table`,
                    );

                    return res.status(HttpStatus.OK).json({
                        success: true,
                        message: 'Group assigned successfully',
                        data: {
                            userId: id,
                            groupId: body.groupId,
                        },
                    });
                } else {
                    // Fallback for non-DynamoDB modes
                    return res.status(HttpStatus.BAD_REQUEST).json({
                        success: false,
                        error: 'Single group assignment only supported in DynamoDB mode',
                    });
                }
            } else if (body.groupIds && Array.isArray(body.groupIds)) {
                // Bulk group assignment (existing format - array of IDs)
                if (storageMode === 'dynamodb' && userManagement) {
                    const user = await userManagement.getUser(id);
                    if (!user) {
                        return res.status(HttpStatus.NOT_FOUND).json({
                            success: false,
                            error: 'User not found',
                        });
                    }

                    await userManagement.updateUser(id, {
                        assignedGroups: body.groupIds,
                    });

                    return res.status(HttpStatus.OK).json({
                        success: true,
                        message: 'Groups assigned successfully',
                        data: {
                            assignedGroups: body.groupIds.map(
                                (groupId: string) => ({
                                    id: groupId,
                                }),
                            ),
                        },
                    });
                } else {
                    const user = await users.getById(id);
                    if (!user) {
                        return res.status(HttpStatus.NOT_FOUND).json({
                            success: false,
                            error: 'User not found',
                        });
                    }

                    const updatedUser = await users.updateUser(id, {
                        assignedUserGroups: body.groupIds,
                    });

                    if (!updatedUser) {
                        return res.status(HttpStatus.NOT_FOUND).json({
                            success: false,
                            error: 'User not found',
                        });
                    }

                    return res.status(HttpStatus.OK).json({
                        success: true,
                        message: 'Groups assigned successfully',
                        data: {
                            assignedGroups: body.groupIds.map((id: number) => ({
                                id,
                                name: `Group ${id}`,
                            })),
                        },
                    });
                }
            } else if (body.groups && Array.isArray(body.groups)) {
                // New format: array of complete group objects (create-and-assign)
                if (storageMode === 'dynamodb' && userManagement) {
                    console.log(
                        `📦 Processing ${body.groups.length} group(s) for create-and-assign`,
                    );
                    console.log(
                        `📦 Groups received:`,
                        JSON.stringify(body.groups, null, 2),
                    );

                    const user = await userManagement.getUser(id);
                    if (!user) {
                        return res.status(HttpStatus.NOT_FOUND).json({
                            success: false,
                            error: 'User not found',
                        });
                    }

                    let groupIds: string[] = [];

                    // Get all existing groups to match by name
                    const allExistingGroups = await userManagement.listGroups();
                    console.log(
                        `📋 Found ${allExistingGroups.length} existing groups in database`,
                    );

                    // Process each group
                    const seenGroupIds = new Set<string>(); // Track unique group IDs
                    for (const groupData of body.groups) {
                        const groupName = groupData.groupName || groupData.name;
                        console.log(
                            `🔍 Processing group: "${groupName}" (frontend ID: ${groupData.id})`,
                        );

                        // Try to find group by NAME (not by frontend-generated ID)
                        let existingGroup = allExistingGroups.find(
                            (g) => g.name === groupName,
                        );

                        if (existingGroup) {
                            console.log(
                                `✅ Found existing group by name: "${groupName}" (DB ID: ${existingGroup.id})`,
                            );

                            // Skip if we've already processed this group ID (deduplication)
                            if (seenGroupIds.has(existingGroup.id)) {
                                console.log(
                                    `⚠️  Skipping duplicate group ID: ${existingGroup.id} (${groupName})`,
                                );
                                continue;
                            }
                            seenGroupIds.add(existingGroup.id);

                            // Get current group data from database to preserve correct values
                            const currentGroup = await userManagement.getGroup(
                                existingGroup.id,
                            );
                            if (!currentGroup) {
                                console.log(
                                    `⚠️  Could not fetch current group data, skipping update`,
                                );
                                groupIds.push(existingGroup.id);
                                continue;
                            }

                            // Only update fields that actually changed and are provided
                            const updates: any = {};
                            if (
                                groupData.name &&
                                groupData.name !== currentGroup.name
                            ) {
                                updates.name = groupData.name;
                            }
                            // Only update description if it's different and not empty
                            // Protect against overwriting with incorrect/stale data from frontend
                            if (
                                groupData.description !== undefined &&
                                groupData.description !== null &&
                                groupData.description.trim() !== '' &&
                                groupData.description !==
                                    currentGroup.description
                            ) {
                                console.log(
                                    `📝 Updating description: "${currentGroup.description}" -> "${groupData.description}"`,
                                );
                                updates.description = groupData.description;
                            } else if (
                                groupData.description !== undefined &&
                                groupData.description !==
                                    currentGroup.description
                            ) {
                                console.log(
                                    `⚠️  Skipping description update - empty or matches current value`,
                                );
                            }
                            if (
                                groupData.entity !== undefined &&
                                groupData.entity !== currentGroup.entity
                            ) {
                                updates.entity = groupData.entity;
                            }
                            if (
                                groupData.product !== undefined &&
                                groupData.product !== currentGroup.product
                            ) {
                                updates.product = groupData.product;
                            }
                            if (
                                groupData.service !== undefined &&
                                groupData.service !== currentGroup.service
                            ) {
                                updates.service = groupData.service;
                            }
                            if (groupData.assignedRoles !== undefined) {
                                updates.assignedRoles =
                                    groupData.assignedRoles || [];
                            }

                            // Only update if there are actual changes
                            if (Object.keys(updates).length > 0) {
                                console.log(
                                    `🔄 Updating group with changes:`,
                                    JSON.stringify(updates, null, 2),
                                );
                                await userManagement.updateGroup(
                                    existingGroup.id,
                                    updates,
                                );
                            } else {
                                console.log(
                                    `ℹ️  No changes detected, skipping update`,
                                );
                            }

                            groupIds.push(existingGroup.id);
                        } else {
                            console.log(
                                `🆕 Creating new group: "${groupName}"`,
                            );
                            // Create new group (let it generate its own ID)
                            const newGroup = await userManagement.createGroup({
                                name: groupName,
                                description: groupData.description || '',
                                entity: groupData.entity || '',
                                product: groupData.product || '',
                                service: groupData.service || '',
                                assignedRoles: groupData.assignedRoles || [],
                            });
                            console.log(
                                `✅ Created new group with ID: ${newGroup.id}`,
                            );

                            // Skip if duplicate
                            if (seenGroupIds.has(newGroup.id)) {
                                console.log(
                                    `⚠️  Skipping duplicate newly created group ID: ${newGroup.id}`,
                                );
                                continue;
                            }
                            seenGroupIds.add(newGroup.id);
                            groupIds.push(newGroup.id);
                        }
                    }

                    // Deduplicate final group IDs array
                    const uniqueGroupIds = Array.from(new Set(groupIds));
                    if (uniqueGroupIds.length !== groupIds.length) {
                        console.log(
                            `⚠️  Removed ${
                                groupIds.length - uniqueGroupIds.length
                            } duplicate group ID(s)`,
                        );
                        console.log(`   Before: ${JSON.stringify(groupIds)}`);
                        console.log(
                            `   After:  ${JSON.stringify(uniqueGroupIds)}`,
                        );
                    }
                    groupIds = uniqueGroupIds;

                    console.log(
                        `📋 Final group IDs to assign: ${JSON.stringify(
                            groupIds,
                        )}`,
                    );

                    // Assign all groups to user
                    await userManagement.updateUser(id, {
                        assignedGroups: groupIds,
                    });

                    console.log(
                        `✅ Assigned ${groupIds.length} unique group(s) to user ${id}`,
                    );

                    return res.status(HttpStatus.OK).json({
                        success: true,
                        message: 'Groups assigned successfully',
                        data: {
                            assignedGroups: groupIds.map((groupId: string) => ({
                                id: groupId,
                            })),
                        },
                    });
                } else {
                    return res.status(HttpStatus.BAD_REQUEST).json({
                        success: false,
                        error: 'Create-and-assign only supported in DynamoDB mode',
                    });
                }
            } else {
                console.error('❌ Invalid request body format:', body);
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Either groupId (string), groupIds (array), or groups (array of objects) is required',
                });
            }
        } catch (error: any) {
            console.error('Error assigning group(s) to user:', error);
            console.error('Error stack:', error.stack);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to assign group(s) to user',
                details: error.message,
            });
        }
    }

    // Alternative endpoint name for frontend compatibility
    @Post(':id/assign-groups')
    async assignGroupsAlternative(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        // Delegate to the main implementation
        return this.assignGroupToUser(id, body, res);
    }

    @Delete(':id/groups')
    async removeGroupsFromUser(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            if (!body.groupIds || !Array.isArray(body.groupIds)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'groupIds array is required',
                });
            }

            // Remove specified groups from user's assigned groups
            const currentGroups = user.assignedUserGroups || [];
            const updatedGroups = currentGroups.filter(
                (groupId) => !body.groupIds.includes(groupId),
            );

            const updatedUser = await users.updateUser(id, {
                assignedUserGroups: updatedGroups,
            });

            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Groups removed successfully',
            });
        } catch (error: any) {
            console.error('Error removing groups from user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to remove groups from user',
            });
        }
    }

    @Get(':id/groups')
    async getUserGroups(@Param('id') id: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const user = await userManagement.getUser(id);
                if (!user) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'User not found',
                    });
                }

                // Note: This is in /api/users/:id/groups (not /api/user-management/users/:id/groups)
                // For backward compatibility, only check Systiva table
                const groups = await userManagement.getUserGroups(id);
                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {
                        groups,
                    },
                });
            } else {
                const user = await users.getById(id);
                if (!user) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'User not found',
                    });
                }

                // Mock group data - in real implementation, you'd fetch from group service
                const groups = (user.assignedUserGroups || []).map(
                    (groupId) => ({
                        id: groupId,
                        name: `Group ${groupId}`,
                        description: `Description for Group ${groupId}`,
                        assignedAt: user.createdAt,
                        assignedBy: 'system',
                    }),
                );

                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {
                        groups,
                    },
                });
            }
        } catch (error: any) {
            console.error('Error getting user groups:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get user groups',
            });
        }
    }

    @Post(':id/groups')
    async assignUserToGroup(
        @Param('id') userId: string,
        @Body() body: {groupId: string},
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const user = await userManagement.getUser(userId);
                if (!user) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'User not found',
                    });
                }

                const currentGroups = user.assignedGroups || [];
                if (!currentGroups.includes(body.groupId)) {
                    await userManagement.updateUser(userId, {
                        assignedGroups: [...currentGroups, body.groupId],
                    });
                }

                return res.status(HttpStatus.CREATED).json({
                    success: true,
                    message: 'User assigned to group successfully',
                });
            } else {
                // Legacy implementation would go here
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'User-group assignment not implemented for this storage mode',
                });
            }
        } catch (error: any) {
            console.error('Error assigning user to group:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to assign user to group',
            });
        }
    }

    @Delete(':id/groups/:groupId')
    async removeUserFromGroup(
        @Param('id') userId: string,
        @Param('groupId') groupId: string,
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const user = await userManagement.getUser(userId);
                if (!user) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'User not found',
                    });
                }

                const currentGroups = user.assignedGroups || [];
                const updatedGroups = currentGroups.filter(
                    (g) => g !== groupId,
                );
                await userManagement.updateUser(userId, {
                    assignedGroups: updatedGroups,
                });

                return res.status(HttpStatus.NO_CONTENT).send();
            } else {
                // Legacy implementation would go here
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'User-group removal not implemented for this storage mode',
                });
            }
        } catch (error: any) {
            console.error('Error removing user from group:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to remove user from group',
            });
        }
    }

    // User Statistics
    @Get('stats')
    async getUserStats(@Res() res: any) {
        try {
            const stats = await users.getStats();

            return res.status(HttpStatus.OK).json({
                success: true,
                data: stats,
            });
        } catch (error: any) {
            console.error('Error getting user stats:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get user statistics',
            });
        }
    }

    // Import/Export (Basic implementation)
    @Post('import')
    async importUsers(@Body() body: any, @Res() res: any) {
        try {
            // Basic CSV-like import simulation
            if (!body.users || !Array.isArray(body.users)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'users array is required for import',
                });
            }

            const result = await users.bulkCreate(body.users);

            return res.status(HttpStatus.OK).json({
                success: true,
                message: `Import completed: ${result.created.length} users created`,
                data: {
                    imported: result.created.length,
                    errors: result.errors.length,
                    details: {
                        created: result.created.map((u: any) => ({
                            id: u.id,
                            emailAddress: u.emailAddress,
                        })),
                        errors: result.errors,
                    },
                },
            });
        } catch (error: any) {
            console.error('Error importing users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to import users',
            });
        }
    }

    // Debug endpoint to check storage mode and database connection
    @Get('debug/info')
    async debugInfo(@Res() res: any) {
        try {
            const storageMode = process.env.STORAGE_MODE || 'filesystem';
            const schema = process.env.PGSCHEMA || 'systiva';
            const response: any = {
                storageMode,
                environment: process.env.NODE_ENV,
                schema,
                pgConfig: {
                    host: process.env.PGHOST,
                    port: process.env.PGPORT,
                    database: process.env.PGDATABASE,
                    user: process.env.PGUSER,
                },
            };

            if (storageMode === 'postgres') {
                try {
                    // Check database tables and data
                    const dbData = await withPg(async (c) => {
                        const tables = await c.query(
                            `
                            SELECT table_name
                            FROM information_schema.tables
                            WHERE table_schema = $1
                            ORDER BY table_name
                        `,
                            [schema],
                        );

                        const userTables = tables.rows.filter(
                            (row: any) =>
                                row.table_name.includes('user') ||
                                row.table_name.includes('fnd_user'),
                        );

                        const result: any = {
                            allTables: tables.rows.map(
                                (r: any) => r.table_name,
                            ),
                            userTables: userTables.map(
                                (r: any) => r.table_name,
                            ),
                            tableCounts: {},
                        };

                        // Check counts for user-related tables
                        for (const table of userTables) {
                            try {
                                const countRes = await c.query(
                                    `SELECT COUNT(*) FROM ${schema}.${table.table_name}`,
                                );
                                result.tableCounts[table.table_name] = parseInt(
                                    countRes.rows[0].count,
                                );
                            } catch (err) {
                                result.tableCounts[
                                    table.table_name
                                ] = `Error: ${
                                    err instanceof Error
                                        ? err.message
                                        : 'Unknown'
                                }`;
                            }
                        }

                        // Also check if fnd_users table exists and its structure
                        try {
                            const fndUsersStructure = await c.query(
                                `
                                SELECT column_name, data_type
                                FROM information_schema.columns
                                WHERE table_schema = $1 AND table_name = 'fnd_users'
                                ORDER BY ordinal_position
                            `,
                                [schema],
                            );
                            result.fnd_users_structure = fndUsersStructure.rows;

                            // Check constraints
                            const constraints = await c.query(
                                `
                                SELECT constraint_name, check_clause
                                FROM information_schema.check_constraints
                                WHERE constraint_schema = $1
                                AND constraint_name LIKE '%fnd_users%'
                            `,
                                [schema],
                            );
                            result.fnd_users_constraints = constraints.rows;
                        } catch (err) {
                            result.fnd_users_structure = 'Table does not exist';
                        }

                        return result;
                    });

                    response.postgresConnection = 'success';
                    response.database = dbData;

                    // Test user count with our method
                    const result = await users.listUsers({limit: 1});
                    response.apiUserCount = result.pagination.totalUsers;
                } catch (error) {
                    response.postgresConnection = 'failed';
                    response.postgresError =
                        error instanceof Error
                            ? error.message
                            : 'Unknown error';
                }
            } else {
                // No file storage - database only
                response.storageNote =
                    'Database storage only - no filesystem fallback';
            }

            return res.json(response);
        } catch (error: any) {
            return res.status(500).json({
                error: 'Debug info failed',
                message: error.message,
            });
        }
    }

    @Get('export')
    async exportUsers(
        @Res() res: any,
        @Query('format') format?: string,
        @Query('includeGroups') includeGroups?: string,
        @Query('status') status?: 'Active' | 'Inactive',
    ) {
        try {
            const query = status
                ? {
                      status: (status === 'Active' ? 'ACTIVE' : 'INACTIVE') as
                          | 'ACTIVE'
                          | 'INACTIVE',
                  }
                : {};
            const result = await users.listUsers(query);

            // Remove passwords from export
            const exportData = result.users.map((user) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            const exportFormat = format || 'json';

            if (exportFormat === 'csv') {
                // Basic CSV generation (would need proper CSV library in real implementation)
                const headers = [
                    'id',
                    'firstName',
                    'lastName',
                    'emailAddress',
                    'status',
                    'technicalUser',
                    'createdAt',
                ];
                const csvData = [
                    headers.join(','),
                    ...exportData.map((user) =>
                        headers.map((h) => (user as any)[h] || '').join(','),
                    ),
                ].join('\n');

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader(
                    'Content-Disposition',
                    'attachment; filename=users.csv',
                );
                return res.send(csvData);
            }

            // Default JSON export
            res.setHeader('Content-Type', 'application/json');
            res.setHeader(
                'Content-Disposition',
                'attachment; filename=users.json',
            );
            return res.json({
                success: true,
                data: {
                    users: exportData,
                    exportedAt: new Date().toISOString(),
                    totalCount: result.pagination.totalUsers,
                },
            });
        } catch (error: any) {
            console.error('Error exporting users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to export users',
            });
        }
    }
}

@Controller('api/user-groups')
class UserGroupsController {
    // Legacy endpoints for backward compatibility
    @Get(':username')
    async list(@Param('username') username: string) {
        return await userGroups.list(username);
    }

    @Post(':username')
    async create(
        @Param('username') username: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        // ensure group exists (create-and-assign)
        let grp = groups.findByName(body?.name);
        if (!grp) {
            grp = groups.create({
                name: body?.name,
                description: body?.description,
            });
        }
        const record = await userGroups.create(username, {
            id: grp.id,
            name: grp.name,
            description: grp.description,
            enterprise: body?.enterprise,
        });
        const resp = {
            id: record.id,
            name: record.name,
            description: record.description,
        };
        return res.status(HttpStatus.CREATED).json(resp);
    }

    @Delete(':username/:id')
    async remove(@Param('id') id: string, @Res() res: any) {
        await userGroups.remove(id);
        return res.status(HttpStatus.NO_CONTENT).send();
    }

    // Debug endpoint to check table structure
    @Get('debug/structure')
    async debugTableStructure() {
        return await userGroups.debugTableStructure();
    }

    // New Access Control User Groups Management APIs
    @Get()
    async listUserGroups(
        @Query('accountId') accountId?: string,
        @Query('enterpriseId') enterpriseId?: string,
    ) {
        return await userGroups.listUserGroups(accountId, enterpriseId);
    }

    @Post()
    async createUserGroup(@Body() body: any, @Res() res: any) {
        try {
            const userGroup = await userGroups.createUserGroup(body);
            return res.status(HttpStatus.CREATED).json(userGroup);
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Get(':id')
    async getUserGroup(@Param('id') id: string, @Res() res: any) {
        try {
            const userGroup = await userGroups.getUserGroup(id);
            if (!userGroup) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User group not found'});
            }
            return res.json(userGroup);
        } catch (error: any) {
            console.error('Error in getUserGroup endpoint:', error.message);
            console.error('Stack trace:', error.stack);
            return res
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .json({error: `getUserGroup error: ${error.message}`});
        }
    }

    @Put(':id')
    async updateUserGroup(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const updated = await userGroups.updateUserGroup(id, body);
            if (!updated) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User group not found'});
            }
            return res.json(updated);
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Delete(':id')
    async deleteUserGroup(@Param('id') id: string, @Res() res: any) {
        try {
            await userGroups.deleteUserGroup(id);
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Get('search')
    async searchUserGroups(
        @Query('q') searchTerm: string,
        @Query('accountId') accountId?: string,
        @Query('enterpriseId') enterpriseId?: string,
    ) {
        if (!searchTerm) {
            return await userGroups.listUserGroups(accountId, enterpriseId);
        }
        return await userGroups.searchUserGroups(
            searchTerm,
            accountId,
            enterpriseId,
        );
    }

    // Role assignment endpoints
    @Post(':groupId/roles')
    async assignRoleToGroup(
        @Param('groupId') groupId: string,
        @Body() body: {roleId: string; roleName?: string},
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const group = await userManagement.getGroup(groupId);
                if (!group) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'Group not found',
                    });
                }

                const currentRoles = group.assignedRoles || [];
                if (!currentRoles.includes(body.roleId)) {
                    await userManagement.updateGroup(groupId, {
                        assignedRoles: [...currentRoles, body.roleId],
                    });
                }

                return res.status(HttpStatus.CREATED).json({
                    success: true,
                    message: 'Role assigned to group successfully',
                });
            } else {
                const assignment = await roles.assignRoleToGroup(
                    groupId,
                    body.roleId,
                    body.roleName || '',
                );
                return res.status(HttpStatus.CREATED).json(assignment);
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Delete(':groupId/roles/:roleId')
    async removeRoleFromGroup(
        @Param('groupId') groupId: string,
        @Param('roleId') roleId: string,
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const group = await userManagement.getGroup(groupId);
                if (!group) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'Group not found',
                    });
                }

                const currentRoles = group.assignedRoles || [];
                const updatedRoles = currentRoles.filter((r) => r !== roleId);
                await userManagement.updateGroup(groupId, {
                    assignedRoles: updatedRoles,
                });
            } else {
                await roles.removeRoleFromGroup(groupId, roleId);
            }
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Get(':groupId/roles')
    async getGroupRoles(@Param('groupId') groupId: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const groupRoles = await userManagement.getGroupRoles(groupId);
                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {roles: groupRoles},
                });
            } else {
                const groupRoles = await roles.getRolesForGroup(groupId);
                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {roles: groupRoles},
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .json({error: error.message});
        }
    }

    @Get(':groupId/users')
    async getGroupUsers(@Param('groupId') groupId: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                // Get all users and filter by assigned groups
                const allUsers = await userManagement.listUsers();
                const groupUsers = allUsers.filter(
                    (user) =>
                        user.assignedGroups &&
                        user.assignedGroups.includes(groupId),
                );
                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {users: groupUsers},
                });
            } else {
                // Legacy implementation would need to be added here
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'Group users listing not implemented for this storage mode',
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .json({error: error.message});
        }
    }

    // Test data seeding endpoint
    @Post('seed-test-data')
    async seedTestData(@Res() res: any) {
        if (storageMode !== 'dynamodb' || !AccessControl_Service) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                error: 'Test data seeding only available in DynamoDB mode',
            });
        }

        try {
            console.log('🌱 Starting to seed test data...');

            // Test groups
            const testGroups = [
                {
                    name: 'Administrators',
                    description: 'System administrators with full access',
                },
                {name: 'HR Team', description: 'Human Resources team members'},
                {
                    name: 'Finance Team',
                    description: 'Finance and accounting team members',
                },
                {
                    name: 'IT Support',
                    description: 'Technical support team members',
                },
                {
                    name: 'Sales Team',
                    description: 'Sales and marketing team members',
                },
                {
                    name: 'Project Managers',
                    description: 'Project management team',
                },
            ];

            // Test roles
            const testRoles = [
                {
                    name: 'Super Admin',
                    description: 'Full system access and control',
                    permissions: ['*'],
                },
                {
                    name: 'User Manager',
                    description: 'Can manage users and groups',
                    permissions: [
                        'users:read',
                        'users:write',
                        'groups:read',
                        'groups:write',
                    ],
                },
                {
                    name: 'HR Manager',
                    description: 'Human resources management permissions',
                    permissions: [
                        'users:read',
                        'users:write',
                        'reports:hr',
                        'payroll:read',
                    ],
                },
                {
                    name: 'Finance Manager',
                    description: 'Financial data and reporting access',
                    permissions: [
                        'finance:read',
                        'finance:write',
                        'reports:finance',
                        'budgets:manage',
                    ],
                },
                {
                    name: 'Read Only',
                    description: 'View-only access to most resources',
                    permissions: ['users:read', 'groups:read', 'reports:read'],
                },
                {
                    name: 'Support Agent',
                    description: 'Customer support and ticket management',
                    permissions: [
                        'tickets:read',
                        'tickets:write',
                        'customers:read',
                        'knowledge:read',
                    ],
                },
            ];

            // Test services
            const testServices = [
                {
                    name: 'User Management',
                    description: 'User account and profile management service',
                },
                {
                    name: 'Financial Reporting',
                    description: 'Financial data and reporting service',
                },
                {
                    name: 'HR Portal',
                    description: 'Human resources management portal',
                },
                {
                    name: 'Project Tracking',
                    description: 'Project management and tracking system',
                },
                {
                    name: 'Customer Support',
                    description: 'Customer service and support system',
                },
                {
                    name: 'Analytics Dashboard',
                    description: 'Business intelligence and analytics',
                },
            ];

            const createdGroups = [];
            const createdRoles = [];
            const createdServices = [];

            // Create groups
            console.log('📋 Creating test user groups...');
            for (const groupData of testGroups) {
                const group = await AccessControl_Service.createGroup(
                    groupData,
                );
                createdGroups.push(group);
                console.log(`✅ Created group: ${group.name}`);
            }

            // Create roles
            console.log('🎭 Creating test roles...');
            for (const roleData of testRoles) {
                const role = await AccessControl_Service.createRole(roleData);
                createdRoles.push(role);
                console.log(`✅ Created role: ${role.name}`);
            }

            // Create services
            console.log('🔧 Creating test services...');
            for (const serviceData of testServices) {
                const service = await AccessControl_Service.createService(
                    serviceData,
                );
                createdServices.push(service);
                console.log(`✅ Created service: ${service.name}`);
            }

            // Create role-group assignments
            console.log('🔗 Creating role-group assignments...');
            const roleAssignments = [
                {groupName: 'Administrators', roleName: 'Super Admin'},
                {groupName: 'HR Team', roleName: 'HR Manager'},
                {groupName: 'Finance Team', roleName: 'Finance Manager'},
                {groupName: 'IT Support', roleName: 'Support Agent'},
                {groupName: 'Sales Team', roleName: 'Read Only'},
                {groupName: 'Project Managers', roleName: 'User Manager'},
            ];

            for (const assignment of roleAssignments) {
                const group = createdGroups.find(
                    (g) => g.name === assignment.groupName,
                );
                const role = createdRoles.find(
                    (r) => r.name === assignment.roleName,
                );

                if (group && role) {
                    await AccessControl_Service.assignRoleToGroup(
                        group.id,
                        role.id,
                    );
                    console.log(
                        `✅ Assigned role "${role.name}" to group "${group.name}"`,
                    );
                }
            }

            // Create service-group assignments
            console.log('🔗 Creating service-group assignments...');
            const serviceAssignments = [
                {groupName: 'Administrators', serviceName: 'User Management'},
                {
                    groupName: 'Administrators',
                    serviceName: 'Analytics Dashboard',
                },
                {groupName: 'HR Team', serviceName: 'HR Portal'},
                {groupName: 'HR Team', serviceName: 'User Management'},
                {groupName: 'Finance Team', serviceName: 'Financial Reporting'},
                {groupName: 'Finance Team', serviceName: 'Analytics Dashboard'},
                {groupName: 'IT Support', serviceName: 'Customer Support'},
                {groupName: 'IT Support', serviceName: 'User Management'},
                {
                    groupName: 'Project Managers',
                    serviceName: 'Project Tracking',
                },
                {
                    groupName: 'Project Managers',
                    serviceName: 'Analytics Dashboard',
                },
            ];

            for (const assignment of serviceAssignments) {
                const group = createdGroups.find(
                    (g) => g.name === assignment.groupName,
                );
                const service = createdServices.find(
                    (s) => s.name === assignment.serviceName,
                );

                if (group && service) {
                    await AccessControl_Service.assignServiceToGroup(
                        group.id,
                        service.id,
                    );
                    console.log(
                        `✅ Assigned service "${service.name}" to group "${group.name}"`,
                    );
                }
            }

            console.log('🎉 Test data seeding completed successfully!');

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Test data seeded successfully',
                summary: {
                    groups: createdGroups.length,
                    roles: createdRoles.length,
                    services: createdServices.length,
                    roleAssignments: roleAssignments.length,
                    serviceAssignments: serviceAssignments.length,
                },
                data: {
                    groups: createdGroups,
                    roles: createdRoles,
                    services: createdServices,
                },
            });
        } catch (error: any) {
            console.error('❌ Error seeding test data:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to seed test data',
                details: error.message,
            });
        }
    }
}

@Controller('api/roles')
class RolesController {
    @Get()
    async list(
        @Query('groupId') groupId?: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        console.log('📋 listRoles API called with:', {
            groupId,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        });

        if (storageMode === 'dynamodb' && userManagement) {
            if (groupId) {
                return await userManagement.getGroupRoles(groupId);
            }

            // Determine if this is a Systiva account request
            const isSystivaAccount =
                !accountId ||
                accountId === '' ||
                !accountName ||
                accountName === '' ||
                accountName.toLowerCase() === 'systiva';

            // Determine if this is a Global enterprise request
            const isGlobalEnterprise =
                !enterpriseId ||
                enterpriseId === '' ||
                !enterpriseName ||
                enterpriseName === '' ||
                enterpriseName.toLowerCase() === 'global';

            console.log('📋 Filter check:', {
                isSystivaAccount,
                isGlobalEnterprise,
            });

            let roles;
            if (isSystivaAccount) {
                console.log('📋 Calling listRoles() for Systiva');
                roles = await userManagement.listRoles();
            } else {
                console.log(
                    `📋 Calling listRolesByAccount() for ${accountName}`,
                );
                roles = await userManagement.listRolesByAccount(
                    accountId,
                    accountName,
                );
            }

            // Filter by enterprise if not Global
            if (!isGlobalEnterprise && roles) {
                roles = roles.filter(
                    (role: any) =>
                        !role.enterpriseId ||
                        role.enterpriseId === enterpriseId ||
                        role.enterpriseName?.toLowerCase() ===
                            enterpriseName?.toLowerCase(),
                );
            }

            return roles;
        } else {
            if (groupId) {
                return await roles.getRolesForGroup(groupId);
            }
            return await roles.list();
        }
    }

    @Get(':id')
    async get(@Param('id') id: string, @Res() res: any) {
        if (storageMode === 'dynamodb' && userManagement) {
            const role = await userManagement.getRole(id);
            if (!role) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'Role not found'});
            }
            return res.json(role);
        } else {
            const role = await roles.get(id);
            if (!role) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'Role not found'});
            }
            return res.json(role);
        }
    }

    @Post()
    async create(@Body() body: any, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const role = await userManagement.createRole({
                    name: body.name,
                    description: body.description,
                    scopeConfig: body.scopeConfig,
                });
                return res.status(HttpStatus.CREATED).json(role);
            } else {
                const role = await roles.create(body);
                return res.status(HttpStatus.CREATED).json(role);
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const updated = await userManagement.updateRole(id, body);
                if (!updated) {
                    return res
                        .status(HttpStatus.NOT_FOUND)
                        .json({error: 'Role not found'});
                }
                return res.json(updated);
            } else {
                const updated = await roles.update(id, body);
                if (!updated) {
                    return res
                        .status(HttpStatus.NOT_FOUND)
                        .json({error: 'Role not found'});
                }
                return res.json(updated);
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Delete(':id')
    async delete(@Param('id') id: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                await userManagement.deleteRole(id);
            } else {
                await roles.delete(id);
            }
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Get('search')
    async searchRoles(
        @Query('q') searchTerm: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
    ) {
        if (!searchTerm) {
            return await this.list(undefined, accountId, accountName);
        }

        if (storageMode === 'dynamodb' && userManagement) {
            const allRoles =
                accountId && accountName
                    ? await userManagement.listRolesByAccount(
                          accountId,
                          accountName,
                      )
                    : await userManagement.listRoles();

            const filtered = allRoles.filter(
                (role: any) =>
                    role.name
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                    role.description
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()),
            );
            return filtered;
        } else {
            const allRoles = await roles.list();
            const filtered = allRoles.filter(
                (role: any) =>
                    role.name
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                    role.description
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()),
            );
            return filtered;
        }
    }

    @Get(':roleId/groups')
    async getRoleGroups(@Param('roleId') roleId: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                // Get all groups and filter by assigned roles
                const allGroups = await userManagement.listGroups();
                const roleGroups = allGroups.filter(
                    (group) =>
                        group.assignedRoles &&
                        group.assignedRoles.includes(roleId),
                );
                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {groups: roleGroups},
                });
            } else {
                // Legacy implementation would need to be added here
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'Role groups listing not implemented for this storage mode',
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .json({error: error.message});
        }
    }

    @Get(':roleId/users')
    async getRoleUsers(@Param('roleId') roleId: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                // Get all users and filter by roles through their assigned groups
                const allUsers = await userManagement.listUsers();
                const allGroups = await userManagement.listGroups();

                // Find groups that have this role
                const groupsWithRole = allGroups.filter(
                    (group) =>
                        group.assignedRoles &&
                        group.assignedRoles.includes(roleId),
                );
                const groupIds = groupsWithRole.map((g) => g.id);

                // Find users that belong to those groups
                const roleUsers = allUsers.filter(
                    (user) =>
                        user.assignedGroups &&
                        user.assignedGroups.some((gId: string) =>
                            groupIds.includes(gId),
                        ),
                );

                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {users: roleUsers},
                });
            } else {
                // Legacy implementation
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'Role users listing not implemented for this storage mode',
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .json({error: error.message});
        }
    }

    @Post(':roleId/groups')
    async assignGroupToRole(
        @Param('roleId') roleId: string,
        @Body() body: {groupId: string; groupName?: string},
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const role = await userManagement.getRole(roleId);
                if (!role) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'Role not found',
                    });
                }

                const group = await userManagement.getGroup(body.groupId);
                if (!group) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'Group not found',
                    });
                }

                const currentRoles = group.assignedRoles || [];
                if (!currentRoles.includes(roleId)) {
                    await userManagement.updateGroup(body.groupId, {
                        assignedRoles: [...currentRoles, roleId],
                    });
                }

                return res.status(HttpStatus.CREATED).json({
                    success: true,
                    message: 'Group assigned to role successfully',
                });
            } else {
                const assignment = await roles.assignRoleToGroup(
                    body.groupId,
                    roleId,
                    body.groupName || '',
                );
                return res.status(HttpStatus.CREATED).json(assignment);
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Delete(':roleId/groups/:groupId')
    async removeGroupFromRole(
        @Param('roleId') roleId: string,
        @Param('groupId') groupId: string,
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const group = await userManagement.getGroup(groupId);
                if (!group) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'Group not found',
                    });
                }

                const currentRoles = group.assignedRoles || [];
                const updatedRoles = currentRoles.filter((r) => r !== roleId);
                await userManagement.updateGroup(groupId, {
                    assignedRoles: updatedRoles,
                });

                return res.status(HttpStatus.NO_CONTENT).send();
            } else {
                await roles.removeRoleFromGroup(groupId, roleId);
                return res.status(HttpStatus.NO_CONTENT).send();
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    // Scope Configuration endpoints
    @Get(':id/scope')
    async getRoleScope(@Param('id') id: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && userManagement) {
                const role = await userManagement.getRole(id);
                if (!role) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'Role not found',
                    });
                }
                const scopeConfig = role.scopeConfig || {};
                return res.json(scopeConfig);
            } else {
                // For file-based storage, we can extend the roles service later
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'Scope configuration only available with DynamoDB storage',
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Put(':id/scope')
    async updateRoleScope(
        @Param('id') id: string,
        @Body() scopeConfig: any,
        @Res() res: any,
    ) {
        try {
            console.log('🔄 Received scope update request for role:', id);

            if (storageMode === 'dynamodb' && userManagement) {
                // Validate the scope configuration structure
                const validatedConfig = {
                    accountSettings: scopeConfig.accountSettings || [],
                    accessControl: scopeConfig.accessControl || [],
                    securityGovernance: scopeConfig.securityGovernance || [],
                    pipelines: scopeConfig.pipelines || [],
                    builds: scopeConfig.builds || [],
                    configured: true,
                    createdAt:
                        scopeConfig.createdAt || new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };

                const updatedRole = await userManagement.updateRole(id, {
                    scopeConfig: validatedConfig,
                });

                if (!updatedRole) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'Role not found',
                    });
                }

                return res.json({
                    success: true,
                    message: 'Scope configuration updated successfully',
                    role: updatedRole,
                });
            } else {
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'Scope configuration only available with DynamoDB storage',
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }
}

@Controller('api/attributes')
class AttributesController {
    @Get()
    async list(@Query('roleId') roleId?: string) {
        if (roleId) {
            return await attributes.getAttributesForRole(roleId);
        }
        return await attributes.list();
    }

    @Get(':id')
    async get(@Param('id') id: string, @Res() res: any) {
        const attribute = await attributes.get(id);
        if (!attribute) {
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'Attribute not found'});
        }
        return res.json(attribute);
    }

    @Post()
    async create(@Body() body: any, @Res() res: any) {
        try {
            const attribute = await attributes.create(body);
            return res.status(HttpStatus.CREATED).json(attribute);
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any, @Res() res: any) {
        try {
            const updated = await attributes.update(id, body);
            if (!updated) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'Attribute not found'});
            }
            return res.json(updated);
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Delete(':id')
    async delete(@Param('id') id: string, @Res() res: any) {
        try {
            await attributes.delete(id);
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Put('roles/:roleId')
    async updateRoleAttributes(
        @Param('roleId') roleId: string,
        @Body() body: {attributes: any[]},
        @Res() res: any,
    ) {
        try {
            await attributes.updateRoleAttributes(roleId, body.attributes);
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }
}

@Controller('api/breadcrumb')
class BreadcrumbController {
    @Get('context')
    async getContext() {
        // Return mock context data - in a real implementation, this would come from session/auth
        return {
            accountId: '3',
            enterpriseId: '1',
            accountName: 'Default Account',
            enterpriseName: 'Default Enterprise',
        };
    }
}

@Controller('api/groups')
class GroupsController {
    @Get()
    async list(
        @Query('search') search?: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode === 'dynamodb' && userManagement) {
            let allGroups = await userManagement.listGroups();

            // Filter by account if provided (skip for Systiva)
            const isSystivaAccount =
                !accountId ||
                accountId === '' ||
                !accountName ||
                accountName === '' ||
                accountName.toLowerCase() === 'systiva';

            if (!isSystivaAccount) {
                allGroups = allGroups.filter(
                    (group: any) =>
                        !group.accountId ||
                        group.accountId === accountId ||
                        group.accountName?.toLowerCase() ===
                            accountName?.toLowerCase(),
                );
            }

            // Filter by enterprise if provided (skip for Global)
            const isGlobalEnterprise =
                !enterpriseId ||
                enterpriseId === '' ||
                !enterpriseName ||
                enterpriseName === '' ||
                enterpriseName.toLowerCase() === 'global';

            if (!isGlobalEnterprise) {
                allGroups = allGroups.filter(
                    (group: any) =>
                        !group.enterpriseId ||
                        group.enterpriseId === enterpriseId ||
                        group.enterpriseName?.toLowerCase() ===
                            enterpriseName?.toLowerCase() ||
                        group.entity?.toLowerCase() ===
                            enterpriseName?.toLowerCase(),
                );
            }

            // Apply search filter
            if (search) {
                const searchLower = search.toLowerCase();
                allGroups = allGroups.filter(
                    (group: any) =>
                        group.name.toLowerCase().includes(searchLower) ||
                        (group.description &&
                            group.description
                                .toLowerCase()
                                .includes(searchLower)),
                );
            }

            return allGroups;
        } else {
            return groups.list(search);
        }
    }

    @Post()
    async create(@Body() body: any, @Res() res: any) {
        if (storageMode === 'dynamodb' && userManagement) {
            const created = await userManagement.createGroup({
                name: body?.name,
                description: body?.description,
                entity: body?.entity,
                product: body?.product,
                service: body?.service,
                assignedRoles: body?.assignedRoles,
            });
            return res.status(HttpStatus.CREATED).json(created);
        } else {
            const created = groups.create({
                name: body?.name,
                description: body?.description,
            });
            return res.status(HttpStatus.CREATED).json(created);
        }
    }
}

@Controller('api/ai')
class AiController {
    @Get('insights')
    insights() {
        return [
            {
                title: 'Flaky test suite detection',
                body: 'AI detected instability in “Checkout E2E”. Retries rose by 24% this week. Consider quarantining the suite and enabling test impact analysis.',
                severity: 'warning',
            },
            {
                title: 'Pipeline optimization',
                body: 'Cache hit rate for Docker layers improved to 78%. Enabling layer pinning could reduce build time by another 10-15%.',
                severity: 'info',
            },
            {
                title: 'Deployment reliability',
                body: 'Blue/green deployments reached 99.2% success. Canary window extension by 5 minutes could cut rollbacks by ~8%.',
                severity: 'success',
            },
        ];
    }

    @Get('trends/builds')
    builds() {
        return [
            {label: 'Mon', value: 12},
            {label: 'Tue', value: 17},
            {label: 'Wed', value: 9},
            {label: 'Thu', value: 21},
            {label: 'Fri', value: 14},
            {label: 'Sat', value: 8},
            {label: 'Sun', value: 11},
        ];
    }
}

// removed products/services catalog and geo endpoints to original

@Controller('api/geo')
class GeoController {
    @Get('countries')
    countries() {
        return Object.keys(GEO_DATA);
    }

    @Get('states')
    states(@Query('country') country?: string) {
        if (!country) return [] as string[];
        return Object.keys(GEO_DATA[country] || {});
    }

    @Get('cities')
    cities(@Query('country') country?: string, @Query('state') state?: string) {
        if (!country || !state) return [] as string[];
        return (GEO_DATA[country]?.[state] || []) as string[];
    }
}

@Controller('api/builds/integrations')
class BuildsController {
    @Get()
    async list(
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
        @Query('enterpriseId') enterpriseId?: string,
    ) {
        try {
            if (!accountId || !accountName) {
                throw new Error('accountId and accountName are required');
            }

            if (storageMode === 'dynamodb' && buildsDynamoDB) {
                return await buildsDynamoDB.list(
                    accountId,
                    accountName,
                    enterpriseId,
                );
            }

            return [];
        } catch (error: any) {
            console.error('Error listing builds:', error);
            throw error;
        }
    }

    @Get(':buildId')
    async get(
        @Param('buildId') buildId: string,
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
    ) {
        try {
            if (!accountId || !accountName) {
                throw new Error('accountId and accountName are required');
            }

            if (storageMode === 'dynamodb' && buildsDynamoDB) {
                return await buildsDynamoDB.get(
                    accountId,
                    accountName,
                    buildId,
                );
            }

            return null;
        } catch (error: any) {
            console.error('Error getting build:', error);
            throw error;
        }
    }

    @Post()
    async create(@Body() body: any) {
        try {
            console.log('Creating build with body:', body);

            if (!body.accountId || !body.accountName) {
                throw new Error('accountId and accountName are required');
            }

            if (!body.buildName) {
                throw new Error('buildName is required');
            }

            const buildData = {
                buildName: body.buildName,
                description: body.description || '',
                entity: body.entity || '',
                pipeline: body.pipeline || '',
                status: body.status || '',
                artifact: body.artifact || '',
                build: body.build || '',
                accountId: body.accountId,
                accountName: body.accountName,
                enterpriseId: body.enterpriseId,
                enterpriseName: body.enterpriseName,
                stages: body.stages || [],
            };

            if (storageMode === 'dynamodb' && buildsDynamoDB) {
                return await buildsDynamoDB.create(buildData);
            }

            throw new Error('DynamoDB storage not available');
        } catch (error: any) {
            console.error('Error creating build:', error);
            throw error;
        }
    }

    @Put(':buildId')
    async update(@Param('buildId') buildId: string, @Body() body: any) {
        try {
            console.log(`Updating build ${buildId}:`, body);

            if (!body.accountId || !body.accountName) {
                throw new Error('accountId and accountName are required');
            }

            if (storageMode === 'dynamodb' && buildsDynamoDB) {
                return await buildsDynamoDB.update(
                    body.accountId,
                    body.accountName,
                    buildId,
                    body,
                );
            }

            throw new Error('DynamoDB storage not available');
        } catch (error: any) {
            console.error('Error updating build:', error);
            throw error;
        }
    }

    @Delete(':buildId')
    async delete(
        @Param('buildId') buildId: string,
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
    ) {
        try {
            if (!accountId || !accountName) {
                throw new Error('accountId and accountName are required');
            }

            if (storageMode === 'dynamodb' && buildsDynamoDB) {
                await buildsDynamoDB.delete(accountId, accountName, buildId);
                return {message: 'Build deleted successfully'};
            }

            throw new Error('DynamoDB storage not available');
        } catch (error: any) {
            console.error('Error deleting build:', error);
            throw error;
        }
    }
}

@Controller('api/build-executions')
class BuildExecutionsController {
    @Get()
    async listByBuildId(
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
        @Query('buildId') buildId: string,
    ) {
        try {
            if (!accountId || !accountName || !buildId) {
                throw new Error(
                    'accountId, accountName, and buildId are required',
                );
            }

            if (storageMode === 'dynamodb' && buildExecutionsDynamoDB) {
                return await buildExecutionsDynamoDB.listByBuildId(
                    accountId,
                    accountName,
                    buildId,
                );
            }

            return [];
        } catch (error: any) {
            console.error('Error listing build executions:', error);
            throw error;
        }
    }

    @Get('latest')
    async getLatest(
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
        @Query('buildId') buildId: string,
    ) {
        try {
            if (!accountId || !accountName || !buildId) {
                throw new Error(
                    'accountId, accountName, and buildId are required',
                );
            }

            if (storageMode === 'dynamodb' && buildExecutionsDynamoDB) {
                return await buildExecutionsDynamoDB.getLatest(
                    accountId,
                    accountName,
                    buildId,
                );
            }

            return null;
        } catch (error: any) {
            console.error('Error getting latest build execution:', error);
            throw error;
        }
    }

    @Get(':executionId')
    async get(
        @Param('executionId') executionId: string,
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
        @Query('buildId') buildId: string,
    ) {
        try {
            if (!accountId || !accountName || !buildId) {
                throw new Error(
                    'accountId, accountName, and buildId are required',
                );
            }

            if (storageMode === 'dynamodb' && buildExecutionsDynamoDB) {
                return await buildExecutionsDynamoDB.get(
                    accountId,
                    accountName,
                    buildId,
                    executionId,
                );
            }

            return null;
        } catch (error: any) {
            console.error('Error getting build execution:', error);
            throw error;
        }
    }

    @Post()
    async create(@Body() body: any) {
        try {
            console.log('Creating build execution with body:', body);

            if (!body.accountId || !body.accountName) {
                throw new Error('accountId and accountName are required');
            }

            if (!body.buildId) {
                throw new Error('buildId is required');
            }

            const executionData = {
                buildId: body.buildId,
                buildName: body.buildName || '',
                accountId: body.accountId,
                accountName: body.accountName,
                enterpriseId: body.enterpriseId,
                enterpriseName: body.enterpriseName,
                buildNumber: body.buildNumber || '1',
                branch: body.branch || 'main',
                commit: body.commit || '',
                duration: body.duration || '',
                status: body.status || 'pending',
                triggeredBy: body.triggeredBy || 'System',
                startTime: body.startTime || new Date().toISOString(),
                endTime: body.endTime,
                environmentVariables: body.environmentVariables || {},
                buildConfiguration: body.buildConfiguration || null,
                artifacts: body.artifacts || [],
                stages: body.stages || [],
                metrics: body.metrics || {},
                testResults: body.testResults || {},
            };

            if (storageMode === 'dynamodb' && buildExecutionsDynamoDB) {
                return await buildExecutionsDynamoDB.create(executionData);
            }

            throw new Error('DynamoDB storage not available');
        } catch (error: any) {
            console.error('Error creating build execution:', error);
            throw error;
        }
    }

    @Patch(':executionId')
    async update(@Param('executionId') executionId: string, @Body() body: any) {
        try {
            console.log(`Updating build execution ${executionId}:`, body);

            if (!body.accountId || !body.accountName || !body.buildId) {
                throw new Error(
                    'accountId, accountName, and buildId are required',
                );
            }

            if (storageMode === 'dynamodb' && buildExecutionsDynamoDB) {
                return await buildExecutionsDynamoDB.update(
                    body.accountId,
                    body.accountName,
                    body.buildId,
                    executionId,
                    body.updates || body,
                );
            }

            throw new Error('DynamoDB storage not available');
        } catch (error: any) {
            console.error('Error updating build execution:', error);
            throw error;
        }
    }

    @Delete(':executionId')
    async delete(
        @Param('executionId') executionId: string,
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
        @Query('buildId') buildId: string,
    ) {
        try {
            if (!accountId || !accountName || !buildId) {
                throw new Error(
                    'accountId, accountName, and buildId are required',
                );
            }

            if (storageMode === 'dynamodb' && buildExecutionsDynamoDB) {
                await buildExecutionsDynamoDB.delete(
                    accountId,
                    accountName,
                    buildId,
                    executionId,
                );
                return {message: 'Build execution deleted successfully'};
            }

            throw new Error('DynamoDB storage not available');
        } catch (error: any) {
            console.error('Error deleting build execution:', error);
            throw error;
        }
    }
}

@Controller('api/templates')
class TemplatesController {
    @Get()
    async list() {
        return await templates.list();
    }

    @Post()
    async create(@Body() body: any) {
        return await templates.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        const updated = await templates.update(id, body);
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await templates.remove(id);
        return {};
    }
}

@Controller('api/pipeline-yaml')
class PipelineYamlController {
    @Get(':templateId')
    async get(@Param('templateId') templateId: string) {
        const yaml = await pipelineYaml.get(templateId);
        return yaml ? {templateId, yaml} : {templateId, yaml: null};
    }

    @Get()
    async getAll() {
        return await pipelineYaml.getAll();
    }

    @Post(':templateId')
    async save(@Param('templateId') templateId: string, @Body() body: any) {
        await pipelineYaml.save(templateId, body?.yaml || '');
        return {ok: true};
    }

    @Delete(':templateId')
    async remove(@Param('templateId') templateId: string) {
        await pipelineYaml.remove(templateId);
        return {};
    }
}

@Controller('api/pipeline-config')
class PipelineConfigController {
    @Get()
    async get() {
        return await pipelineConfig.get();
    }

    @Post()
    async save(@Body() body: any) {
        return await pipelineConfig.save(body || {});
    }
}

@Controller('api/environments')
class EnvironmentsController {
    @Get()
    async getAll(
        @Query('accountId') accountId?: string,
        @Query('enterpriseId') enterpriseId?: string,
    ) {
        const allEnvironments = await environments.getAll();

        // Filter by accountId and enterpriseId if provided
        let filtered = allEnvironments;
        if (accountId) {
            filtered = filtered.filter(
                (env: any) => env.accountId === accountId,
            );
        }
        if (enterpriseId) {
            filtered = filtered.filter(
                (env: any) => env.enterpriseId === enterpriseId,
            );
        }

        return filtered;
    }

    @Get(':id')
    async getById(@Param('id') id: string) {
        const environment = await environments.getById(id);
        if (!environment) {
            return {error: 'Environment not found', status: 404};
        }
        return environment;
    }

    @Post()
    async create(@Body() body: any) {
        return await environments.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        const updated = await environments.update(id, body);
        if (!updated) {
            return {error: 'Environment not found', status: 404};
        }
        return updated;
    }

    @Delete(':id')
    async delete(@Param('id') id: string) {
        const deleted = await environments.delete(id);
        if (!deleted) {
            return {error: 'Environment not found', status: 404};
        }
        return {success: true};
    }
}

@Controller('api/enterprise-products-services')
class EnterpriseProductsServicesController {
    @Get()
    async list() {
        if (storageMode === 'dynamodb') {
            // For DynamoDB, return detailed information with names
            const linkages = await enterpriseProductsServices.list();
            const detailedLinkages = [];

            for (const linkage of linkages) {
                // Get enterprise, product, and service names
                const [enterprise, product, ...serviceList] = await Promise.all(
                    [
                        enterprises.get(linkage.enterpriseId),
                        products.get(linkage.productId),
                        ...linkage.serviceIds.map((serviceId: string) =>
                            services.get(serviceId),
                        ),
                    ],
                );

                detailedLinkages.push({
                    id: linkage.id,
                    enterpriseId: linkage.enterpriseId,
                    productId: linkage.productId,
                    serviceIds: linkage.serviceIds,
                    enterprise: {
                        id: linkage.enterpriseId,
                        name: enterprise?.name || 'Unknown Enterprise',
                    },
                    product: {
                        id: linkage.productId,
                        name: product?.name || 'Unknown Product',
                    },
                    services: serviceList.map((svc, index) => ({
                        id: linkage.serviceIds[index],
                        name: svc?.name || 'Unknown Service',
                    })),
                    createdAt: linkage.createdAt,
                    updatedAt: linkage.updatedAt,
                });
            }

            return detailedLinkages;
        } else {
            // For PostgreSQL, return basic information
            return await enterpriseProductsServices.list();
        }
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            return await enterpriseProductsServices.get(id); // String ID for DynamoDB
        } else {
            return await enterpriseProductsServices.get(parseInt(id)); // Number ID for PostgreSQL
        }
    }

    @Post()
    async create(@Body() body: any) {
        // Use createOrUpdate by default to prevent duplicates
        return await enterpriseProductsServices.createOrUpdate(body);
    }

    @Post('create-or-update')
    async createOrUpdate(@Body() body: any) {
        return await enterpriseProductsServices.createOrUpdate(body);
    }

    @Post('force-create')
    async forceCreate(@Body() body: any) {
        // Force create without checking for existing records
        return await enterpriseProductsServices.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any, @Res() res: any) {
        try {
            let result;
            if (storageMode === 'dynamodb') {
                result = await enterpriseProductsServices.update(id, body); // String ID for DynamoDB
            } else {
                result = await enterpriseProductsServices.update(
                    parseInt(id),
                    body,
                ); // Number ID for PostgreSQL
            }

            if (!result) {
                return res.status(404).json({error: 'Record not found'});
            }

            return res.json(result);
        } catch (error: any) {
            console.error(
                'Error updating enterprise-products-services:',
                error.message,
            );

            return res.status(500).json({
                error: 'Internal server error',
                message: error.message,
                details:
                    process.env.NODE_ENV === 'development'
                        ? error.stack
                        : undefined,
            });
        }
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await enterpriseProductsServices.remove(id); // String ID for DynamoDB
        } else {
            await enterpriseProductsServices.remove(parseInt(id)); // Number ID for PostgreSQL
        }
        return {};
    }

    // Get all linkages for a specific enterprise
    @Get('enterprise/:enterpriseId')
    async getByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        if (storageMode === 'dynamodb') {
            return await enterpriseProductsServices.getByEnterprise(
                enterpriseId,
            ); // String ID for DynamoDB
        } else {
            return await enterpriseProductsServices.getByEnterprise(
                parseInt(enterpriseId),
            ); // Number ID for PostgreSQL
        }
    }

    // Get detailed information with names for a specific enterprise
    @Get('enterprise/:enterpriseId/detailed')
    async getDetailedByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        if (storageMode === 'dynamodb') {
            return await enterpriseProductsServices.getDetailedByEnterprise(
                enterpriseId,
            ); // String ID for DynamoDB
        } else {
            return await enterpriseProductsServices.getDetailedByEnterprise(
                parseInt(enterpriseId),
            ); // Number ID for PostgreSQL
        }
    }

    // Find by enterprise and product
    @Get('enterprise/:enterpriseId/product/:productId')
    async findByEnterpriseAndProduct(
        @Param('enterpriseId') enterpriseId: string,
        @Param('productId') productId: string,
    ) {
        return await enterpriseProductsServices.findByEnterpriseAndProduct(
            parseInt(enterpriseId),
            parseInt(productId),
        );
    }

    // Get all linkages for a specific product
    @Get('product/:productId')
    async getByProduct(@Param('productId') productId: string) {
        return await enterpriseProductsServices.getByProduct(
            parseInt(productId),
        );
    }

    // Get all linkages for a specific service
    @Get('service/:serviceId')
    async getByService(@Param('serviceId') serviceId: string) {
        return await enterpriseProductsServices.getByService(
            parseInt(serviceId),
        );
    }

    // Remove all linkages for a specific enterprise
    @Delete('enterprise/:enterpriseId')
    async removeByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        await enterpriseProductsServices.removeByEnterprise(
            parseInt(enterpriseId),
        );
        return {};
    }

    // Remove all linkages for a specific product
    @Delete('product/:productId')
    async removeByProduct(@Param('productId') productId: string) {
        await enterpriseProductsServices.removeByProduct(parseInt(productId));
        return {};
    }

    // Remove all linkages for a specific service
    @Delete('service/:serviceId')
    async removeByService(@Param('serviceId') serviceId: string) {
        await enterpriseProductsServices.removeByService(parseInt(serviceId));
        return {};
    }

    // Debug endpoint to check table contents
    @Get('debug/contents')
    async debugContents() {
        return await enterpriseProductsServices.debugTableContents();
    }

    // Debug endpoint to check table structure
    @Get('debug/structure')
    async debugStructure() {
        return await enterpriseProductsServices.checkTableStructure();
    }

    // Consolidate duplicate records
    @Post('consolidate-duplicates')
    async consolidateDuplicates() {
        await enterpriseProductsServices.consolidateDuplicates();
        return {message: 'Duplicate records consolidated successfully'};
    }
}

@Controller('api/account-licenses')
class AccountLicensesController {
    @Get('account/:accountId')
    async getByAccount(@Param('accountId') accountId: string) {
        if (storageMode !== 'dynamodb') {
            return {error: 'Account licenses only available in DynamoDB mode'};
        }
        return await accountLicenses.getByAccount(accountId);
    }

    @Get('account/:accountId/license/:licenseId')
    async get(
        @Param('accountId') accountId: string,
        @Param('licenseId') licenseId: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {error: 'Account licenses only available in DynamoDB mode'};
        }
        return await accountLicenses.get(accountId, licenseId);
    }

    @Post('sync')
    async syncToAccount(@Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {error: 'Account licenses only available in DynamoDB mode'};
        }

        const {
            accountId,
            accountName,
            enterpriseId,
            productId,
            serviceId,
            licenseStart,
            licenseEnd,
        } = body;

        if (
            !accountId ||
            !accountName ||
            !enterpriseId ||
            !productId ||
            !serviceId
        ) {
            return {
                error: 'Missing required fields: accountId, accountName, enterpriseId, productId, serviceId',
            };
        }

        // Get the names from the respective services
        const [enterprise, product, service] = await Promise.all([
            enterprises.get(enterpriseId),
            products.get(productId),
            services.get(serviceId),
        ]);

        if (!enterprise || !product || !service) {
            return {error: 'Enterprise, product, or service not found'};
        }

        return await accountLicenses.syncToAccount({
            accountId,
            accountName,
            enterpriseId,
            enterpriseName: enterprise.name,
            productId,
            productName: product.name,
            serviceId,
            serviceName: service.name,
            licenseStart,
            licenseEnd,
        });
    }

    @Post('sync-linkage')
    async syncLinkageToAccount(@Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {error: 'Account licenses only available in DynamoDB mode'};
        }

        const {accountId, accountName, linkageId, licenseStart, licenseEnd} =
            body;

        if (!accountId || !accountName || !linkageId) {
            return {
                error: 'Missing required fields: accountId, accountName, linkageId',
            };
        }

        // Get the linkage data
        const linkage = await enterpriseProductsServices.get(linkageId);
        if (!linkage) {
            return {error: 'Linkage not found'};
        }

        // Get the names from the respective services
        const [enterprise, product, ...serviceList] = await Promise.all([
            enterprises.get(linkage.enterpriseId),
            products.get(linkage.productId),
            ...linkage.serviceIds.map((serviceId: string) =>
                services.get(serviceId),
            ),
        ]);

        if (!enterprise || !product) {
            return {error: 'Enterprise or product not found'};
        }

        const servicesData = linkage.serviceIds
            .map((serviceId: string, index: number) => {
                const svc = serviceList[index];
                if (svc) {
                    return {id: serviceId, name: svc.name};
                }
                return null;
            })
            .filter((s: any) => s !== null);

        return await accountLicenses.syncLinkageToAccount({
            accountId,
            accountName,
            enterpriseId: linkage.enterpriseId,
            enterpriseName: enterprise.name,
            productId: linkage.productId,
            productName: product.name,
            services: servicesData,
            licenseStart,
            licenseEnd,
        });
    }

    @Delete('account/:accountId/license/:licenseId')
    async remove(
        @Param('accountId') accountId: string,
        @Param('licenseId') licenseId: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {error: 'Account licenses only available in DynamoDB mode'};
        }
        await accountLicenses.remove(accountId, licenseId);
        return {};
    }

    @Put('account/:accountId/license/:licenseId')
    async updateLicensePeriod(
        @Param('accountId') accountId: string,
        @Param('licenseId') licenseId: string,
        @Body() body: any,
    ) {
        if (storageMode !== 'dynamodb') {
            return {error: 'Account licenses only available in DynamoDB mode'};
        }

        const {licenseStart, licenseEnd} = body;

        if (!licenseStart || !licenseEnd) {
            return {
                error: 'Missing required fields: licenseStart, licenseEnd',
            };
        }

        return await accountLicenses.updateLicensePeriod(
            accountId,
            licenseId,
            licenseStart,
            licenseEnd,
        );
    }

    @Get('debug')
    async debug() {
        if (storageMode !== 'dynamodb') {
            return {error: 'Account licenses only available in DynamoDB mode'};
        }
        return await accountLicenses.debugTableContents();
    }
}

@Controller('api/user-management')
class UserManagementController {
    // ==========================================
    // USER ENDPOINTS
    // ==========================================

    @Get('users')
    async listUsers(
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }

        console.log(
            '📋 GET /api/user-management/users called with query params:',
            {
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            },
        );

        // Check if account context is provided
        const hasAccountContext = accountId && accountName;

        if (hasAccountContext) {
            console.log(
                `✅ Listing users for account: ${accountName} (${accountId})`,
            );
            if (enterpriseId && enterpriseName) {
                console.log(
                    `   Filtering by enterprise: ${enterpriseName} (${enterpriseId})`,
                );
            }

            const users = await userManagement.listUsersByAccount(
                accountId,
                accountName,
                enterpriseId, // Pass enterprise filter
                enterpriseName, // Pass enterprise filter
            );

            // Fetch assigned groups for each user
            const usersWithGroups = await Promise.all(
                users.map(async (user: any) => {
                    try {
                        // IMPORTANT: Use the account/enterprise from the user record itself
                        // Not from the query parameters, as they might differ
                        const userAccountId = user.accountId || accountId;
                        const userAccountName = user.accountName || accountName;
                        const userEnterpriseId =
                            user.enterpriseId || enterpriseId;
                        const userEnterpriseName =
                            user.enterpriseName || enterpriseName;

                        console.log(`🔍 Fetching groups for user ${user.id}:`, {
                            userAccountId,
                            userAccountName,
                            userEnterpriseId,
                            userEnterpriseName,
                        });

                        const assignedGroups =
                            await userManagement.getUserGroups(
                                user.id,
                                userAccountId, // Use user's account context
                                userAccountName, // Use user's account context
                                userEnterpriseId, // Use user's enterprise context
                                userEnterpriseName, // Use user's enterprise context
                            );

                        console.log(
                            `✅ Got ${assignedGroups.length} group(s) for user ${user.id}`,
                        );

                        return {
                            ...user,
                            assignedUserGroups: assignedGroups,
                        };
                    } catch (error) {
                        console.error(
                            `❌ Failed to get groups for user ${user.id}:`,
                            error,
                        );
                        return {
                            ...user,
                            assignedUserGroups: [],
                        };
                    }
                }),
            );

            return usersWithGroups;
        } else {
            console.log('✅ Listing Systiva users (no account context)');
            return await userManagement.listUsers();
        }
    }

    @Get('users/:id')
    async getUser(@Param('id') id: string) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        return await userManagement.getUser(id);
    }

    @Get('users/:id/hierarchy')
    async getUserWithHierarchy(@Param('id') id: string) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        return await userManagement.getUserWithFullHierarchy(id);
    }

    @Post('users')
    async createUser(@Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }

        console.log('💾 POST /api/user-management/users called with body:', {
            accountId: body.accountId,
            accountName: body.accountName,
            enterpriseId: body.enterpriseId,
            enterpriseName: body.enterpriseName,
            firstName: body.firstName,
            lastName: body.lastName,
            emailAddress: body.emailAddress,
        });

        // Check if account context is provided
        const hasAccountContext = body.accountId && body.accountName;

        if (hasAccountContext) {
            console.log(
                `✅ Creating user in account table: ${body.accountName} (${body.accountId})`,
            );
            console.log(
                `   Enterprise: ${body.enterpriseName} (${body.enterpriseId})`,
            );

            // Prepare user data for account-specific creation (include enterprise context)
            const userPayload = {
                firstName: body.firstName,
                middleName: body.middleName,
                lastName: body.lastName,
                emailAddress: body.emailAddress,
                password: body.password,
                status: body.status || 'ACTIVE',
                startDate:
                    body.startDate || new Date().toISOString().split('T')[0],
                endDate: body.endDate,
                technicalUser:
                    body.technicalUser === true ||
                    body.technicalUser === 'true',
                assignedGroups: body.assignedUserGroups
                    ? body.assignedUserGroups.map(
                          (group: any) => group.id || group,
                      )
                    : [],
                enterpriseId: body.enterpriseId, // Pass enterprise context
                enterpriseName: body.enterpriseName, // Pass enterprise context
            };

            return await userManagement.createUserInAccountTable(
                userPayload,
                body.accountId,
                body.accountName,
            );
        } else {
            console.log(
                '✅ Creating user in Systiva table (no account context)',
            );
            return await userManagement.createUser(body);
        }
    }

    @Put('users/:id')
    async updateUser(@Param('id') id: string, @Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }

        console.log('🔄 PUT /api/user-management/users/:id called with body:', {
            userId: id,
            accountId: body.accountId,
            accountName: body.accountName,
            firstName: body.firstName,
            lastName: body.lastName,
        });

        // Check if account context is provided
        const hasAccountContext = body.accountId && body.accountName;

        if (hasAccountContext) {
            console.log(
                `✅ Updating user in account table: ${body.accountName} (${body.accountId})`,
            );
            if (body.enterpriseId && body.enterpriseName) {
                console.log(
                    `   Enterprise: ${body.enterpriseName} (${body.enterpriseId})`,
                );
            }

            const updatePayload: any = {
                firstName: body.firstName,
                middleName: body.middleName,
                lastName: body.lastName,
                emailAddress: body.emailAddress,
                status: body.status,
                startDate: body.startDate,
                endDate: body.endDate,
                technicalUser: body.technicalUser,
                enterpriseId: body.enterpriseId, // Pass enterprise context
                enterpriseName: body.enterpriseName, // Pass enterprise context
            };

            // ⚠️  DO NOT update assignedUserGroups via PUT endpoint
            // Group assignments should ONLY be updated via POST /users/:id/groups endpoint
            // This prevents frontend temporary IDs from being saved to database
            console.log(
                '⚠️  Ignoring assignedUserGroups in PUT request (use POST /users/:id/groups instead)',
            );

            // Handle password if provided
            if (body.password) {
                updatePayload.password = body.password;
            }

            return await userManagement.updateUserInAccountTable(
                id,
                updatePayload,
                body.accountId,
                body.accountName,
            );
        } else {
            console.log(
                '✅ Updating user in Systiva table (no account context)',
            );
            return await userManagement.updateUser(id, body);
        }
    }

    @Delete('users/:id')
    async deleteUser(
        @Param('id') id: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }

        console.log('🗑️  DELETE /api/user-management/users/:id called:', {
            userId: id,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        });

        // Check if account context is provided
        const hasAccountContext = accountId && accountName;

        if (hasAccountContext) {
            console.log(
                `✅ Deleting user from account table: ${accountName} (${accountId})`,
            );
            if (enterpriseId && enterpriseName) {
                console.log(
                    `   Enterprise context: ${enterpriseName} (${enterpriseId})`,
                );
            }
            await userManagement.deleteUserFromAccountTable(
                id,
                accountId,
                accountName,
            );
        } else {
            console.log(
                '✅ Deleting user from Systiva table (no account context)',
            );
            await userManagement.deleteUser(id);
        }

        return {};
    }

    // ==========================================
    // USER-GROUP ASSIGNMENT ENDPOINTS
    // ==========================================

    @Post('users/:id/groups')
    async assignGroupsToUser(
        @Param('id') id: string,
        @Body() body: any,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }

        console.log('🔗 POST /api/user-management/users/:id/groups called:', {
            userId: id,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
            body,
        });

        // Check if account context is provided
        const hasAccountContext = accountId && accountName;

        try {
            // Get the user from the correct table
            let user;
            if (hasAccountContext) {
                console.log(
                    `✅ Looking for user in account table: ${accountName} (${accountId})`,
                );
                const users = await userManagement.listUsersByAccount(
                    accountId,
                    accountName,
                );
                user = users.find((u) => u.id === id);
            } else {
                console.log('✅ Looking for user in Systiva table');
                user = await userManagement.getUser(id);
            }

            if (!user) {
                return {
                    success: false,
                    error: 'User not found',
                };
            }

            console.log(`✅ User found: ${user.firstName} ${user.lastName}`);

            // Handle different body formats
            let requestedGroupIds: string[] = [];

            if (body.groupId) {
                // Single group assignment
                console.log('📋 Single group assignment:', body.groupId);
                const currentGroups = user.assignedGroups || [];
                if (!currentGroups.includes(body.groupId)) {
                    requestedGroupIds = [...currentGroups, body.groupId];
                } else {
                    requestedGroupIds = currentGroups;
                }
            } else if (body.groupIds && Array.isArray(body.groupIds)) {
                // Bulk assignment (replace all)
                console.log('📋 Bulk group assignment:', body.groupIds);
                requestedGroupIds = body.groupIds;
            } else if (
                body.assignedUserGroups &&
                Array.isArray(body.assignedUserGroups)
            ) {
                // Frontend format
                console.log(
                    '📋 assignedUserGroups format:',
                    body.assignedUserGroups,
                );
                requestedGroupIds = body.assignedUserGroups.map(
                    (g: any) => g.id || g,
                );
            } else {
                return {
                    success: false,
                    error: 'Invalid request body. Provide groupId, groupIds, or assignedUserGroups',
                };
            }

            // ✅ VALIDATE AND PRIORITIZE ACCOUNT-SPECIFIC GROUPS
            console.log(
                `\n🔍 Validating ${requestedGroupIds.length} requested group(s)...`,
            );
            const validatedGroupIds: string[] = [];
            const warnings: string[] = [];
            const replacements: Array<{
                original: string;
                replacement: string;
                groupName: string;
            }> = [];

            for (const groupId of requestedGroupIds) {
                const validation = await userManagement.validateGroupScope(
                    groupId,
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                );

                if (validation.isValid) {
                    console.log(`✅ Group ${groupId} is valid for this scope`);
                    validatedGroupIds.push(groupId);
                } else {
                    console.warn(
                        `⚠️  Group ${groupId} validation failed: ${validation.warning}`,
                    );
                    warnings.push(validation.warning || 'Validation failed');

                    // If it's a Systiva group in account context, try to find account-specific alternative
                    if (
                        validation.scopeType === 'systiva' &&
                        validation.group &&
                        hasAccountContext
                    ) {
                        console.log(
                            `🔄 Attempting to find account-specific alternative for "${validation.group.name}"...`,
                        );

                        const alternative =
                            await userManagement.findAccountSpecificGroupByName(
                                validation.group.name,
                                accountId!,
                                accountName!,
                                enterpriseId,
                                enterpriseName,
                            );

                        if (alternative) {
                            console.log(
                                `✅ Found account-specific alternative: ${alternative.name} (${alternative.id})`,
                            );
                            validatedGroupIds.push(alternative.id);
                            replacements.push({
                                original: groupId,
                                replacement: alternative.id,
                                groupName: alternative.name,
                            });
                            warnings.push(
                                `Replaced Systiva group "${validation.group.name}" with account-specific version (${alternative.id})`,
                            );
                        } else {
                            console.error(
                                `❌ No account-specific alternative found for "${validation.group.name}"`,
                            );
                            warnings.push(
                                `Group "${validation.group.name}" (${groupId}) is Systiva-level with no account-specific alternative. Skipped.`,
                            );
                        }
                    } else {
                        console.error(
                            `❌ Group ${groupId} cannot be assigned: ${validation.warning}`,
                        );
                    }
                }
            }

            if (
                validatedGroupIds.length === 0 &&
                requestedGroupIds.length > 0
            ) {
                console.error('❌ No valid groups to assign after validation');
                return {
                    success: false,
                    error: 'No valid groups to assign',
                    warnings,
                    details:
                        'All requested groups failed validation. Ensure groups belong to the correct account and enterprise.',
                };
            }

            console.log(`\n📊 Validation Summary:`);
            console.log(`   Requested: ${requestedGroupIds.length} groups`);
            console.log(`   Validated: ${validatedGroupIds.length} groups`);
            console.log(`   Replacements: ${replacements.length}`);
            if (replacements.length > 0) {
                replacements.forEach((r) => {
                    console.log(
                        `      - ${r.groupName}: ${r.original} → ${r.replacement}`,
                    );
                });
            }
            console.log('');

            // Update user with validated group assignments
            if (hasAccountContext) {
                console.log(
                    `✅ Updating user in account table with ${validatedGroupIds.length} validated group(s)`,
                );
                await userManagement.updateUserInAccountTable(
                    id,
                    {
                        assignedGroups: validatedGroupIds,
                        enterpriseId,
                        enterpriseName,
                    },
                    accountId,
                    accountName,
                );
            } else {
                console.log(
                    `✅ Updating user in Systiva table with ${validatedGroupIds.length} validated group(s)`,
                );
                await userManagement.updateUser(id, {
                    assignedGroups: validatedGroupIds,
                });
            }

            console.log(
                `✅ Successfully assigned ${validatedGroupIds.length} group(s) to user ${id}`,
            );

            const response: any = {
                success: true,
                message: 'Groups assigned successfully',
                data: {
                    userId: id,
                    assignedGroups: validatedGroupIds.map((gId) => ({id: gId})),
                    validatedCount: validatedGroupIds.length,
                    requestedCount: requestedGroupIds.length,
                },
            };

            if (warnings.length > 0) {
                response.warnings = warnings;
                response.replacements = replacements;
            }

            return response;
        } catch (error: any) {
            console.error('❌ Error assigning groups to user:', error);
            return {
                success: false,
                error: 'Failed to assign groups to user',
                details: error.message,
            };
        }
    }

    @Delete('users/:id/groups')
    async removeGroupsFromUser(
        @Param('id') id: string,
        @Body() body: any,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }

        console.log(
            '🗑️  DELETE /api/user-management/users/:id/groups called:',
            {
                userId: id,
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
                groupIds: body.groupIds,
            },
        );

        // Check if account context is provided
        const hasAccountContext = accountId && accountName;

        try {
            // Get the user from the correct table
            let user;
            if (hasAccountContext) {
                console.log(
                    `✅ Looking for user in account table: ${accountName}`,
                );
                if (enterpriseId && enterpriseName) {
                    console.log(
                        `   Enterprise context: ${enterpriseName} (${enterpriseId})`,
                    );
                }
                const users = await userManagement.listUsersByAccount(
                    accountId,
                    accountName,
                );
                user = users.find((u) => u.id === id);
            } else {
                console.log('✅ Looking for user in Systiva table');
                user = await userManagement.getUser(id);
            }

            if (!user) {
                return {
                    success: false,
                    error: 'User not found',
                };
            }

            if (!body.groupIds || !Array.isArray(body.groupIds)) {
                return {
                    success: false,
                    error: 'groupIds array is required',
                };
            }

            // Remove specified groups
            const currentGroups = user.assignedGroups || [];
            const updatedGroups = currentGroups.filter(
                (groupId) => !body.groupIds.includes(groupId),
            );

            console.log(
                `📋 Removing ${body.groupIds.length} group(s), ${updatedGroups.length} will remain`,
            );

            // Update user
            if (hasAccountContext) {
                await userManagement.updateUserInAccountTable(
                    id,
                    {
                        assignedGroups: updatedGroups,
                        enterpriseId, // Preserve enterprise context
                        enterpriseName, // Preserve enterprise context
                    },
                    accountId,
                    accountName,
                );
            } else {
                await userManagement.updateUser(id, {
                    assignedGroups: updatedGroups,
                });
            }

            console.log(
                `✅ Removed ${body.groupIds.length} group(s) from user ${id}`,
            );

            return {
                success: true,
                message: 'Groups removed successfully',
            };
        } catch (error: any) {
            console.error('❌ Error removing groups from user:', error);
            return {
                success: false,
                error: 'Failed to remove groups from user',
                details: error.message,
            };
        }
    }

    @Get('users/:id/groups')
    async getUserGroups(
        @Param('id') id: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }

        console.log('📋 GET /api/user-management/users/:id/groups called:', {
            userId: id,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        });

        // Check if account context is provided
        const hasAccountContext = accountId && accountName;

        try {
            // Get the user from the correct table
            let user;
            if (hasAccountContext) {
                const users = await userManagement.listUsersByAccount(
                    accountId,
                    accountName,
                );
                user = users.find((u) => u.id === id);
            } else {
                user = await userManagement.getUser(id);
            }

            if (!user) {
                return {
                    success: false,
                    error: 'User not found',
                };
            }

            const groups = await userManagement.getUserGroups(
                id,
                accountId,
                accountName,
                enterpriseId, // Pass enterprise context
                enterpriseName, // Pass enterprise context
            );

            return {
                success: true,
                data: {groups},
            };
        } catch (error: any) {
            console.error('❌ Error getting user groups:', error);
            return {
                success: false,
                error: 'Failed to get user groups',
                details: error.message,
            };
        }
    }

    // ==========================================
    // GROUP ENDPOINTS
    // ==========================================

    @Get('groups')
    async listGroups(
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        console.log('📋 listGroups API called with full context:', {
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        });
        const groups = await userManagement.listGroups(
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        );
        console.log(`📋 listGroups returning ${groups.length} groups`);
        return groups;
    }

    @Get('groups/:id')
    async getGroup(
        @Param('id') id: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        return await userManagement.getGroup(
            id,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        );
    }

    @Get('groups/:id/roles')
    async getGroupRoles(
        @Param('id') id: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        return await userManagement.getGroupRoles(
            id,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        );
    }

    @Post('groups/:id/roles')
    async assignRoleToGroup(
        @Param('id') id: string,
        @Body()
        body: {
            roleId?: string;
            roleIds?: string[];
            roleName?: string;
            groupId?: string;
        },
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }

        try {
            console.log(`🔗 Assigning role(s) to group ${id}:`, {
                roleId: body.roleId,
                roleIds: body.roleIds,
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            });

            const group = await userManagement.getGroup(
                id,
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            );
            if (!group) {
                console.error(`❌ Group not found: ${id} with context:`, {
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                });
                return {
                    success: false,
                    error: 'Group not found',
                };
            }

            console.log(`✅ Found group: ${group.name}`);

            const currentRoles = group.assignedRoles || [];
            let rolesToAdd: string[] = [];

            // Support both single role (roleId) and bulk roles (roleIds)
            if (body.roleIds && Array.isArray(body.roleIds)) {
                rolesToAdd = body.roleIds;
            } else if (body.roleId) {
                rolesToAdd = [body.roleId];
            } else {
                return {
                    success: false,
                    error: 'Either roleId or roleIds is required',
                };
            }

            // Add only new roles (avoid duplicates)
            const newRoles = rolesToAdd.filter(
                (roleId) => !currentRoles.includes(roleId),
            );
            const updatedRoles = [...currentRoles, ...newRoles];

            await userManagement.updateGroup(id, {
                assignedRoles: updatedRoles,
                selectedAccountId: accountId,
                selectedAccountName: accountName,
                selectedEnterpriseId: enterpriseId,
                selectedEnterpriseName: enterpriseName,
            });

            console.log(
                `✅ Assigned ${newRoles.length} new role(s) to group ${id}. Total roles: ${updatedRoles.length}`,
            );

            return {
                success: true,
                message: 'Role(s) assigned to group successfully',
                data: {
                    groupId: id,
                    addedRoles: newRoles.length,
                    totalRoles: updatedRoles.length,
                },
            };
        } catch (error: any) {
            console.error(`❌ Error assigning role to group:`, error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    @Delete('groups/:id/roles/:roleId')
    async removeRoleFromGroup(
        @Param('id') id: string,
        @Param('roleId') roleId: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }

        try {
            console.log(
                `🗑️  Removing role ${roleId} from group ${id} with context:`,
                {
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                },
            );

            const group = await userManagement.getGroup(
                id,
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            );
            if (!group) {
                console.error(`❌ Group not found: ${id} with context:`, {
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                });
                return {
                    success: false,
                    error: 'Group not found',
                };
            }

            console.log(`✅ Found group: ${group.name}`);

            const currentRoles = group.assignedRoles || [];
            const updatedRoles = currentRoles.filter((r) => r !== roleId);

            await userManagement.updateGroup(id, {
                assignedRoles: updatedRoles,
                selectedAccountId: accountId,
                selectedAccountName: accountName,
                selectedEnterpriseId: enterpriseId,
                selectedEnterpriseName: enterpriseName,
            });

            console.log(
                `✅ Role ${roleId} removed from group ${id}. Remaining roles: ${updatedRoles.length}`,
            );

            return {
                success: true,
                message: 'Role removed from group successfully',
                data: {
                    groupId: id,
                    roleId: roleId,
                    remainingRoles: updatedRoles.length,
                },
            };
        } catch (error: any) {
            console.error(`❌ Error removing role from group:`, error);
            return {
                success: false,
                error: error.message,
            };
        }
    }

    @Post('groups')
    async createGroup(@Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        console.log('🆕 createGroup API called with body:', body);

        // Map frontend field names to backend expected names
        const groupData = {
            ...body,
            name: body.groupName || body.name, // Frontend sends 'groupName', backend expects 'name'
            selectedAccountId: body.accountId,
            selectedAccountName: body.accountName,
            selectedEnterpriseId: body.enterpriseId,
            selectedEnterpriseName: body.enterpriseName,
        };

        console.log('🆕 createGroup mapped data:', groupData);
        const result = await userManagement.createGroup(groupData);
        console.log('🆕 createGroup created group:', result);
        return result;
    }

    @Put('groups/:id')
    async updateGroup(@Param('id') id: string, @Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        console.log(`🔄 updateGroup API called for id: ${id} with body:`, body);

        // Map frontend field names to backend expected names
        const updateData = {
            ...body,
            name: body.groupName || body.name, // Frontend sends 'groupName', backend expects 'name'
            selectedAccountId: body.accountId || body.selectedAccountId,
            selectedAccountName: body.accountName || body.selectedAccountName,
            selectedEnterpriseId:
                body.enterpriseId || body.selectedEnterpriseId,
            selectedEnterpriseName:
                body.enterpriseName || body.selectedEnterpriseName,
        };

        console.log(`🔄 updateGroup mapped data:`, updateData);
        const result = await userManagement.updateGroup(id, updateData);
        console.log(`🔄 updateGroup result:`, result);
        return result;
    }

    @Delete('groups/:id')
    async deleteGroup(
        @Param('id') id: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        console.log(`🗑️  deleteGroup API called for id: ${id} with context:`, {
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        });
        await userManagement.deleteGroup(
            id,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        );
        return {};
    }

    @Get('groups/debug/all')
    async debugAllGroups() {
        if (storageMode !== 'dynamodb') {
            return {error: 'Only available in DynamoDB mode'};
        }
        return await userManagement.debugListAllGroups();
    }

    @Delete('groups/debug/delete-all')
    async debugDeleteAllGroups() {
        if (storageMode !== 'dynamodb') {
            return {error: 'Only available in DynamoDB mode'};
        }
        return await userManagement.debugDeleteAllGroups();
    }

    @Delete('users/debug/clear-all-group-assignments')
    async debugClearAllUserGroupAssignments() {
        if (storageMode !== 'dynamodb') {
            return {error: 'Only available in DynamoDB mode'};
        }
        return await userManagement.debugClearAllUserGroupAssignments();
    }

    // ==========================================
    // ROLE ENDPOINTS
    // ==========================================

    @Get('roles')
    async listRoles(
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        console.log('📋 listRoles API called with full context:', {
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        });
        const roles = await userManagement.listRoles(
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        );
        console.log(`📋 listRoles returning ${roles.length} roles`);
        return roles;
    }

    @Get('roles/:id')
    async getRole(
        @Param('id') id: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        return await userManagement.getRole(
            id,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        );
    }

    @Post('roles')
    async createRole(@Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        console.log('🆕 createRole API called with body:', body);

        // Map frontend field names to backend expected names (similar to createGroup)
        const roleData = {
            ...body,
            name: body.roleName || body.name, // Frontend might send 'roleName', backend expects 'name'
            selectedAccountId: body.accountId,
            selectedAccountName: body.accountName,
            selectedEnterpriseId: body.enterpriseId,
            selectedEnterpriseName: body.enterpriseName,
        };

        console.log('🆕 createRole mapped data:', roleData);
        const result = await userManagement.createRole(roleData);
        console.log('🆕 createRole created role:', result);
        return result;
    }

    @Put('roles/:id')
    async updateRole(@Param('id') id: string, @Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        console.log(`🔄 updateRole API called for id: ${id} with body:`, body);

        // Map frontend field names to backend expected names (similar to updateGroup)
        const updateData = {
            ...body,
            name: body.roleName || body.name, // Frontend might send 'roleName', backend expects 'name'
            selectedAccountId: body.accountId || body.selectedAccountId,
            selectedAccountName: body.accountName || body.selectedAccountName,
            selectedEnterpriseId:
                body.enterpriseId || body.selectedEnterpriseId,
            selectedEnterpriseName:
                body.enterpriseName || body.selectedEnterpriseName,
        };

        console.log(`🔄 updateRole mapped data:`, updateData);
        const result = await userManagement.updateRole(id, updateData);
        console.log(`🔄 updateRole result:`, result);
        return result;
    }

    @Delete('roles/:id')
    async deleteRole(
        @Param('id') id: string,
        @Query('accountId') accountId?: string,
        @Query('accountName') accountName?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        console.log(`🗑️  deleteRole API called for id: ${id} with context:`, {
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        });
        await userManagement.deleteRole(
            id,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        );
        return {};
    }

    // ==========================================
    // DEBUG ENDPOINTS
    // ==========================================

    @Get('debug')
    async debug() {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'User management in systiva table only available in DynamoDB mode',
            };
        }
        return await userManagement.debugTableContents();
    }
}

@Controller('api/global-settings')
class GlobalSettingsController {
    @Get()
    async getEntities(
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
        @Query('enterpriseId') enterpriseId: string,
        @Query('enterpriseName') enterpriseName: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'Global settings only available in DynamoDB mode',
            };
        }

        // If no query parameters provided, return all records
        if (!accountId || !accountName || !enterpriseId || !enterpriseName) {
            console.log(
                '📋 getEntities API called - fetching all global settings',
            );
            return await globalSettings.getAllEntities();
        }

        // Otherwise, filter by account and enterprise
        console.log(
            `📋 getEntities API called for account: ${accountId} (${accountName}), enterprise: ${enterpriseId} (${enterpriseName})`,
        );
        return await globalSettings.getEntitiesByAccountAndEnterprise(
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
        );
    }

    @Get(':entityName')
    async getEntity(
        @Param('entityName') entityName: string,
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
        @Query('enterpriseId') enterpriseId: string,
        @Query('enterpriseName') enterpriseName: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'Global settings only available in DynamoDB mode',
            };
        }
        if (!accountId || !accountName || !enterpriseId || !enterpriseName) {
            return {
                error: 'accountId, accountName, enterpriseId, and enterpriseName are required',
            };
        }
        console.log(
            `🔍 getEntity API called for entity: ${entityName}, account: ${accountId} (${accountName}), enterprise: ${enterpriseId} (${enterpriseName})`,
        );
        return await globalSettings.getEntity(
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
            entityName,
        );
    }

    @Post()
    async createEntity(@Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'Global settings only available in DynamoDB mode',
            };
        }
        const {
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
            entityName,
            configuration,
        } = body || {};
        if (
            !accountId ||
            !accountName ||
            !enterpriseId ||
            !enterpriseName ||
            !entityName ||
            !configuration
        ) {
            return {
                error: 'accountId, accountName, enterpriseId, enterpriseName, entityName, and configuration are required',
            };
        }
        console.log(
            '🆕 createEntity API called with payload:',
            JSON.stringify(
                {
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                    entityName,
                },
                null,
                2,
            ),
        );
        return await globalSettings.createEntity({
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
            entityName,
            configuration,
        });
    }

    @Put(':id')
    async updateEntity(@Param('id') recordId: string, @Body() body: any) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'Global settings only available in DynamoDB mode',
            };
        }
        const {
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
            entityName,
            entities,
            configuration,
        } = body || {};

        if (
            !accountId ||
            !accountName ||
            !enterpriseId ||
            !enterpriseName ||
            !configuration
        ) {
            return {
                error: 'accountId, accountName, enterpriseId, enterpriseName, and configuration are required',
            };
        }

        // Extract entity name from entities array if provided, otherwise use entityName
        let finalEntityName = entityName;
        if (entities && Array.isArray(entities) && entities.length > 0) {
            finalEntityName = entities[0]; // Use first element of entities array
        }

        if (!finalEntityName) {
            return {
                error: 'entityName or entities array with entity name is required',
            };
        }

        console.log(
            `🔄 updateEntity API called for record ID: ${recordId}, entity: ${finalEntityName}, account: ${accountId} (${accountName}), enterprise: ${enterpriseId} (${enterpriseName})`,
        );
        return await globalSettings.updateEntityById(
            recordId,
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
            finalEntityName,
            configuration,
        );
    }

    @Delete(':entityName')
    async deleteEntity(
        @Param('entityName') entityName: string,
        @Query('accountId') accountId: string,
        @Query('accountName') accountName: string,
        @Query('enterpriseId') enterpriseId: string,
        @Query('enterpriseName') enterpriseName: string,
    ) {
        if (storageMode !== 'dynamodb') {
            return {
                error: 'Global settings only available in DynamoDB mode',
            };
        }
        if (!accountId || !accountName || !enterpriseId || !enterpriseName) {
            return {
                error: 'accountId, accountName, enterpriseId, and enterpriseName are required',
            };
        }
        console.log(
            `🗑️ deleteEntity API called for entity: ${entityName}, account: ${accountId} (${accountName}), enterprise: ${enterpriseId} (${enterpriseName})`,
        );
        await globalSettings.deleteEntity(
            accountId,
            accountName,
            enterpriseId,
            enterpriseName,
            entityName,
        );
        return {};
    }
}

@Module({
    controllers: [
        HealthController,
        AuthController,
        OAuthController,
        OAuthTokenController,
        AccountsController,
        EnterprisesController,
        BusinessUnitsController,
        UsersController,
        UserGroupsController,
        RolesController,
        AttributesController,
        BreadcrumbController,
        AiController,
        TemplatesController,
        PipelineYamlController,
        PipelineConfigController,
        EnvironmentsController,
        ServicesController,
        ProductsController,
        PipelinesController,
        PipelineDetailsController,
        PipelineServicesController,
        PipelineCanvasController,
        BuildsController,
        BuildExecutionsController,
        GroupsController,
        EnterpriseProductsServicesController,
        AccountLicensesController,
        UserManagementController,
        GlobalSettingsController,
        ConnectorsController,
    ],
})
export class AppModule {}

async function bootstrap() {
    try {
        console.log('Starting DevOps Automate Backend...');
        console.log('Environment:', process.env.NODE_ENV || 'development');
        console.log('Storage Mode:', process.env.STORAGE_MODE || 'postgres');

        // Check GitHub OAuth configuration
        if (
            !process.env.GITHUB_CLIENT_ID ||
            !process.env.GITHUB_CLIENT_SECRET
        ) {
            console.warn('⚠️  WARNING: GitHub OAuth is not configured!');
            console.warn(
                '   Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables',
            );
            console.warn(
                '   GitHub OAuth endpoints will return errors until configured.',
            );
        } else {
            console.log('✅ GitHub OAuth configuration found');
        }

        // Check token encryption key
        if (
            !process.env.TOKEN_ENCRYPTION_KEY &&
            !process.env.PASSWORD_ENCRYPTION_KEY
        ) {
            console.warn(
                '⚠️  WARNING: Token encryption key is not configured!',
            );
            console.warn(
                '   Set TOKEN_ENCRYPTION_KEY or PASSWORD_ENCRYPTION_KEY environment variable',
            );
            console.warn(
                '   Token storage will fail until encryption key is configured.',
            );
        } else {
            console.log('✅ Token encryption key configured');
        }

        // Load environment variables from config.env file (for local development)
        dotenv.config({path: 'config.env'});
        dotenv.config(); // Also load from .env if it exists

        // Note: storageMode is already initialized at module load time
        // This is just for logging and connection testing in standalone mode
        const currentStorageMode = process.env.STORAGE_MODE || 'dynamodb';
        console.log('Bootstrap - Storage Mode:', currentStorageMode);
        console.log('Bootstrap - Services already initialized:', {
            accountsDynamoDB: !!accountsDynamoDB,
            enterprises: !!enterprises,
            services: !!services,
        });
        console.log(
            'Use In-Memory DynamoDB:',
            process.env.USE_IN_MEMORY_DYNAMODB,
        );

        if (currentStorageMode === 'postgres') {
            console.log('Testing PostgreSQL connection...');
            const dbConnected = await testConnection();
            if (!dbConnected) {
                console.error(
                    'Failed to connect to PostgreSQL. Please check your database configuration.',
                );
                process.exit(1);
            }
            console.log('PostgreSQL connection successful!');
        } else if (currentStorageMode === 'dynamodb') {
            console.log('Testing DynamoDB connection...');
            const dynamoConnected = await testDynamoDBConnection();
            if (!dynamoConnected) {
                console.error(
                    'Failed to connect to DynamoDB. Please check your AWS configuration and table setup.',
                );
                console.error('Required environment variables:');
                console.error('- AWS_REGION (default: us-east-1)');
                console.error('- AWS_ACCESS_KEY_ID (if not using IAM roles)');
                console.error(
                    '- AWS_SECRET_ACCESS_KEY (if not using IAM roles)',
                );
                console.error(
                    '- DYNAMODB_ENTERPRISE_TABLE (default: EnterpriseConfig)',
                );
                console.error(
                    '- DYNAMODB_ENDPOINT (optional, for local DynamoDB)',
                );
                process.exit(1);
            }
            console.log('DynamoDB connection successful!');
        }

        // Services are already initialized at module load time
        // This section is kept for backward compatibility and logging
        console.log('Services status for storage mode:', currentStorageMode);
        console.log(
            '  accountsDynamoDB:',
            accountsDynamoDB ? 'initialized' : 'not initialized',
        );
        console.log(
            '  enterprises:',
            enterprises ? 'initialized' : 'not initialized',
        );

        // Re-initialize services only if not already done (should not happen normally)
        if (currentStorageMode === 'dynamodb' && !accountsDynamoDB) {
            console.log(
                '⚠️ Re-initializing DynamoDB services in bootstrap (this should not happen)',
            );
            accountsDynamoDB = new AccountsDynamoDBService();
            enterprises = new EnterprisesDynamoDBService(STORAGE_DIR);
            services = new ServicesDynamoDBService(STORAGE_DIR);
            products = new ProductsDynamoDBService(STORAGE_DIR);
            enterpriseProductsServices =
                new EnterpriseProductsServicesDynamoDBService(STORAGE_DIR);
            accountLicenses = new AccountLicensesDynamoDBService();
            userManagement = new UserManagementDynamoDBService();
            environments = new EnvironmentsDynamoDBService();
            globalSettings = new GlobalSettingsDynamoDBService();
            pipelineCanvasDynamoDB = new PipelineCanvasDynamoDBService();
            buildExecutionsDynamoDB = new BuildExecutionsDynamoDBService();
            buildsDynamoDB = new BuildsDynamoDBService();
            AccessControl_Service = new AccessControl_DynamoDBService();
        } else if (currentStorageMode !== 'dynamodb' && !enterprises) {
            console.log('⚠️ Re-initializing filesystem services in bootstrap');
            enterprises = new EnterprisesService(STORAGE_DIR);
            services = new ServicesService(STORAGE_DIR);
            products = new ProductsService(STORAGE_DIR);
            enterpriseProductsServices = new EnterpriseProductsServicesService(
                STORAGE_DIR,
            );
            environments = new EnvironmentsService(STORAGE_DIR);
            // For non-DynamoDB modes, we'll still use legacy services
            console.log(
                'Using legacy AccessControl services (PostgreSQL/filesystem)',
            );
        }

        console.log('Services initialized successfully!');

        // Validate password encryption configuration
        console.log('🔐 Validating password encryption configuration...');
        if (!validatePasswordEncryptionConfig()) {
            console.error('❌ Password encryption configuration is invalid!');
            process.exit(1);
        }

        // Create the NestJS application
        const app = await NestFactory.create(AppModule);

        // SECURITY: Apply rate limiting middleware
        const helmet = require('helmet');
        const {
            loginRateLimiter,
            apiRateLimiter,
        } = require('./middleware/rateLimiter.middleware');

        // SECURITY: Add security headers with helmet
        app.use(
            helmet({
                contentSecurityPolicy: process.env.NODE_ENV === 'production',
                hsts: {
                    maxAge: 31536000,
                    includeSubDomains: true,
                    preload: true,
                },
            }),
        );

        // SECURITY: Apply rate limiting to login endpoint
        // SECURITY: Configure CORS properly - MUST be before rate limiting
        const allowedOrigins = process.env.ALLOWED_ORIGINS
            ? process.env.ALLOWED_ORIGINS.split(',')
            : ['http://localhost:3000', 'http://44.200.152.246:3000'];

        app.enableCors({
            origin: (origin, callback) => {
                // Allow requests with no origin (like mobile apps or curl requests)
                if (!origin) return callback(null, true);

                if (allowedOrigins.includes(origin)) {
                    callback(null, true);
                } else {
                    callback(new Error('Not allowed by CORS'));
                }
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization'],
        });

        app.use('/api/auth/login', loginRateLimiter);

        // SECURITY: Apply general rate limiting to all API routes
        app.use('/api', apiRateLimiter);

        // Skip seeding - using existing fnd_ tables
        console.log('Using existing database schema with fnd_ tables...');

        const PORT = Number(process.env.PORT || 4000);
        const HOST = process.env.HOST || 'localhost';
        await app.listen(PORT);

        console.log(`🚀 DevOps Automate Backend is running on port ${PORT}`);
        console.log(`📊 Health check: http://${HOST}:${PORT}/health`);
        console.log(`🔧 API endpoints: http://${HOST}:${PORT}/api`);
        console.log(
            `🔒 Security features enabled: JWT auth, rate limiting, helmet headers`,
        );

        // SECURITY: Warn if using HTTP in production
        if (process.env.NODE_ENV === 'production' && !process.env.FORCE_HTTPS) {
            console.warn(
                '⚠️  WARNING: Running in production without HTTPS enforcement!',
            );
            console.warn(
                '   Set FORCE_HTTPS=true and configure SSL/TLS for production.',
            );
        }
    } catch (error) {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
}

// Only run bootstrap when NOT in Lambda environment
// Lambda uses index.ts handler which creates the app differently
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    bootstrap();
}
