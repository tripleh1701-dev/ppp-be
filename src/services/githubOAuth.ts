import {v4 as uuidv4} from 'uuid';
import {getStorageMode} from '../dynamodb';
import {withPg} from '../db';
import {DynamoDBOperations} from '../dynamodb';
import {
    encryptToken,
    decryptToken,
    EncryptedToken,
} from '../utils/tokenEncryption';

export interface GitHubOAuthToken {
    id: string;
    userId?: string;
    accountId?: string;
    accountName?: string;
    enterpriseId?: string;
    enterpriseName?: string;
    workstream?: string;
    product?: string;
    service?: string;
    credentialName?: string;
    connectorName?: string;
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
    product?: string;
    service?: string;
    credentialName?: string;
    connectorName?: string;
    accessToken: string;
    tokenType?: string;
    scope?: string;
    expiresAt?: string;
}

export class GitHubOAuthService {
    private readonly tableName: string;

    constructor() {
        this.tableName =
            process.env.DYNAMODB_TABLE ||
            `systiva-admin-${
                process.env.WORKSPACE || process.env.NODE_ENV || 'dev'
            }`;
    }

    /**
     * Store GitHub OAuth access token securely
     */
    async storeAccessToken(
        params: StoreTokenParams,
    ): Promise<GitHubOAuthToken> {
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
            product: params.product,
            service: params.service,
            credentialName: params.credentialName,
            connectorName: params.connectorName,
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
            throw new Error(
                'Token storage not supported for filesystem mode. Use postgres or dynamodb.',
            );
        }
    }

    /**
     * Store token in DynamoDB
     */
    private async storeTokenDynamoDB(
        tokenData: GitHubOAuthToken,
    ): Promise<GitHubOAuthToken> {
        console.log(
            '💾 [GitHubOAuth] storeTokenDynamoDB called with tokenData:',
            {
                id: tokenData.id,
                accountId: tokenData.accountId,
                accountName: tokenData.accountName,
                enterpriseId: tokenData.enterpriseId,
                enterpriseName: tokenData.enterpriseName,
                workstream: tokenData.workstream,
                product: tokenData.product,
                service: tokenData.service,
                userId: tokenData.userId,
            },
        );

        // Create a composite key based on context
        const contextKey = this.buildContextKey(
            tokenData.accountId,
            tokenData.accountName,
            tokenData.enterpriseId,
            tokenData.enterpriseName,
            tokenData.workstream,
            tokenData.product,
            tokenData.service,
        );

        const PK = `GITHUB_OAUTH#${contextKey}`;
        const SK = `TOKEN#${tokenData.id}`;

        console.log('💾 [GitHubOAuth] Generated contextKey:', contextKey);
        console.log('💾 [GitHubOAuth] Storing token with PK:', PK, 'SK:', SK);

        if (contextKey === 'DEFAULT') {
            console.warn(
                '⚠️ [GitHubOAuth] WARNING: Token being stored with DEFAULT context key! This means no context parameters were provided.',
            );
            console.warn('⚠️ [GitHubOAuth] Provided parameters:', {
                hasAccountId: !!tokenData.accountId,
                hasAccountName: !!tokenData.accountName,
                hasEnterpriseId: !!tokenData.enterpriseId,
                hasEnterpriseName: !!tokenData.enterpriseName,
                hasWorkstream: !!tokenData.workstream,
                hasProduct: !!tokenData.product,
                hasService: !!tokenData.service,
            });
        }

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
        // Explicitly include all fields to ensure they're stored even if undefined
        const item = {
            PK,
            SK,
            id: tokenData.id,
            user_id: tokenData.userId || null,
            userId: tokenData.userId || null,
            account_id: tokenData.accountId || null,
            accountId: tokenData.accountId || null,
            account_name: tokenData.accountName || null,
            accountName: tokenData.accountName || null,
            enterprise_id: tokenData.enterpriseId || null,
            enterpriseId: tokenData.enterpriseId || null,
            enterprise_name: tokenData.enterpriseName || null,
            enterpriseName: tokenData.enterpriseName || null,
            workstream: tokenData.workstream || null,
            product: tokenData.product || null,
            service: tokenData.service || null,
            credential_name: tokenData.credentialName || null,
            credentialName: tokenData.credentialName || null,
            connector_name: tokenData.connectorName || null,
            connectorName: tokenData.connectorName || null,
            access_token: tokenData.accessToken,
            accessToken: tokenData.accessToken,
            token_type: tokenData.tokenType,
            tokenType: tokenData.tokenType,
            scope: tokenData.scope || null,
            created_at: tokenData.createdAt,
            createdAt: tokenData.createdAt,
            updated_at: tokenData.updatedAt,
            updatedAt: tokenData.updatedAt,
            expires_at: tokenData.expiresAt || null,
            expiresAt: tokenData.expiresAt || null,
            entity_type: 'GITHUB_OAUTH_TOKEN',
        };

        console.log('💾 [GitHubOAuth] Item to store:', {
            PK: item.PK,
            accountId: item.accountId,
            account_id: item.account_id,
            enterpriseId: item.enterpriseId,
            enterprise_id: item.enterprise_id,
            workstream: item.workstream,
            product: item.product,
            service: item.service,
        });

        await DynamoDBOperations.putItem(this.tableName, item);

        console.log('✅ [GitHubOAuth] Token stored successfully in DynamoDB');

        // Remove encrypted token from response
        const {accessToken, ...responseData} = tokenData;
        return responseData as GitHubOAuthToken;
    }

    /**
     * Store token in PostgreSQL
     */
    private async storeTokenPostgres(
        tokenData: GitHubOAuthToken,
    ): Promise<GitHubOAuthToken> {
        return withPg(async (client) => {
            console.log(
                '💾 [GitHubOAuth] storeTokenPostgres called with tokenData:',
                {
                    id: tokenData.id,
                    accountId: tokenData.accountId,
                    accountName: tokenData.accountName,
                    enterpriseId: tokenData.enterpriseId,
                    enterpriseName: tokenData.enterpriseName,
                    workstream: tokenData.workstream,
                    product: tokenData.product,
                    service: tokenData.service,
                    userId: tokenData.userId,
                },
            );

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
                    product VARCHAR(255),
                    service VARCHAR(255),
                    credential_name VARCHAR(255),
                    connector_name VARCHAR(255),
                    access_token TEXT NOT NULL,
                    token_type VARCHAR(50) DEFAULT 'bearer',
                    scope TEXT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    expires_at TIMESTAMP WITH TIME ZONE
                )
            `);

            // Add product, service, credential_name, and connector_name columns if they don't exist (for existing tables)
            await client.query(`
                DO $$
                BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_schema = 'systiva'
                                   AND table_name = 'github_oauth_tokens'
                                   AND column_name = 'product') THEN
                        ALTER TABLE systiva.github_oauth_tokens ADD COLUMN product VARCHAR(255);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_schema = 'systiva'
                                   AND table_name = 'github_oauth_tokens'
                                   AND column_name = 'service') THEN
                        ALTER TABLE systiva.github_oauth_tokens ADD COLUMN service VARCHAR(255);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_schema = 'systiva'
                                   AND table_name = 'github_oauth_tokens'
                                   AND column_name = 'credential_name') THEN
                        ALTER TABLE systiva.github_oauth_tokens ADD COLUMN credential_name VARCHAR(255);
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                                   WHERE table_schema = 'systiva'
                                   AND table_name = 'github_oauth_tokens'
                                   AND column_name = 'connector_name') THEN
                        ALTER TABLE systiva.github_oauth_tokens ADD COLUMN connector_name VARCHAR(255);
                    END IF;
                END $$;
            `);

            // Create indexes for credential_name and connector_name lookups
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_github_oauth_credential
                ON systiva.github_oauth_tokens(credential_name, account_id, enterprise_id)
            `);
            await client.query(`
                CREATE INDEX IF NOT EXISTS idx_github_oauth_connector
                ON systiva.github_oauth_tokens(connector_name, account_id, enterprise_id)
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
                         workstream = $8,
                         product = $9,
                         service = $10,
                         credential_name = $11,
                         connector_name = $12
                     WHERE id = $13
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
                        tokenData.product || null,
                        tokenData.service || null,
                        tokenData.credentialName || null,
                        tokenData.connectorName || null,
                        existingToken.rows[0].id,
                    ],
                );
            } else {
                // Insert new token
                result = await client.query(
                    `INSERT INTO systiva.github_oauth_tokens
                     (id, user_id, account_id, account_name, enterprise_id, enterprise_name,
                      workstream, product, service, credential_name, connector_name, access_token, token_type, scope, created_at, updated_at, expires_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                     RETURNING *`,
                    [
                        tokenData.id,
                        tokenData.userId || null,
                        tokenData.accountId || null,
                        tokenData.accountName || null,
                        tokenData.enterpriseId || null,
                        tokenData.enterpriseName || null,
                        tokenData.workstream || null,
                        tokenData.product || null,
                        tokenData.service || null,
                        tokenData.credentialName || null,
                        tokenData.connectorName || null,
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
            console.log(
                '✅ [GitHubOAuth] Token stored successfully in PostgreSQL:',
                {
                    id: storedToken.id,
                    accountId: storedToken.account_id,
                    enterpriseId: storedToken.enterprise_id,
                },
            );

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
        workstream?: string;
        product?: string;
        service?: string;
    }): Promise<string | null> {
        const storageMode = getStorageMode();

        if (storageMode === 'dynamodb') {
            return this.getTokenDynamoDB(params);
        } else if (storageMode === 'postgres') {
            return this.getTokenPostgres(params);
        } else {
            throw new Error(
                'Token retrieval not supported for filesystem mode. Use postgres or dynamodb.',
            );
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
        workstream?: string;
        product?: string;
        service?: string;
    }): Promise<string | null> {
        console.log('🔍 [GitHubOAuth] getTokenDynamoDB called with params:', {
            accountId: params.accountId,
            accountName: params.accountName,
            enterpriseId: params.enterpriseId,
            enterpriseName: params.enterpriseName,
            workstream: params.workstream,
            product: params.product,
            service: params.service,
            userId: params.userId,
        });

        // Try multiple lookup strategies to handle cases where parameters might be missing
        const lookupStrategies = [
            // Strategy 1: Full match with all parameters
            this.buildContextKey(
                params.accountId,
                params.accountName,
                params.enterpriseId,
                params.enterpriseName,
                params.workstream,
                params.product,
                params.service,
            ),
            // Strategy 2: Match without accountName (if it was missing during storage)
            this.buildContextKey(
                params.accountId,
                undefined,
                params.enterpriseId,
                params.enterpriseName,
                params.workstream,
                params.product,
                params.service,
            ),
            // Strategy 3: Match without enterpriseName (if it was missing during storage)
            this.buildContextKey(
                params.accountId,
                params.accountName,
                params.enterpriseId,
                undefined,
                params.workstream,
                params.product,
                params.service,
            ),
            // Strategy 4: Match with only IDs and workstream/product/service
            this.buildContextKey(
                params.accountId,
                undefined,
                params.enterpriseId,
                undefined,
                params.workstream,
                params.product,
                params.service,
            ),
            // Strategy 5: Match without workstream/product/service (legacy tokens)
            this.buildContextKey(
                params.accountId,
                params.accountName,
                params.enterpriseId,
                params.enterpriseName,
                undefined,
                undefined,
                undefined,
            ),
            // Strategy 6: Match with only IDs (most basic match)
            this.buildContextKey(
                params.accountId,
                undefined,
                params.enterpriseId,
                undefined,
                undefined,
                undefined,
                undefined,
            ),
        ];

        // Remove duplicates
        const uniqueStrategies = [...new Set(lookupStrategies)];

        console.log(
            '🔍 [GitHubOAuth] Trying lookup strategies:',
            uniqueStrategies,
        );

        for (const contextKey of uniqueStrategies) {
            const PK = `GITHUB_OAUTH#${contextKey}`;
            console.log(`🔍 [GitHubOAuth] Querying with PK: ${PK}`);

            // Query for tokens matching the context
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk',
                {':pk': PK},
            );

            console.log(
                `🔍 [GitHubOAuth] Found ${
                    items?.length || 0
                } items for PK: ${PK}`,
            );

            if (items && items.length > 0) {
                // Filter items by accountId, enterpriseId, workstream, product, and service if provided (for exact match)
                let matchingItems = items;
                if (
                    params.accountId ||
                    params.enterpriseId ||
                    params.workstream ||
                    params.product ||
                    params.service
                ) {
                    matchingItems = items.filter((item: any) => {
                        const matchesAccountId =
                            !params.accountId ||
                            item.account_id === params.accountId ||
                            item.accountId === params.accountId;
                        const matchesEnterpriseId =
                            !params.enterpriseId ||
                            item.enterprise_id === params.enterpriseId ||
                            item.enterpriseId === params.enterpriseId;
                        const matchesWorkstream =
                            !params.workstream ||
                            item.workstream === params.workstream;
                        const matchesProduct =
                            !params.product || item.product === params.product;
                        const matchesService =
                            !params.service || item.service === params.service;
                        return (
                            matchesAccountId &&
                            matchesEnterpriseId &&
                            matchesWorkstream &&
                            matchesProduct &&
                            matchesService
                        );
                    });
                    console.log(
                        `🔍 [GitHubOAuth] Filtered to ${matchingItems.length} items matching accountId/enterpriseId/workstream/product/service`,
                    );
                }

                if (matchingItems.length > 0) {
                    // Get the most recent token
                    const tokenItem = matchingItems.sort(
                        (a, b) =>
                            new Date(
                                b.created_at || b.createdAt || 0,
                            ).getTime() -
                            new Date(
                                a.created_at || a.createdAt || 0,
                            ).getTime(),
                    )[0];

                    console.log('✅ [GitHubOAuth] Found matching token item:', {
                        id: tokenItem.id,
                        accountId: tokenItem.account_id || tokenItem.accountId,
                        enterpriseId:
                            tokenItem.enterprise_id || tokenItem.enterpriseId,
                        createdAt: tokenItem.created_at || tokenItem.createdAt,
                    });

                    // Decrypt the token
                    try {
                        const encryptedTokenData: EncryptedToken = JSON.parse(
                            tokenItem.access_token || tokenItem.accessToken,
                        );
                        const decrypted = decryptToken(encryptedTokenData);
                        console.log(
                            '✅ [GitHubOAuth] Successfully decrypted token',
                        );
                        return decrypted.token;
                    } catch (error) {
                        console.error(
                            '❌ [GitHubOAuth] Failed to decrypt token:',
                            error,
                        );
                        // Continue to next strategy
                    }
                }
            }
        }

        // If PK-based queries failed, try scanning by accountId/enterpriseId directly
        // This handles cases where tokens were stored with accountName/enterpriseName in PK
        // but we only have IDs during lookup
        // Also handles cases where tokens were stored without accountId/enterpriseId (DEFAULT PK)

        // First, try to find account-specific tokens
        if (params.accountId && params.enterpriseId) {
            console.log(
                '🔍 [GitHubOAuth] PK queries failed, trying scan by accountId/enterpriseId',
            );

            try {
                // Scan for all GitHub OAuth tokens, then filter by accountId/enterpriseId
                const allItems = await DynamoDBOperations.scanItems(
                    this.tableName,
                    'entity_type = :entityType',
                    {':entityType': 'GITHUB_OAUTH_TOKEN'},
                );

                console.log(
                    `🔍 [GitHubOAuth] Scanned ${
                        allItems?.length || 0
                    } total OAuth tokens`,
                );

                if (allItems && allItems.length > 0) {
                    // Log sample of stored tokens to debug structure
                    const sampleTokens = allItems.slice(0, 3);
                    console.log(
                        '🔍 [GitHubOAuth] Sample stored tokens (first 3):',
                        sampleTokens.map((item: any) => ({
                            PK: item.PK,
                            accountId: item.account_id || item.accountId,
                            accountName: item.account_name || item.accountName,
                            enterpriseId:
                                item.enterprise_id || item.enterpriseId,
                            enterpriseName:
                                item.enterprise_name || item.enterpriseName,
                            workstream: item.workstream,
                            product: item.product,
                            service: item.service,
                            createdAt: item.created_at || item.createdAt,
                            // Show all keys to see field structure
                            allKeys: Object.keys(item).filter(
                                (k) => !k.startsWith('access_token'),
                            ),
                        })),
                    );

                    // Filter by accountId, enterpriseId, workstream, product, and service (checking both snake_case and camelCase field names)
                    const matchingItems = allItems.filter((item: any) => {
                        const itemAccountId = item.account_id || item.accountId;
                        const itemEnterpriseId =
                            item.enterprise_id || item.enterpriseId;
                        const itemWorkstream = item.workstream;
                        const itemProduct = item.product;
                        const itemService = item.service;

                        const matchesAccountId =
                            !params.accountId ||
                            itemAccountId === params.accountId;
                        const matchesEnterpriseId =
                            !params.enterpriseId ||
                            itemEnterpriseId === params.enterpriseId;
                        const matchesWorkstream =
                            !params.workstream ||
                            itemWorkstream === params.workstream;
                        const matchesProduct =
                            !params.product || itemProduct === params.product;
                        const matchesService =
                            !params.service || itemService === params.service;

                        const matches =
                            matchesAccountId &&
                            matchesEnterpriseId &&
                            matchesWorkstream &&
                            matchesProduct &&
                            matchesService;

                        if (matches) {
                            console.log(
                                '✅ [GitHubOAuth] Found matching token:',
                                {
                                    PK: item.PK,
                                    accountId: itemAccountId,
                                    enterpriseId: itemEnterpriseId,
                                    accountName:
                                        item.account_name || item.accountName,
                                    enterpriseName:
                                        item.enterprise_name ||
                                        item.enterpriseName,
                                    workstream: itemWorkstream,
                                    product: itemProduct,
                                    service: itemService,
                                },
                            );
                        }

                        return matches;
                    });

                    // If no matches, log what we're looking for vs what exists
                    if (matchingItems.length === 0) {
                        console.log(
                            '❌ [GitHubOAuth] No matches found. Looking for:',
                            {
                                accountId: params.accountId,
                                enterpriseId: params.enterpriseId,
                                workstream: params.workstream,
                                product: params.product,
                                service: params.service,
                            },
                        );
                        console.log(
                            '❌ [GitHubOAuth] Available accountIds in stored tokens:',
                            [
                                ...new Set(
                                    allItems
                                        .map(
                                            (item: any) =>
                                                item.account_id ||
                                                item.accountId,
                                        )
                                        .filter(Boolean),
                                ),
                            ].slice(0, 10),
                        );
                        console.log(
                            '❌ [GitHubOAuth] Available enterpriseIds in stored tokens:',
                            [
                                ...new Set(
                                    allItems
                                        .map(
                                            (item: any) =>
                                                item.enterprise_id ||
                                                item.enterpriseId,
                                        )
                                        .filter(Boolean),
                                ),
                            ].slice(0, 10),
                        );
                        console.log(
                            '❌ [GitHubOAuth] Available workstreams in stored tokens:',
                            [
                                ...new Set(
                                    allItems
                                        .map((item: any) => item.workstream)
                                        .filter(Boolean),
                                ),
                            ].slice(0, 10),
                        );
                        console.log(
                            '❌ [GitHubOAuth] Available products in stored tokens:',
                            [
                                ...new Set(
                                    allItems
                                        .map((item: any) => item.product)
                                        .filter(Boolean),
                                ),
                            ].slice(0, 10),
                        );
                        console.log(
                            '❌ [GitHubOAuth] Available services in stored tokens:',
                            [
                                ...new Set(
                                    allItems
                                        .map((item: any) => item.service)
                                        .filter(Boolean),
                                ),
                            ].slice(0, 10),
                        );
                    }

                    console.log(
                        `🔍 [GitHubOAuth] Found ${matchingItems.length} tokens matching accountId/enterpriseId/workstream/product/service after scan`,
                    );

                    if (matchingItems.length > 0) {
                        // Get the most recent token
                        const tokenItem = matchingItems.sort(
                            (a, b) =>
                                new Date(
                                    b.created_at || b.createdAt || 0,
                                ).getTime() -
                                new Date(
                                    a.created_at || a.createdAt || 0,
                                ).getTime(),
                        )[0];

                        console.log(
                            '✅ [GitHubOAuth] Found matching token via scan:',
                            {
                                id: tokenItem.id,
                                accountId:
                                    tokenItem.account_id || tokenItem.accountId,
                                enterpriseId:
                                    tokenItem.enterprise_id ||
                                    tokenItem.enterpriseId,
                                accountName:
                                    tokenItem.account_name ||
                                    tokenItem.accountName,
                                enterpriseName:
                                    tokenItem.enterprise_name ||
                                    tokenItem.enterpriseName,
                                PK: tokenItem.PK,
                                createdAt:
                                    tokenItem.created_at || tokenItem.createdAt,
                            },
                        );

                        // Decrypt the token
                        try {
                            const encryptedTokenData: EncryptedToken =
                                JSON.parse(
                                    tokenItem.access_token ||
                                        tokenItem.accessToken,
                                );
                            const decrypted = decryptToken(encryptedTokenData);
                            console.log(
                                '✅ [GitHubOAuth] Successfully decrypted token from scan',
                            );
                            return decrypted.token;
                        } catch (error) {
                            console.error(
                                '❌ [GitHubOAuth] Failed to decrypt token from scan:',
                                error,
                            );
                        }
                    }
                }
            } catch (scanError) {
                console.error('❌ [GitHubOAuth] Error during scan:', scanError);
            }
        }

        // Fallback: If no account-specific token found, try DEFAULT tokens
        // This handles legacy tokens stored without accountId/enterpriseId
        console.log(
            '🔍 [GitHubOAuth] No account-specific token found, trying DEFAULT tokens',
        );
        try {
            const defaultPK = 'GITHUB_OAUTH#DEFAULT';
            const defaultItems = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk',
                {':pk': defaultPK},
            );

            console.log(
                `🔍 [GitHubOAuth] Found ${
                    defaultItems?.length || 0
                } DEFAULT tokens`,
            );

            if (defaultItems && defaultItems.length > 0) {
                // Get the most recent DEFAULT token
                const tokenItem = defaultItems.sort(
                    (a, b) =>
                        new Date(b.created_at || b.createdAt || 0).getTime() -
                        new Date(a.created_at || a.createdAt || 0).getTime(),
                )[0];

                console.log(
                    '✅ [GitHubOAuth] Using DEFAULT token (legacy token without account context):',
                    {
                        id: tokenItem.id,
                        createdAt: tokenItem.created_at || tokenItem.createdAt,
                    },
                );

                // Decrypt the token
                try {
                    const encryptedTokenData: EncryptedToken = JSON.parse(
                        tokenItem.access_token || tokenItem.accessToken,
                    );
                    const decrypted = decryptToken(encryptedTokenData);
                    console.log(
                        '✅ [GitHubOAuth] Successfully decrypted DEFAULT token',
                    );
                    return decrypted.token;
                } catch (error) {
                    console.error(
                        '❌ [GitHubOAuth] Failed to decrypt DEFAULT token:',
                        error,
                    );
                }
            }
        } catch (defaultError) {
            console.error(
                '❌ [GitHubOAuth] Error querying DEFAULT tokens:',
                defaultError,
            );
        }

        console.log('❌ [GitHubOAuth] No token found with any lookup strategy');
        return null;
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
        workstream?: string;
        product?: string;
        service?: string;
    }): Promise<string | null> {
        return withPg(async (client) => {
            console.log(
                '🔍 [GitHubOAuth] getTokenPostgres called with params:',
                {
                    accountId: params.accountId,
                    accountName: params.accountName,
                    enterpriseId: params.enterpriseId,
                    enterpriseName: params.enterpriseName,
                    userId: params.userId,
                },
            );

            // Try multiple query strategies to handle cases where parameters might be missing
            const queryStrategies = [
                // Strategy 1: Match with accountId and enterpriseId (most specific)
                {
                    query: `SELECT access_token, account_id, enterprise_id, created_at
                            FROM systiva.github_oauth_tokens
                            WHERE account_id = $1 AND enterprise_id = $2
                            ORDER BY created_at DESC
                            LIMIT 1`,
                    params: [params.accountId, params.enterpriseId],
                    name: 'accountId + enterpriseId',
                },
                // Strategy 2: Match with accountId only
                {
                    query: `SELECT access_token, account_id, enterprise_id, created_at
                            FROM systiva.github_oauth_tokens
                            WHERE account_id = $1
                            ORDER BY created_at DESC
                            LIMIT 1`,
                    params: [params.accountId],
                    name: 'accountId only',
                },
                // Strategy 3: Match with enterpriseId only
                {
                    query: `SELECT access_token, account_id, enterprise_id, created_at
                            FROM systiva.github_oauth_tokens
                            WHERE enterprise_id = $1
                            ORDER BY created_at DESC
                            LIMIT 1`,
                    params: [params.enterpriseId],
                    name: 'enterpriseId only',
                },
            ];

            for (const strategy of queryStrategies) {
                // Skip strategies that require missing parameters
                if (strategy.params.some((p) => !p)) {
                    continue;
                }

                console.log(
                    `🔍 [GitHubOAuth] Trying PostgreSQL query strategy: ${strategy.name}`,
                );
                const result = await client.query(
                    strategy.query,
                    strategy.params,
                );

                console.log(
                    `🔍 [GitHubOAuth] Found ${
                        result.rows?.length || 0
                    } rows with strategy: ${strategy.name}`,
                );

                if (result.rows && result.rows.length > 0) {
                    const tokenRow = result.rows[0];
                    console.log('✅ [GitHubOAuth] Found matching token row:', {
                        accountId: tokenRow.account_id,
                        enterpriseId: tokenRow.enterprise_id,
                        createdAt: tokenRow.created_at,
                    });

                    // Decrypt the token
                    try {
                        const encryptedTokenData: EncryptedToken = JSON.parse(
                            tokenRow.access_token,
                        );
                        const decrypted = decryptToken(encryptedTokenData);
                        console.log(
                            '✅ [GitHubOAuth] Successfully decrypted token',
                        );
                        return decrypted.token;
                    } catch (error) {
                        console.error(
                            '❌ [GitHubOAuth] Failed to decrypt token:',
                            error,
                        );
                        // Continue to next strategy
                    }
                }
            }

            console.log(
                '❌ [GitHubOAuth] No token found with any PostgreSQL query strategy',
            );
            return null;
        });
    }

    /**
     * Retrieve GitHub access token by credentialName or connectorName
     * Falls back to accountId/enterpriseId lookup if credentialName/connectorName lookup fails
     */
    async getAccessTokenByCredentialOrConnector(params: {
        credentialName?: string;
        connectorName?: string;
        accountId: string;
        enterpriseId: string;
        accountName?: string;
        enterpriseName?: string;
        workstream?: string;
        product?: string;
        service?: string;
    }): Promise<{
        accessToken: string;
        tokenType: string;
        scope?: string;
        expiresAt?: string;
    } | null> {
        const storageMode = getStorageMode();

        let tokenResult: {
            accessToken: string;
            tokenType: string;
            scope?: string;
            expiresAt?: string;
        } | null = null;

        // First, try to find token by credentialName/connectorName
        if (storageMode === 'dynamodb') {
            tokenResult = await this.getTokenByCredentialOrConnectorDynamoDB(
                params,
            );
        } else if (storageMode === 'postgres') {
            tokenResult = await this.getTokenByCredentialOrConnectorPostgres(
                params,
            );
        } else {
            throw new Error(
                'Token retrieval not supported for filesystem mode. Use postgres or dynamodb.',
            );
        }

        // If not found by credentialName/connectorName, fall back to accountId/enterpriseId lookup
        // This handles cases where tokens were stored before credentialName/connectorName support was added
        if (!tokenResult) {
            console.log(
                '🔍 [GitHubOAuth] Token not found by credential/connector, falling back to accountId/enterpriseId lookup',
            );
            const fallbackToken = await this.getAccessToken({
                accountId: params.accountId,
                accountName: params.accountName,
                enterpriseId: params.enterpriseId,
                enterpriseName: params.enterpriseName,
                workstream: params.workstream,
                product: params.product,
                service: params.service,
            });

            if (fallbackToken) {
                // Return in the expected format
                return {
                    accessToken: fallbackToken,
                    tokenType: 'bearer',
                };
            }
        }

        return tokenResult;
    }

    /**
     * Get token from DynamoDB by credentialName or connectorName
     */
    private async getTokenByCredentialOrConnectorDynamoDB(params: {
        credentialName?: string;
        connectorName?: string;
        accountId: string;
        enterpriseId: string;
    }): Promise<{
        accessToken: string;
        tokenType: string;
        scope?: string;
        expiresAt?: string;
    } | null> {
        console.log(
            '🔍 [GitHubOAuth] getTokenByCredentialOrConnectorDynamoDB called with params:',
            params,
        );

        if (!params.credentialName && !params.connectorName) {
            throw new Error(
                'Either credentialName or connectorName must be provided',
            );
        }

        // Scan for tokens matching credentialName/connectorName and accountId/enterpriseId
        try {
            const allItems = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :entityType',
                {':entityType': 'GITHUB_OAUTH_TOKEN'},
            );

            console.log(
                `🔍 [GitHubOAuth] Scanned ${
                    allItems?.length || 0
                } total OAuth tokens`,
            );

            if (allItems && allItems.length > 0) {
                // Filter by credentialName/connectorName and accountId/enterpriseId
                const matchingItems = allItems.filter((item: any) => {
                    const itemCredentialName =
                        item.credential_name || item.credentialName;
                    const itemConnectorName =
                        item.connector_name || item.connectorName;
                    const itemAccountId = item.account_id || item.accountId;
                    const itemEnterpriseId =
                        item.enterprise_id || item.enterpriseId;

                    const matchesCredential =
                        params.credentialName &&
                        itemCredentialName === params.credentialName;
                    const matchesConnector =
                        params.connectorName &&
                        itemConnectorName === params.connectorName;
                    const matchesAccountId = itemAccountId === params.accountId;
                    const matchesEnterpriseId =
                        itemEnterpriseId === params.enterpriseId;

                    return (
                        (matchesCredential || matchesConnector) &&
                        matchesAccountId &&
                        matchesEnterpriseId
                    );
                });

                console.log(
                    `🔍 [GitHubOAuth] Found ${matchingItems.length} tokens matching credential/connector and account/enterprise`,
                );

                if (matchingItems.length > 0) {
                    // Get the most recent token
                    const tokenItem = matchingItems.sort(
                        (a, b) =>
                            new Date(
                                b.created_at || b.createdAt || 0,
                            ).getTime() -
                            new Date(
                                a.created_at || a.createdAt || 0,
                            ).getTime(),
                    )[0];

                    console.log('✅ [GitHubOAuth] Found matching token:', {
                        id: tokenItem.id,
                        credentialName:
                            tokenItem.credential_name ||
                            tokenItem.credentialName,
                        connectorName:
                            tokenItem.connector_name || tokenItem.connectorName,
                        accountId: tokenItem.account_id || tokenItem.accountId,
                        enterpriseId:
                            tokenItem.enterprise_id || tokenItem.enterpriseId,
                    });

                    // Decrypt the token
                    try {
                        const encryptedTokenData: EncryptedToken = JSON.parse(
                            tokenItem.access_token || tokenItem.accessToken,
                        );
                        const decrypted = decryptToken(encryptedTokenData);
                        console.log(
                            '✅ [GitHubOAuth] Successfully decrypted token',
                        );
                        return {
                            accessToken: decrypted.token,
                            tokenType:
                                tokenItem.token_type ||
                                tokenItem.tokenType ||
                                'bearer',
                            scope: tokenItem.scope,
                            expiresAt:
                                tokenItem.expires_at || tokenItem.expiresAt,
                        };
                    } catch (error) {
                        console.error(
                            '❌ [GitHubOAuth] Failed to decrypt token:',
                            error,
                        );
                        return null;
                    }
                }
            }
        } catch (error) {
            console.error('❌ [GitHubOAuth] Error during scan:', error);
        }

        console.log('❌ [GitHubOAuth] No token found for credential/connector');
        return null;
    }

    /**
     * Get token from PostgreSQL by credentialName or connectorName
     */
    private async getTokenByCredentialOrConnectorPostgres(params: {
        credentialName?: string;
        connectorName?: string;
        accountId: string;
        enterpriseId: string;
    }): Promise<{
        accessToken: string;
        tokenType: string;
        scope?: string;
        expiresAt?: string;
    } | null> {
        return withPg(async (client) => {
            console.log(
                '🔍 [GitHubOAuth] getTokenByCredentialOrConnectorPostgres called with params:',
                params,
            );

            if (!params.credentialName && !params.connectorName) {
                throw new Error(
                    'Either credentialName or connectorName must be provided',
                );
            }

            let query: string;
            let queryParams: any[];

            if (params.credentialName) {
                query = `
                    SELECT access_token, token_type, scope, expires_at
                    FROM systiva.github_oauth_tokens
                    WHERE credential_name = $1
                      AND account_id = $2
                      AND enterprise_id = $3
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                queryParams = [
                    params.credentialName,
                    params.accountId,
                    params.enterpriseId,
                ];
            } else {
                query = `
                    SELECT access_token, token_type, scope, expires_at
                    FROM systiva.github_oauth_tokens
                    WHERE connector_name = $1
                      AND account_id = $2
                      AND enterprise_id = $3
                    ORDER BY created_at DESC
                    LIMIT 1
                `;
                queryParams = [
                    params.connectorName,
                    params.accountId,
                    params.enterpriseId,
                ];
            }

            const result = await client.query(query, queryParams);

            console.log(
                `🔍 [GitHubOAuth] Found ${result.rows?.length || 0} rows`,
            );

            if (result.rows && result.rows.length > 0) {
                const tokenRow = result.rows[0];
                console.log('✅ [GitHubOAuth] Found matching token row');

                // Decrypt the token
                try {
                    const encryptedTokenData: EncryptedToken = JSON.parse(
                        tokenRow.access_token,
                    );
                    const decrypted = decryptToken(encryptedTokenData);
                    console.log(
                        '✅ [GitHubOAuth] Successfully decrypted token',
                    );
                    return {
                        accessToken: decrypted.token,
                        tokenType: tokenRow.token_type || 'bearer',
                        scope: tokenRow.scope,
                        expiresAt: tokenRow.expires_at,
                    };
                } catch (error) {
                    console.error(
                        '❌ [GitHubOAuth] Failed to decrypt token:',
                        error,
                    );
                    return null;
                }
            }

            console.log(
                '❌ [GitHubOAuth] No token found for credential/connector',
            );
            return null;
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
        workstream?: string,
        product?: string,
        service?: string,
    ): string {
        const parts: string[] = [];
        if (enterpriseId) parts.push(`ENT#${enterpriseId}`);
        if (enterpriseName) parts.push(`ENT_NAME#${enterpriseName}`);
        if (accountId) parts.push(`ACC#${accountId}`);
        if (accountName) parts.push(`ACC_NAME#${accountName}`);
        if (workstream) parts.push(`WS#${workstream}`);
        if (product) parts.push(`PROD#${product}`);
        if (service) parts.push(`SVC#${service}`);
        return parts.length > 0 ? parts.join('#') : 'DEFAULT';
    }
}
