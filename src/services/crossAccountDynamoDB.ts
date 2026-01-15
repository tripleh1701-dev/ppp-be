/**
 * Cross-Account DynamoDB Service
 * Handles STS AssumeRole to access account-specific DynamoDB tables
 *
 * For each account:
 * - Public cloud: table name is 'account-admin-public-dev'
 * - Private cloud: table name is 'account-<account_id>-admin-private-dev'
 *
 * The account's AWS account ID is retrieved from the account registry,
 * then STS AssumeRole is used to get temporary credentials to access
 * the DynamoDB table in that AWS account.
 */

import {
    STSClient,
    AssumeRoleCommand,
    Credentials as STSCredentials,
} from '@aws-sdk/client-sts';
import {
    DynamoDBClient,
    PutItemCommand,
    GetItemCommand,
    DeleteItemCommand,
    QueryCommand,
    UpdateItemCommand,
    ScanCommand,
} from '@aws-sdk/client-dynamodb';
import {marshall, unmarshall} from '@aws-sdk/util-dynamodb';

export interface AccountAwsConfig {
    awsAccountId: string; // The AWS account ID where the account's resources are provisioned
    cloudType: 'public' | 'private';
    accountId: string;
    region?: string;
}

export interface CrossAccountCredentials {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken: string;
    expiration: Date;
}

// Cache for assumed role credentials
const credentialsCache: Map<
    string,
    {credentials: CrossAccountCredentials; client: DynamoDBClient}
> = new Map();

// Track accounts that are in local dev mode (can't assume role)
const localDevModeAccounts: Set<string> = new Set();

export class CrossAccountDynamoDBService {
    private stsClient: STSClient;
    private readonly crossAccountRoleName: string;
    private readonly region: string;
    private readonly assumeRoleDuration: number;
    private readonly adminTableName: string;

    constructor() {
        this.region = process.env.AWS_REGION || 'us-east-1';
        this.crossAccountRoleName =
            process.env.CROSS_ACCOUNT_ROLE_NAME ||
            'account-admin-cross-account-role';
        this.assumeRoleDuration = parseInt(
            process.env.ASSUME_ROLE_DURATION || '3600',
            10,
        );
        this.adminTableName =
            process.env.DYNAMODB_TABLE ||
            process.env.ACCOUNT_REGISTRY_TABLE_NAME ||
            'systiva-admin-dev';

        // Initialize STS client with base credentials (from env or IAM role)
        this.stsClient = new STSClient({
            region: this.region,
        });

        console.log('🔧 CrossAccountDynamoDBService initialized');
        console.log(`   Cross-account role name: ${this.crossAccountRoleName}`);
        console.log(`   Region: ${this.region}`);
        console.log(
            `   Admin table (for local dev fallback): ${this.adminTableName}`,
        );
    }

    /**
     * Get the DynamoDB table name based on cloud type
     * In local dev mode (when AssumeRole fails), uses the central admin table
     */
    getTableName(accountId: string, cloudType: 'public' | 'private'): string {
        // In local dev mode, use central admin table
        if (localDevModeAccounts.has(accountId)) {
            console.log(
                `📦 Local dev mode: Using central admin table ${this.adminTableName} for account ${accountId}`,
            );
            return this.adminTableName;
        }

        if (cloudType === 'private') {
            return `account-${accountId}-admin-private-dev`;
        }
        return 'account-admin-public-dev';
    }

    /**
     * Check if an account is in local dev mode
     */
    isLocalDevMode(accountId: string): boolean {
        return localDevModeAccounts.has(accountId);
    }

    /**
     * Assume cross-account role to access the account's AWS resources
     */
    async assumeAccountRole(
        awsAccountId: string,
        accountId: string,
    ): Promise<CrossAccountCredentials> {
        const cacheKey = `${awsAccountId}:${accountId}`;

        // Check cache for valid credentials
        const cached = credentialsCache.get(cacheKey);
        if (cached && cached.credentials.expiration > new Date()) {
            console.log(`✅ Using cached credentials for account ${accountId}`);
            return cached.credentials;
        }

        const roleArn = `arn:aws:iam::${awsAccountId}:role/${this.crossAccountRoleName}`;
        const sessionName = `pipeline-canvas-${accountId}-${Date.now()}`;

        console.log(`🔑 Assuming cross-account role for account: ${accountId}`);
        console.log(`   Role ARN: ${roleArn}`);
        console.log(`   Session: ${sessionName}`);

        try {
            const command = new AssumeRoleCommand({
                RoleArn: roleArn,
                RoleSessionName: sessionName,
                DurationSeconds: this.assumeRoleDuration,
            });

            const response = await this.stsClient.send(command);

            if (!response.Credentials) {
                throw new Error('No credentials returned from STS AssumeRole');
            }

            const credentials: CrossAccountCredentials = {
                accessKeyId: response.Credentials.AccessKeyId!,
                secretAccessKey: response.Credentials.SecretAccessKey!,
                sessionToken: response.Credentials.SessionToken!,
                expiration: response.Credentials.Expiration!,
            };

            console.log(
                `✅ Successfully assumed role for account ${accountId}`,
            );
            console.log(`   Expires: ${credentials.expiration}`);

            return credentials;
        } catch (error: any) {
            console.error(
                `❌ Failed to assume role for account ${accountId}:`,
                error.message,
            );
            throw error;
        }
    }

    /**
     * Get or create a DynamoDB client with assumed role credentials
     */
    async getAccountDynamoDBClient(
        config: AccountAwsConfig,
    ): Promise<DynamoDBClient> {
        const cacheKey = `${config.awsAccountId}:${config.accountId}`;

        // Check cache for valid client
        const cached = credentialsCache.get(cacheKey);
        if (cached && cached.credentials.expiration > new Date()) {
            return cached.client;
        }

        try {
            // Assume role and create new client
            const credentials = await this.assumeAccountRole(
                config.awsAccountId,
                config.accountId,
            );

            const client = new DynamoDBClient({
                region: config.region || this.region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey,
                    sessionToken: credentials.sessionToken,
                },
            });

            // Cache the credentials and client
            credentialsCache.set(cacheKey, {credentials, client});

            return client;
        } catch (error: any) {
            // Fallback for local development with root credentials
            // Root accounts cannot assume roles, so use direct credentials
            if (
                error.message?.includes('root accounts') ||
                error.Code === 'AccessDenied'
            ) {
                console.warn(
                    `⚠️ AssumeRole failed for account ${config.accountId}, using direct credentials and central table (local dev mode)`,
                );
                // Mark this account as local dev mode so getTableName uses central table
                localDevModeAccounts.add(config.accountId);
                const directClient = new DynamoDBClient({
                    region: config.region || this.region,
                });
                return directClient;
            }
            throw error;
        }
    }

    /**
     * Convert item keys from uppercase (PK/SK) to lowercase (pk/sk) for private tables
     * Private tables use lowercase pk/sk, public tables use uppercase PK/SK
     */
    private normalizeItemKeys(
        item: Record<string, any>,
        cloudType: 'public' | 'private',
    ): Record<string, any> {
        if (cloudType === 'public') {
            // Public tables use uppercase PK/SK - no conversion needed
            return item;
        }

        // Private tables use lowercase pk/sk
        const normalizedItem: Record<string, any> = {};
        for (const [key, value] of Object.entries(item)) {
            if (key === 'PK') {
                normalizedItem['pk'] = value;
            } else if (key === 'SK') {
                normalizedItem['sk'] = value;
            } else {
                normalizedItem[key] = value;
            }
        }
        return normalizedItem;
    }

    /**
     * Convert key object from uppercase to lowercase for private tables
     */
    private normalizeKeyNames(
        key: {PK: string; SK: string},
        cloudType: 'public' | 'private',
    ): Record<string, string> {
        if (cloudType === 'public') {
            return {PK: key.PK, SK: key.SK};
        }
        return {pk: key.PK, sk: key.SK};
    }

    /**
     * Put item in account-specific DynamoDB table
     */
    async putItem(
        config: AccountAwsConfig,
        item: Record<string, any>,
    ): Promise<void> {
        const client = await this.getAccountDynamoDBClient(config);
        const tableName = this.getTableName(config.accountId, config.cloudType);

        // Normalize key names based on table type (private uses lowercase pk/sk)
        const normalizedItem = this.normalizeItemKeys(item, config.cloudType);

        console.log(
            `📦 PutItem to ${tableName} in AWS account ${config.awsAccountId}`,
        );
        console.log(
            `   Key format: ${
                config.cloudType === 'private'
                    ? 'lowercase (pk/sk)'
                    : 'uppercase (PK/SK)'
            }`,
        );

        const command = new PutItemCommand({
            TableName: tableName,
            Item: marshall(normalizedItem, {removeUndefinedValues: true}),
        });

        await client.send(command);
    }

    /**
     * Get item from account-specific DynamoDB table
     */
    async getItem(
        config: AccountAwsConfig,
        key: {PK: string; SK: string},
    ): Promise<Record<string, any> | null> {
        const client = await this.getAccountDynamoDBClient(config);
        const tableName = this.getTableName(config.accountId, config.cloudType);

        // Normalize key names based on table type
        const normalizedKey = this.normalizeKeyNames(key, config.cloudType);

        console.log(
            `🔍 GetItem from ${tableName} in AWS account ${config.awsAccountId}`,
        );

        const command = new GetItemCommand({
            TableName: tableName,
            Key: marshall(normalizedKey),
        });

        const response = await client.send(command);

        if (!response.Item) {
            return null;
        }

        return unmarshall(response.Item);
    }

    /**
     * Query items from account-specific DynamoDB table
     */
    async queryItems(
        config: AccountAwsConfig,
        keyConditionExpression: string,
        expressionAttributeValues: Record<string, any>,
    ): Promise<Record<string, any>[]> {
        const client = await this.getAccountDynamoDBClient(config);
        const tableName = this.getTableName(config.accountId, config.cloudType);

        // Normalize key condition expression for private tables (PK -> pk, SK -> sk)
        let normalizedExpression = keyConditionExpression;
        if (config.cloudType === 'private') {
            normalizedExpression = keyConditionExpression
                .replace(/\bPK\b/g, 'pk')
                .replace(/\bSK\b/g, 'sk');
        }

        console.log(
            `🔍 Query ${tableName} in AWS account ${config.awsAccountId}`,
        );
        console.log(`   Key condition: ${normalizedExpression}`);

        const command = new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: normalizedExpression,
            ExpressionAttributeValues: marshall(expressionAttributeValues),
        });

        const response = await client.send(command);

        return (response.Items || []).map((item) => unmarshall(item));
    }

    /**
     * Update item in account-specific DynamoDB table
     */
    async updateItem(
        config: AccountAwsConfig,
        key: {PK: string; SK: string},
        updateExpression: string,
        expressionAttributeValues: Record<string, any>,
        expressionAttributeNames?: Record<string, string>,
    ): Promise<void> {
        const client = await this.getAccountDynamoDBClient(config);
        const tableName = this.getTableName(config.accountId, config.cloudType);

        // Normalize key names based on table type
        const normalizedKey = this.normalizeKeyNames(key, config.cloudType);

        console.log(
            `📝 UpdateItem in ${tableName} in AWS account ${config.awsAccountId}`,
        );

        const command = new UpdateItemCommand({
            TableName: tableName,
            Key: marshall(normalizedKey),
            UpdateExpression: updateExpression,
            ExpressionAttributeValues: marshall(expressionAttributeValues),
            ExpressionAttributeNames: expressionAttributeNames,
        });

        await client.send(command);
    }

    /**
     * Delete item from account-specific DynamoDB table
     */
    async deleteItem(
        config: AccountAwsConfig,
        key: {PK: string; SK: string},
    ): Promise<void> {
        const client = await this.getAccountDynamoDBClient(config);
        const tableName = this.getTableName(config.accountId, config.cloudType);

        // Normalize key names based on table type
        const normalizedKey = this.normalizeKeyNames(key, config.cloudType);

        console.log(
            `🗑️ DeleteItem from ${tableName} in AWS account ${config.awsAccountId}`,
        );

        const command = new DeleteItemCommand({
            TableName: tableName,
            Key: marshall(normalizedKey),
        });

        await client.send(command);
    }

    /**
     * Scan items from account-specific DynamoDB table
     */
    async scanItems(
        config: AccountAwsConfig,
        filterExpression?: string,
        expressionAttributeValues?: Record<string, any>,
    ): Promise<Record<string, any>[]> {
        const client = await this.getAccountDynamoDBClient(config);
        const tableName = this.getTableName(config.accountId, config.cloudType);

        console.log(
            `📊 Scan ${tableName} in AWS account ${config.awsAccountId}`,
        );

        const command = new ScanCommand({
            TableName: tableName,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues
                ? marshall(expressionAttributeValues)
                : undefined,
        });

        const response = await client.send(command);

        return (response.Items || []).map((item) => unmarshall(item));
    }
}
