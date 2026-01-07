/**
 * Cognito Authentication Service
 * Proxies authentication requests to the IMS Service via API Gateway
 * This enables Cognito user login for the Sys App
 */
import axios from 'axios';

// IMS API Base URL - uses the API Gateway URL from environment
const IMS_API_URL = process.env.IMS_API_URL || process.env.NEXT_PUBLIC_API_BASE_URL || '';

export interface CognitoAuthResult {
    success: boolean;
    requiresPasswordChange?: boolean;
    challengeName?: string;
    session?: string;
    tokens?: {
        AccessToken: string;
        RefreshToken?: string;
        IdToken?: string;
        TokenType?: string;
        ExpiresIn?: number;
    };
    user?: {
        username: string;
        email: string;
        userRoles?: string[];
        tenantId?: string;
        permissions?: string[];
        groups?: any[];
    };
    message?: string;
    error?: string;
}

export class CognitoAuthService {
    private imsApiUrl: string;

    constructor() {
        this.imsApiUrl = IMS_API_URL;
        if (!this.imsApiUrl) {
            console.warn('⚠️ IMS_API_URL not configured. Cognito authentication will not work.');
        }
    }

    /**
     * Check if Cognito auth is available
     */
    isAvailable(): boolean {
        return !!this.imsApiUrl;
    }

    /**
     * Authenticate user with Cognito via IMS Service
     */
    async login(username: string, password: string): Promise<CognitoAuthResult> {
        if (!this.imsApiUrl) {
            return {
                success: false,
                error: 'IMS API URL not configured'
            };
        }

        try {
            // Call the IMS auth/login endpoint
            const response = await axios.post(
                `${this.imsApiUrl}/auth/login`,
                { username, password },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const data = response.data;

            // Handle NEW_PASSWORD_REQUIRED challenge
            if (data.requiresPasswordChange || data.challengeName === 'NEW_PASSWORD_REQUIRED') {
                return {
                    success: false,
                    requiresPasswordChange: true,
                    challengeName: data.challengeName,
                    session: data.session,
                    user: data.user,
                    message: data.message || 'Password change required on first login'
                };
            }

            // Successful authentication
            if (data.success && data.tokens) {
                return {
                    success: true,
                    tokens: data.tokens,
                    user: data.user
                };
            }

            return {
                success: false,
                error: data.message || 'Authentication failed'
            };
        } catch (error: any) {
            console.error('Cognito auth error:', error.response?.data || error.message);

            // Handle specific error responses
            if (error.response?.status === 401) {
                return {
                    success: false,
                    error: error.response?.data?.message || 'Invalid username or password'
                };
            }

            return {
                success: false,
                error: error.response?.data?.message || 'Authentication service unavailable'
            };
        }
    }

    /**
     * Complete NEW_PASSWORD_REQUIRED challenge
     */
    async completeNewPasswordChallenge(
        username: string,
        newPassword: string,
        session: string
    ): Promise<CognitoAuthResult> {
        if (!this.imsApiUrl) {
            return {
                success: false,
                error: 'IMS API URL not configured'
            };
        }

        try {
            const response = await axios.post(
                `${this.imsApiUrl}/auth/complete-new-password-challenge`,
                { username, newPassword, session },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            const data = response.data;

            if (data.success && data.tokens) {
                return {
                    success: true,
                    tokens: data.tokens,
                    user: data.user,
                    message: 'Password updated successfully'
                };
            }

            return {
                success: false,
                error: data.message || 'Failed to update password'
            };
        } catch (error: any) {
            console.error('Password change error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || 'Failed to update password'
            };
        }
    }

    /**
     * Validate token with IMS Service
     */
    async validateToken(token: string): Promise<CognitoAuthResult> {
        if (!this.imsApiUrl) {
            return {
                success: false,
                error: 'IMS API URL not configured'
            };
        }

        try {
            const response = await axios.post(
                `${this.imsApiUrl}/auth/validate`,
                {},
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    timeout: 10000
                }
            );

            const data = response.data;

            if (data.success) {
                return {
                    success: true,
                    user: data.user
                };
            }

            return {
                success: false,
                error: 'Invalid token'
            };
        } catch (error: any) {
            return {
                success: false,
                error: 'Token validation failed'
            };
        }
    }

    /**
     * Refresh access token
     */
    async refreshToken(refreshToken: string): Promise<CognitoAuthResult> {
        if (!this.imsApiUrl) {
            return {
                success: false,
                error: 'IMS API URL not configured'
            };
        }

        try {
            const response = await axios.post(
                `${this.imsApiUrl}/auth/refresh`,
                { refreshToken },
                {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                }
            );

            const data = response.data;

            if (data.success && data.tokens) {
                return {
                    success: true,
                    tokens: data.tokens
                };
            }

            return {
                success: false,
                error: 'Token refresh failed'
            };
        } catch (error: any) {
            return {
                success: false,
                error: 'Token refresh failed'
            };
        }
    }
}
