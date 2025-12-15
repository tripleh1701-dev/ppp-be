import {v4 as uuidv4} from 'uuid';
import {getStorageMode} from '../dynamodb';
import {withPg} from '../db';
import {DynamoDBOperations} from '../dynamodb';
import {encryptToken, decryptToken, EncryptedToken} from '../utils/tokenEncryption';

export interface GitHubOAuthToken {
    id: string;
    userId?: string;
    accountId?: string;
    accountName?: string;
    enterpriseId?: string;
    enterpriseName?: string;
    workstream?: string;
    accessToken: string; // Encrypted when stored
    tokenType: string;
    scope?: string;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
}

export interface StoreTokenParams {
    userId?: string;
    accountId?: string;
    accountName?: string;
    enterpriseId?: string;
    enterpriseName?: string;
    workstream?: string;
    accessToken: string;
    tokenType?: string;
    scope?: string;
    expiresAt?: string;
}

export class GitHubOAuthService {
    private readonly tableName: string;

    constructor() {
        this.tableName = process.env.DYNAMODB_SYSTIVA_TABLE || 'systiva';
    }

    /**
     * Store GitHub OAuth access token securely
     */
    async storeAccessToken(params: StoreTokenParams): Promise<GitHubOAuthToken> {
        const storageMode = getStorageMode();
        const now = new Date().toISOString();
        const tokenId = uuidv4();

        // Encrypt the access token before storing
        const encryptedTokenData = encryptToken(params.accessToken);

        const tokenData: GitHubOAuthToken = {
            id: tokenId,
            userId: params.userId,
            accountId: params.accountId,
            accountName: params.accountName,
            enterpriseId: params.enterpriseId,
            enterpriseName: params.enterpriseName,
            workstream: params.workstream,
            accessToken: JSON.stringify(encryptedTokenData), // Store encrypted token as JSON string
            tokenType: params.tokenType || 'bearer',
            scope: params.scope,
            createdAt: now,
            updatedAt: now,
            expiresAt: params.expiresAt,
        };

        if (storageMode === 'dynamodb') {
            return this.storeTokenDynamoDB(tokenData);
        } else if (storageMode === 'postgres') {
            return this.storeTokenPostgres(tokenData);
        } else {
            throw new Error('Token storage not supported for filesystem mode. Use postgres or dynamodb.');
        }
    }

    /**
     * Store token in DynamoDB
     */
    private async storeTokenDynamoDB(tokenData: GitHubOAuthToken): Promise<GitHubOAuthToken> {
        // Create a composite key based on context
        const contextKey = this.buildContextKey(
            tokenData.accountId,
            tokenData.accountName,
            tokenData.enterpriseId,
            tokenData.enterpriseName,
        );

        const PK = `GITHUB_OAUTH#${contextKey}`;
        const SK = `TOKEN#${tokenData.id}`;

        // If userId is provided, also create a user-specific lookup
        if (tokenData.userId) {
            const userPK = `USER#${tokenData.userId}#GITHUB_OAUTH`;
            const userSK = `TOKEN#${tokenData.id}`;

            // Store user-specific lookup
            await DynamoDBOperations.putItem(this.tableName, {
                PK: userPK,
                SK: userSK,
                ...tokenData,
                entity_type: 'GITHUB_OAUTH_TOKEN',
            });
        }

        // Store main token record
        const item = {
            PK,
            SK,
            ...tokenData,
            entity_type: 'GITHUB_OAUTH_TOKEN',
        };

        await DynamoDBOperations.putItem(this.tableName, item);

        // Remove encrypted token from response
        const {accessToken, ...responseData} = tokenData;
        return responseData as GitHubOAuthToken;
    }

    /**
     * Store token in PostgreSQL
     */
    private async storeTokenPostgres(tokenData: GitHubOAuthToken): Promise<GitHubOAuthToken> {
        return withPg(async (client) => {
            // Check if table exists, create if not
            await client.query(`
                CREATE TABLE IF NOT EXISTS systiva.github_oauth_tokens (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID,
                    account_id VARCHAR(255),
                    account_name VARCHAR(255),
                    enterprise_id VARCHAR(255),
                    enterprise_name VARCHAR(255),
                    workstream VARCHAR(255),
                    access_token TEXT NOT NULL,
                    token_type VARCHAR(50) DEFAULT 'bearer',
                    scope TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    expires_at TIMESTAMP WITH TIME ZONE
                )
            `);

            // Create unique index for non-null combinations
            // PostgreSQL treats NULLs specially in UNIQUE constraints, so we use a partial unique index
            await client.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_github_oauth_unique 
                ON systiva.github_oauth_tokens(user_id, account_id, enterprise_id)
                WHERE user_id IS NOT NULL AND account_id IS NOT NULL AND enterprise_id IS NOT NULL
            `);

            // Create regular indexes for querying
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_github_oauth_user_account_enterprise 
                ON systiva.github_oauth_tokens(user_id, account_id, enterprise_id)
            `);

            // Check if a token already exists for this combination
            const existingToken = await client.query(
                `SELECT id FROM systiva.github_oauth_tokens 
                 WHERE (user_id = $1 OR ($1 IS NULL AND user_id IS NULL))
                   AND (account_id = $2 OR ($2 IS NULL AND account_id IS NULL))
                   AND (enterprise_id = $3 OR ($3 IS NULL AND enterprise_id IS NULL))
                 LIMIT 1`,
                [
                    tokenData.userId || null,
                    tokenData.accountId || null,
                    tokenData.enterpriseId || null,
                ],
            );

            let result;
            if (existingToken.rows.length > 0) {
                // Update existing token
                result = await client.query(
                    `UPDATE systiva.github_oauth_tokens 
                     SET access_token = $1,
                         token_type = $2,
                         scope = $3,
                         updated_at = $4,
                         expires_at = $5,
                         account_name = $6,
                         enterprise_name = $7,
                         workstream = $8
                     WHERE id = $9
                     RETURNING *`,
                    [
                        tokenData.accessToken,
                        tokenData.tokenType,
                        tokenData.scope || null,
                        tokenData.updatedAt,
                        tokenData.expiresAt || null,
                        tokenData.accountName || null,
                        tokenData.enterpriseName || null,
                        tokenData.workstream || null,
                        existingToken.rows[0].id,
                    ],
                );
            } else {
                // Insert new token
                result = await client.query(
                    `INSERT INTO systiva.github_oauth_tokens 
                     (id, user_id, account_id, account_name, enterprise_id, enterprise_name, 
                      workstream, access_token, token_type, scope, created_at, updated_at, expires_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                     RETURNING *`,
                    [
                        tokenData.id,
                        tokenData.userId || null,
                        tokenData.accountId || null,
                        tokenData.accountName || null,
                        tokenData.enterpriseId || null,
                        tokenData.enterpriseName || null,
                        tokenData.workstream || null,
                        tokenData.accessToken,
                        tokenData.tokenType,
                        tokenData.scope || null,
                        tokenData.createdAt,
                        tokenData.updatedAt,
                        tokenData.expiresAt || null,
                    ],
                );
            }

            const storedToken = result.rows[0];
            // Remove access token from response
            const {access_token, ...responseData} = storedToken;
            return {
                ...responseData,
                id: responseData.id,
                accessToken: '[REDACTED]',
            } as GitHubOAuthToken;
        });
    }

    /**
     * Retrieve GitHub access token
     */
    async getAccessToken(params: {
        userId?: string;
        accountId?: string;
        accountName?: string;
        enterpriseId?: string;
        enterpriseName?: string;
    }): Promise<string | null> {
        const storageMode = getStorageMode();

        if (storageMode === 'dynamodb') {
            return this.getTokenDynamoDB(params);
        } else if (storageMode === 'postgres') {
            return this.getTokenPostgres(params);
        } else {
            throw new Error('Token retrieval not supported for filesystem mode. Use postgres or dynamodb.');
        }
    }

    /**
     * Get token from DynamoDB
     */
    private async getTokenDynamoDB(params: {
        userId?: string;
        accountId?: string;
        accountName?: string;
        enterpriseId?: string;
        enterpriseName?: string;
    }): Promise<string | null> {
        const contextKey = this.buildContextKey(
            params.accountId,
            params.accountName,
            params.enterpriseId,
            params.enterpriseName,
        );

        const PK = `GITHUB_OAUTH#${contextKey}`;

        // Query for tokens matching the context
        const items = await DynamoDBOperations.queryItems(
            this.tableName,
            'PK = :pk',
            {':pk': PK},
        );

        if (!items || items.length === 0) {
            return null;
        }

        // Get the most recent token
        const tokenItem = items.sort(
            (a, b) =>
                new Date(b.created_at || b.createdAt || 0).getTime() -
                new Date(a.created_at || a.createdAt || 0).getTime(),
        )[0];

        // Decrypt the token
        try {
            const encryptedTokenData: EncryptedToken = JSON.parse(
                tokenItem.access_token || tokenItem.accessToken,
            );
            const decrypted = decryptToken(encryptedTokenData);
            return decrypted.token;
        } catch (error) {
            console.error('Failed to decrypt token:', error);
            return null;
        }
    }

    /**
     * Get token from PostgreSQL
     */
    private async getTokenPostgres(params: {
        userId?: string;
        accountId?: string;
        accountName?: string;
        enterpriseId?: string;
        enterpriseName?: string;
    }): Promise<string | null> {
        return withPg(async (client) => {
            const result = await client.query(
                `SELECT access_token FROM systiva.github_oauth_tokens 
                 WHERE (user_id = $1 OR $1 IS NULL)
                   AND (account_id = $2 OR $2 IS NULL)
                   AND (enterprise_id = $3 OR $3 IS NULL)
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [params.userId || null, params.accountId || null, params.enterpriseId || null],
            );

            if (!result.rows || result.rows.length === 0) {
                return null;
            }

            // Decrypt the token
            try {
                const encryptedTokenData: EncryptedToken = JSON.parse(
                    result.rows[0].access_token,
                );
                const decrypted = decryptToken(encryptedTokenData);
                return decrypted.token;
            } catch (error) {
                console.error('Failed to decrypt token:', error);
                return null;
            }
        });
    }

    /**
     * Build a context key for DynamoDB partitioning
     */
    private buildContextKey(
        accountId?: string,
        accountName?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): string {
        const parts: string[] = [];
        if (enterpriseId) parts.push(`ENT#${enterpriseId}`);
        if (enterpriseName) parts.push(`ENT_NAME#${enterpriseName}`);
        if (accountId) parts.push(`ACC#${accountId}`);
        if (accountName) parts.push(`ACC_NAME#${accountName}`);
        return parts.length > 0 ? parts.join('#') : 'DEFAULT';
    }
}

