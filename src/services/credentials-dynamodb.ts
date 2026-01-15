import {DynamoDBOperations} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';
import {
    CrossAccountDynamoDBService,
    AccountAwsConfig,
} from './crossAccountDynamoDB';
import {AccountsDynamoDBService} from './accounts-dynamodb';

/**
 * Connector interface for credential connectors
 */
export interface CredentialConnector {
    id: string;
    category?: string;
    connector?: string;
    connectorIconName?: string;
    authenticationType?: string;
    serviceKeyDetails?: string;
    url?: string;
    username?: string;
    token?: string;
    password?: string;
}

/**
 * Credential interface matching the frontend table configuration
 */
export interface Credential {
    id: string;
    credentialName: string;
    description?: string;
    entity?: string;
    product?: string;
    service?: string;
    connector?: string;
    connectorIconName?: string;
    connectors?: CredentialConnector[];
    authenticationType?: string;
    scope?: string;
    expiry?: string;
    assignedPipelines?: number;
    status?: string;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    updatedBy?: string;
    // Context fields
    accountId: string;
    accountName?: string;
    enterpriseId?: string;
    enterpriseName?: string;
    // Cross-account fields
    cloudType?: 'public' | 'private';
    awsAccountId?: string;
}

export interface CreateCredentialInput {
    credentialName: string;
    description?: string;
    entity?: string;
    product?: string;
    service?: string;
    connector?: string;
    connectorIconName?: string;
    connectors?: CredentialConnector[];
    authenticationType?: string;
    scope?: string;
    expiry?: string;
    status?: string;
    accountId: string;
    accountName?: string;
    enterpriseId?: string;
    enterpriseName?: string;
    createdBy?: string;
    // Cross-account fields
    cloudType?: 'public' | 'private';
    awsAccountId?: string;
}

export interface UpdateCredentialInput {
    credentialName?: string;
    description?: string;
    entity?: string;
    product?: string;
    service?: string;
    connector?: string;
    connectorIconName?: string;
    connectors?: CredentialConnector[];
    authenticationType?: string;
    scope?: string;
    expiry?: string;
    status?: string;
    updatedBy?: string;
    accountId?: string;
    enterpriseId?: string;
    // Cross-account fields
    cloudType?: 'public' | 'private';
    awsAccountId?: string;
}

/**
 * Credentials DynamoDB Service
 * Follows the Core Entities PK/SK pattern:
 * - PK: ACCOUNT#<accountId>
 * - SK: CREDENTIAL#<credentialId>
 *
 * Supports cross-account access to save credentials in account-specific DynamoDB tables
 * (similar to how pipelines are saved)
 */
export class CredentialsDynamoDBService {
    // Default table (fallback for admin operations)
    private readonly defaultTableName: string;
    // Cross-account DynamoDB service for account-specific tables
    private readonly crossAccountService: CrossAccountDynamoDBService;
    // Accounts service to look up account details (including awsAccountId)
    private readonly accountsService: AccountsDynamoDBService;

    constructor() {
        this.defaultTableName =
            process.env.DYNAMODB_TABLE ||
            process.env.ACCOUNT_REGISTRY_TABLE_NAME ||
            `systiva-admin-${
                process.env.WORKSPACE || process.env.NODE_ENV || 'dev'
            }`;
        this.crossAccountService = new CrossAccountDynamoDBService();
        this.accountsService = new AccountsDynamoDBService();
        console.log(
            `🔑 CredentialsDynamoDBService initialized with default table: ${this.defaultTableName}`,
        );
        console.log(`🔑 Cross-account access enabled for credentials`);
    }

    /**
     * Look up account data to get awsAccountId and cloudType if not provided
     * This ensures credentials are saved to the correct account-specific DynamoDB table
     */
    private async getAccountAwsDetails(
        accountId: string,
        providedAwsAccountId?: string,
        providedCloudType?: 'public' | 'private',
    ): Promise<{
        awsAccountId: string | undefined;
        cloudType: 'public' | 'private';
    }> {
        // If awsAccountId is already provided, use it
        if (providedAwsAccountId) {
            console.log(
                `✅ [Credentials] Using provided awsAccountId: ${providedAwsAccountId}`,
            );
            return {
                awsAccountId: providedAwsAccountId,
                cloudType: providedCloudType || 'public',
            };
        }

        // Look up the account to get its awsAccountId
        try {
            console.log(
                `🔍 [Credentials] Looking up account ${accountId} to get awsAccountId...`,
            );
            const account = await this.accountsService.get(accountId);

            if (account && account.awsAccountId) {
                // Normalize cloudType - handle "Private Cloud", "private", "Public Cloud", "public", etc.
                const rawCloudType =
                    account.cloudType || account.subscriptionTier || '';
                const normalizedCloudType = rawCloudType
                    .toLowerCase()
                    .includes('private')
                    ? 'private'
                    : 'public';
                console.log(
                    `✅ [Credentials] Found account ${accountId} with awsAccountId: ${account.awsAccountId}, cloudType: ${normalizedCloudType}`,
                );
                return {
                    awsAccountId: account.awsAccountId,
                    cloudType: providedCloudType || normalizedCloudType,
                };
            } else {
                console.log(
                    `⚠️ [Credentials] Account ${accountId} found but no awsAccountId set - using admin table`,
                );
                return {
                    awsAccountId: undefined,
                    cloudType: providedCloudType || 'public',
                };
            }
        } catch (error: any) {
            console.error(
                `❌ [Credentials] Error looking up account ${accountId}:`,
                error.message,
            );
            return {
                awsAccountId: undefined,
                cloudType: providedCloudType || 'public',
            };
        }
    }

    /**
     * Get the table name for a specific account
     * Uses cross-account service for account-specific tables
     */
    private getAccountTableName(
        accountId: string,
        cloudType: 'public' | 'private',
    ): string {
        const workspace = process.env.WORKSPACE || 'dev';
        if (cloudType === 'private') {
            return `account-${accountId}-admin-private-${workspace}`;
        }
        return `account-admin-public-${workspace}`;
    }

    /**
     * Generate PK for credentials (matches Core Entities pattern)
     */
    private generatePK(accountId: string): string {
        return `ACCOUNT#${accountId}`;
    }

    /**
     * Generate SK for credentials
     */
    private generateSK(credentialId: string): string {
        return `CREDENTIAL#${credentialId}`;
    }

    /**
     * Create a new credential
     * Saves to account-specific DynamoDB table using cross-account access (like pipelines)
     */
    async create(input: CreateCredentialInput): Promise<Credential> {
        const now = new Date().toISOString();
        const credentialId = uuidv4();

        // Look up account AWS details for cross-account access
        const {awsAccountId, cloudType} = await this.getAccountAwsDetails(
            input.accountId,
            input.awsAccountId,
            input.cloudType,
        );

        const pk = this.generatePK(input.accountId);
        const sk = this.generateSK(credentialId);

        const credential: Credential = {
            id: credentialId,
            credentialName: input.credentialName,
            description: input.description || '',
            entity: input.entity || '',
            product: input.product || '',
            service: input.service || '',
            connector: input.connector || '',
            connectorIconName: input.connectorIconName || '',
            connectors: input.connectors || [],
            authenticationType: input.authenticationType || '',
            scope: input.scope || '',
            expiry: input.expiry || '',
            assignedPipelines: 0,
            status: input.status || 'Active',
            createdAt: now,
            updatedAt: now,
            createdBy: input.createdBy || '',
            accountId: input.accountId,
            accountName: input.accountName || '',
            enterpriseId: input.enterpriseId || '',
            enterpriseName: input.enterpriseName || '',
            cloudType,
            awsAccountId,
        };

        const item = {
            PK: pk,
            SK: sk,
            // Store both snake_case and camelCase for compatibility
            id: credential.id,
            credential_name: credential.credentialName,
            credentialName: credential.credentialName,
            description: credential.description,
            entity: credential.entity,
            product: credential.product,
            service: credential.service,
            connector: credential.connector,
            connector_icon_name: credential.connectorIconName,
            connectorIconName: credential.connectorIconName,
            connectors: credential.connectors,
            authentication_type: credential.authenticationType,
            authenticationType: credential.authenticationType,
            scope: credential.scope,
            expiry: credential.expiry,
            assigned_pipelines: credential.assignedPipelines,
            assignedPipelines: credential.assignedPipelines,
            status: credential.status,
            created_at: credential.createdAt,
            createdAt: credential.createdAt,
            updated_at: credential.updatedAt,
            updatedAt: credential.updatedAt,
            created_by: credential.createdBy,
            createdBy: credential.createdBy,
            account_id: credential.accountId,
            accountId: credential.accountId,
            account_name: credential.accountName,
            accountName: credential.accountName,
            enterprise_id: credential.enterpriseId,
            enterpriseId: credential.enterpriseId,
            enterprise_name: credential.enterpriseName,
            enterpriseName: credential.enterpriseName,
            cloud_type: cloudType,
            cloudType: cloudType,
            aws_account_id: awsAccountId,
            awsAccountId: awsAccountId,
            entity_type: 'CREDENTIAL',
        };

        // Use cross-account access if awsAccountId is available
        if (awsAccountId) {
            const tableName = this.getAccountTableName(
                input.accountId,
                cloudType,
            );
            const config: AccountAwsConfig = {
                awsAccountId,
                accountId: input.accountId,
                cloudType,
            };

            console.log(
                `📦 [Cross-Account] Creating credential in account ${input.accountId} table: ${tableName}`,
            );
            console.log(
                `   AWS Account: ${awsAccountId}, Cloud Type: ${cloudType}`,
            );

            await this.crossAccountService.putItem(config, item);
            console.log(
                `✅ Credential created in account DynamoDB: ${credential.id}`,
            );
        } else {
            // Fallback to admin table
            console.log(
                `📦 [Admin] Creating credential in admin table: ${this.defaultTableName}`,
            );
            await DynamoDBOperations.putItem(this.defaultTableName, item);
            console.log(
                `✅ Credential created in admin DynamoDB: ${credential.id}`,
            );
        }

        return credential;
    }

    /**
     * Get a single credential by ID
     * Fetches from account-specific DynamoDB table using cross-account access
     */
    async get(
        credentialId: string,
        accountId: string,
        cloudType?: 'public' | 'private',
        awsAccountId?: string,
    ): Promise<Credential | null> {
        // Look up account AWS details for cross-account access
        const accountDetails = await this.getAccountAwsDetails(
            accountId,
            awsAccountId,
            cloudType,
        );

        const pk = this.generatePK(accountId);
        const sk = this.generateSK(credentialId);

        let item: any;

        // Use cross-account access if awsAccountId is available
        if (accountDetails.awsAccountId) {
            const tableName = this.getAccountTableName(
                accountId,
                accountDetails.cloudType,
            );
            const config: AccountAwsConfig = {
                awsAccountId: accountDetails.awsAccountId,
                accountId,
                cloudType: accountDetails.cloudType,
            };

            console.log(
                `🔍 [Cross-Account] Getting credential from ${tableName}`,
            );
            item = await this.crossAccountService.getItem(config, {
                PK: pk,
                SK: sk,
            });
        } else {
            console.log(
                `🔍 [Admin] Getting credential from ${this.defaultTableName}`,
            );
            item = await DynamoDBOperations.getItem(this.defaultTableName, {
                PK: pk,
                SK: sk,
            });
        }

        if (!item) {
            console.log(`❌ Credential not found: ${credentialId}`);
            return null;
        }

        return this.mapItemToCredential(item);
    }

    /**
     * List all credentials for an account
     * Fetches from account-specific DynamoDB table using cross-account access
     */
    async list(params: {
        accountId?: string;
        accountName?: string;
        enterpriseId?: string;
        enterpriseName?: string;
        cloudType?: 'public' | 'private';
        awsAccountId?: string;
    }): Promise<Credential[]> {
        console.log(`📋 Listing credentials with params:`, params);

        let items: any[] = [];

        if (params.accountId) {
            // Look up account AWS details for cross-account access
            const accountDetails = await this.getAccountAwsDetails(
                params.accountId,
                params.awsAccountId,
                params.cloudType,
            );

            // Query by account PK
            const pk = this.generatePK(params.accountId);
            console.log(`🔍 Querying credentials with PK: ${pk}`);

            // Use cross-account access if awsAccountId is available
            if (accountDetails.awsAccountId) {
                const tableName = this.getAccountTableName(
                    params.accountId,
                    accountDetails.cloudType,
                );
                const config: AccountAwsConfig = {
                    awsAccountId: accountDetails.awsAccountId,
                    accountId: params.accountId,
                    cloudType: accountDetails.cloudType,
                };

                console.log(
                    `🔍 [Cross-Account] Querying credentials from ${tableName}`,
                );
                items = await this.crossAccountService.queryItems(
                    config,
                    'PK = :pk AND begins_with(SK, :skPrefix)',
                    {
                        ':pk': pk,
                        ':skPrefix': 'CREDENTIAL#',
                    },
                );
            } else {
                console.log(
                    `🔍 [Admin] Querying credentials from ${this.defaultTableName}`,
                );
                items = await DynamoDBOperations.queryItems(
                    this.defaultTableName,
                    'PK = :pk AND begins_with(SK, :skPrefix)',
                    {
                        ':pk': pk,
                        ':skPrefix': 'CREDENTIAL#',
                    },
                );
            }
        } else {
            // Scan for all credentials from admin table (fallback for admin operations)
            console.log(
                `🔍 [Admin] Scanning for all credentials from admin table`,
            );
            items = await DynamoDBOperations.scanItems(
                this.defaultTableName,
                'entity_type = :entityType',
                {':entityType': 'CREDENTIAL'},
            );
        }

        console.log(`📋 Found ${items?.length || 0} credentials`);

        // Filter by enterpriseId if provided
        let filteredItems = items || [];
        if (params.enterpriseId) {
            filteredItems = filteredItems.filter(
                (item: any) =>
                    item.enterprise_id === params.enterpriseId ||
                    item.enterpriseId === params.enterpriseId,
            );
            console.log(
                `📋 Filtered to ${filteredItems.length} credentials by enterpriseId`,
            );
        }

        // Filter by enterpriseName if provided
        if (params.enterpriseName) {
            filteredItems = filteredItems.filter(
                (item: any) =>
                    item.enterprise_name === params.enterpriseName ||
                    item.enterpriseName === params.enterpriseName,
            );
            console.log(
                `📋 Filtered to ${filteredItems.length} credentials by enterpriseName`,
            );
        }

        return filteredItems.map((item: any) => this.mapItemToCredential(item));
    }

    /**
     * Update an existing credential
     * Updates in account-specific DynamoDB table using cross-account access
     */
    async update(
        credentialId: string,
        accountId: string,
        input: UpdateCredentialInput,
    ): Promise<Credential | null> {
        // Look up account AWS details for cross-account access
        const accountDetails = await this.getAccountAwsDetails(
            accountId,
            input.awsAccountId,
            input.cloudType,
        );

        const pk = this.generatePK(accountId);
        const sk = this.generateSK(credentialId);
        const now = new Date().toISOString();

        console.log(
            `📝 Updating credential: ${credentialId} with PK: ${pk}, SK: ${sk}`,
        );

        let existingItem: any;

        // First, get the existing item from the correct table
        if (accountDetails.awsAccountId) {
            const tableName = this.getAccountTableName(
                accountId,
                accountDetails.cloudType,
            );
            const config: AccountAwsConfig = {
                awsAccountId: accountDetails.awsAccountId,
                accountId,
                cloudType: accountDetails.cloudType,
            };

            console.log(
                `🔍 [Cross-Account] Getting existing credential from ${tableName}`,
            );
            existingItem = await this.crossAccountService.getItem(config, {
                PK: pk,
                SK: sk,
            });
        } else {
            console.log(
                `🔍 [Admin] Getting existing credential from ${this.defaultTableName}`,
            );
            existingItem = await DynamoDBOperations.getItem(
                this.defaultTableName,
                {
                    PK: pk,
                    SK: sk,
                },
            );
        }

        if (!existingItem) {
            console.log(`❌ Credential not found for update: ${credentialId}`);
            return null;
        }

        // Build update expression
        const updateFields: string[] = [];
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        // Always update the updatedAt timestamp
        updateFields.push('#updatedAt = :updatedAt');
        updateFields.push('#updated_at = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeNames['#updated_at'] = 'updated_at';
        expressionAttributeValues[':updatedAt'] = now;

        if (input.credentialName !== undefined) {
            updateFields.push('#credentialName = :credentialName');
            updateFields.push('#credential_name = :credentialName');
            expressionAttributeNames['#credentialName'] = 'credentialName';
            expressionAttributeNames['#credential_name'] = 'credential_name';
            expressionAttributeValues[':credentialName'] = input.credentialName;
        }

        if (input.description !== undefined) {
            updateFields.push('#description = :description');
            expressionAttributeNames['#description'] = 'description';
            expressionAttributeValues[':description'] = input.description;
        }

        if (input.entity !== undefined) {
            updateFields.push('#entity = :entity');
            expressionAttributeNames['#entity'] = 'entity';
            expressionAttributeValues[':entity'] = input.entity;
        }

        if (input.product !== undefined) {
            updateFields.push('#product = :product');
            expressionAttributeNames['#product'] = 'product';
            expressionAttributeValues[':product'] = input.product;
        }

        if (input.service !== undefined) {
            updateFields.push('#service = :service');
            expressionAttributeNames['#service'] = 'service';
            expressionAttributeValues[':service'] = input.service;
        }

        if (input.connector !== undefined) {
            updateFields.push('#connector = :connector');
            expressionAttributeNames['#connector'] = 'connector';
            expressionAttributeValues[':connector'] = input.connector;
        }

        if (input.connectorIconName !== undefined) {
            updateFields.push('#connectorIconName = :connectorIconName');
            updateFields.push('#connector_icon_name = :connectorIconName');
            expressionAttributeNames['#connectorIconName'] =
                'connectorIconName';
            expressionAttributeNames['#connector_icon_name'] =
                'connector_icon_name';
            expressionAttributeValues[':connectorIconName'] =
                input.connectorIconName;
        }

        if (input.connectors !== undefined) {
            updateFields.push('#connectors = :connectors');
            expressionAttributeNames['#connectors'] = 'connectors';
            expressionAttributeValues[':connectors'] = input.connectors;
        }

        if (input.authenticationType !== undefined) {
            updateFields.push('#authenticationType = :authenticationType');
            updateFields.push('#authentication_type = :authenticationType');
            expressionAttributeNames['#authenticationType'] =
                'authenticationType';
            expressionAttributeNames['#authentication_type'] =
                'authentication_type';
            expressionAttributeValues[':authenticationType'] =
                input.authenticationType;
        }

        if (input.scope !== undefined) {
            updateFields.push('#scope = :scope');
            expressionAttributeNames['#scope'] = 'scope';
            expressionAttributeValues[':scope'] = input.scope;
        }

        if (input.expiry !== undefined) {
            updateFields.push('#expiry = :expiry');
            expressionAttributeNames['#expiry'] = 'expiry';
            expressionAttributeValues[':expiry'] = input.expiry;
        }

        if (input.status !== undefined) {
            updateFields.push('#status = :status');
            expressionAttributeNames['#status'] = 'status';
            expressionAttributeValues[':status'] = input.status;
        }

        if (input.updatedBy !== undefined) {
            updateFields.push('#updatedBy = :updatedBy');
            updateFields.push('#updated_by = :updatedBy');
            expressionAttributeNames['#updatedBy'] = 'updatedBy';
            expressionAttributeNames['#updated_by'] = 'updated_by';
            expressionAttributeValues[':updatedBy'] = input.updatedBy;
        }

        const updateExpression = `SET ${updateFields.join(', ')}`;

        // Use cross-account access if awsAccountId is available
        if (accountDetails.awsAccountId) {
            const tableName = this.getAccountTableName(
                accountId,
                accountDetails.cloudType,
            );
            const config: AccountAwsConfig = {
                awsAccountId: accountDetails.awsAccountId,
                accountId,
                cloudType: accountDetails.cloudType,
            };

            console.log(
                `📝 [Cross-Account] Updating credential in ${tableName}`,
            );
            await this.crossAccountService.updateItem(
                config,
                {PK: pk, SK: sk},
                updateExpression,
                expressionAttributeValues,
                expressionAttributeNames,
            );
        } else {
            console.log(
                `📝 [Admin] Updating credential in ${this.defaultTableName}`,
            );
            await DynamoDBOperations.updateItem(
                this.defaultTableName,
                {PK: pk, SK: sk},
                updateExpression,
                expressionAttributeValues,
                expressionAttributeNames,
            );
        }

        console.log(`✅ Credential updated successfully: ${credentialId}`);

        // Return the updated credential
        return this.get(
            credentialId,
            accountId,
            accountDetails.cloudType,
            accountDetails.awsAccountId,
        );
    }

    /**
     * Delete a credential
     * Deletes from account-specific DynamoDB table using cross-account access
     */
    async delete(
        credentialId: string,
        accountId: string,
        cloudType?: 'public' | 'private',
        awsAccountId?: string,
    ): Promise<boolean> {
        // Look up account AWS details for cross-account access
        const accountDetails = await this.getAccountAwsDetails(
            accountId,
            awsAccountId,
            cloudType,
        );

        const pk = this.generatePK(accountId);
        const sk = this.generateSK(credentialId);

        console.log(
            `🗑️ Deleting credential: ${credentialId} with PK: ${pk}, SK: ${sk}`,
        );

        try {
            // Use cross-account access if awsAccountId is available
            if (accountDetails.awsAccountId) {
                const tableName = this.getAccountTableName(
                    accountId,
                    accountDetails.cloudType,
                );
                const config: AccountAwsConfig = {
                    awsAccountId: accountDetails.awsAccountId,
                    accountId,
                    cloudType: accountDetails.cloudType,
                };

                console.log(
                    `🗑️ [Cross-Account] Deleting credential from ${tableName}`,
                );
                await this.crossAccountService.deleteItem(config, {
                    PK: pk,
                    SK: sk,
                });
            } else {
                console.log(
                    `🗑️ [Admin] Deleting credential from ${this.defaultTableName}`,
                );
                await DynamoDBOperations.deleteItem(this.defaultTableName, {
                    PK: pk,
                    SK: sk,
                });
            }

            console.log(`✅ Credential deleted successfully: ${credentialId}`);
            return true;
        } catch (error) {
            console.error(
                `❌ Error deleting credential: ${credentialId}`,
                error,
            );
            return false;
        }
    }

    /**
     * Bulk create credentials
     */
    async bulkCreate(
        credentials: CreateCredentialInput[],
    ): Promise<Credential[]> {
        console.log(`📦 Bulk creating ${credentials.length} credentials`);
        const results: Credential[] = [];

        for (const input of credentials) {
            const credential = await this.create(input);
            results.push(credential);
        }

        console.log(`✅ Bulk created ${results.length} credentials`);
        return results;
    }

    /**
     * Bulk delete credentials
     * Deletes from account-specific DynamoDB tables using cross-account access
     */
    async bulkDelete(
        items: Array<{
            id: string;
            accountId: string;
            cloudType?: 'public' | 'private';
            awsAccountId?: string;
        }>,
    ): Promise<{deleted: number; failed: number}> {
        console.log(`🗑️ Bulk deleting ${items.length} credentials`);
        let deleted = 0;
        let failed = 0;

        for (const item of items) {
            const success = await this.delete(
                item.id,
                item.accountId,
                item.cloudType,
                item.awsAccountId,
            );
            if (success) {
                deleted++;
            } else {
                failed++;
            }
        }

        console.log(
            `✅ Bulk delete complete: ${deleted} deleted, ${failed} failed`,
        );
        return {deleted, failed};
    }

    /**
     * Map DynamoDB item to Credential interface
     */
    private mapItemToCredential(item: any): Credential {
        return {
            id: item.id,
            credentialName: item.credentialName || item.credential_name || '',
            description: item.description || '',
            entity: item.entity || '',
            product: item.product || '',
            service: item.service || '',
            connector: item.connector || '',
            connectorIconName:
                item.connectorIconName || item.connector_icon_name || '',
            connectors: item.connectors || [],
            authenticationType:
                item.authenticationType || item.authentication_type || '',
            scope: item.scope || '',
            expiry: item.expiry || '',
            assignedPipelines:
                item.assignedPipelines || item.assigned_pipelines || 0,
            status: item.status || 'Active',
            createdAt: item.createdAt || item.created_at || '',
            updatedAt: item.updatedAt || item.updated_at || '',
            createdBy: item.createdBy || item.created_by || '',
            updatedBy: item.updatedBy || item.updated_by || '',
            accountId: item.accountId || item.account_id || '',
            accountName: item.accountName || item.account_name || '',
            enterpriseId: item.enterpriseId || item.enterprise_id || '',
            enterpriseName: item.enterpriseName || item.enterprise_name || '',
            cloudType: item.cloudType || item.cloud_type,
            awsAccountId: item.awsAccountId || item.aws_account_id,
        };
    }

    /**
     * Get credential by name (for checking duplicates)
     * Searches in account-specific DynamoDB table using cross-account access
     */
    async getByName(
        credentialName: string,
        accountId: string,
        enterpriseId?: string,
        cloudType?: 'public' | 'private',
        awsAccountId?: string,
    ): Promise<Credential | null> {
        // Look up account AWS details for cross-account access
        const accountDetails = await this.getAccountAwsDetails(
            accountId,
            awsAccountId,
            cloudType,
        );

        const pk = this.generatePK(accountId);

        console.log(`🔍 Searching for credential by name: ${credentialName}`);

        let items: any[];

        // Use cross-account access if awsAccountId is available
        if (accountDetails.awsAccountId) {
            const tableName = this.getAccountTableName(
                accountId,
                accountDetails.cloudType,
            );
            const config: AccountAwsConfig = {
                awsAccountId: accountDetails.awsAccountId,
                accountId,
                cloudType: accountDetails.cloudType,
            };

            console.log(`🔍 [Cross-Account] Searching in ${tableName}`);
            items = await this.crossAccountService.queryItems(
                config,
                'PK = :pk AND begins_with(SK, :skPrefix)',
                {
                    ':pk': pk,
                    ':skPrefix': 'CREDENTIAL#',
                },
            );
        } else {
            console.log(`🔍 [Admin] Searching in ${this.defaultTableName}`);
            items = await DynamoDBOperations.queryItems(
                this.defaultTableName,
                'PK = :pk AND begins_with(SK, :skPrefix)',
                {
                    ':pk': pk,
                    ':skPrefix': 'CREDENTIAL#',
                },
            );
        }

        if (!items || items.length === 0) {
            return null;
        }

        // Find matching credential by name
        const matchingItem = items.find((item: any) => {
            const itemName = item.credentialName || item.credential_name;
            const matchesName =
                itemName?.toLowerCase() === credentialName.toLowerCase();

            // If enterpriseId is provided, also match on that
            if (enterpriseId) {
                const itemEnterpriseId =
                    item.enterpriseId || item.enterprise_id;
                return matchesName && itemEnterpriseId === enterpriseId;
            }

            return matchesName;
        });

        return matchingItem ? this.mapItemToCredential(matchingItem) : null;
    }
}
