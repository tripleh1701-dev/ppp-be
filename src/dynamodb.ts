// Load environment variables first - this file may be imported before main.ts dotenv runs
import * as dotenv from 'dotenv';
dotenv.config();

import {DynamoDBClient} from '@aws-sdk/client-dynamodb';
import {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    GetCommand,
    UpdateCommand,
    DeleteCommand,
    ScanCommand,
} from '@aws-sdk/lib-dynamodb';

export type StorageMode = 'filesystem' | 'postgres' | 'dynamodb';

// Read storage mode directly from environment each time
export function getStorageMode(): StorageMode {
    return (process.env.STORAGE_MODE as StorageMode) || 'filesystem';
}

let client: DynamoDBClient | null = null;
let ddbDocClient: DynamoDBDocumentClient | null = null;

export function getDynamoDBClient(): DynamoDBClient {
    const storageMode = getStorageMode();
    if (storageMode !== 'dynamodb') {
        throw new Error('DynamoDB not enabled. Set STORAGE_MODE=dynamodb');
    }

    if (!client) {
        console.log('Initializing DynamoDB connection...');
        console.log('DynamoDB config:', {
            region: process.env.AWS_REGION || 'us-east-1',
            endpoint: process.env.DYNAMODB_ENDPOINT || undefined, // For local DynamoDB
        });

        const config: any = {
            region:
                process.env.AWS_REGION ||
                process.env.AWS_REGION_NAME ||
                'us-east-1',
        };

        // In Lambda/AWS environment, DO NOT use explicit credentials
        // The Lambda execution role provides credentials automatically
        // Only use explicit credentials for local development with DYNAMODB_ENDPOINT
        if (process.env.DYNAMODB_ENDPOINT) {
            // Local DynamoDB development
            config.endpoint = process.env.DYNAMODB_ENDPOINT;

            // Only add explicit credentials for local development
            if (
                process.env.AWS_ACCESS_KEY_ID &&
                process.env.AWS_SECRET_ACCESS_KEY
            ) {
                config.credentials = {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                };
            }
        }
        // For AWS Lambda, don't set explicit credentials - use IAM role

        client = new DynamoDBClient(config);
    }

    return client;
}

export function getDynamoDBDocumentClient(): DynamoDBDocumentClient {
    const storageMode = getStorageMode();
    if (storageMode !== 'dynamodb') {
        throw new Error('DynamoDB not enabled. Set STORAGE_MODE=dynamodb');
    }

    if (!ddbDocClient) {
        const client = getDynamoDBClient();
        ddbDocClient = DynamoDBDocumentClient.from(client);
    }

    return ddbDocClient;
}

export async function withDynamoDB<T>(
    fn: (client: DynamoDBDocumentClient) => Promise<T>,
): Promise<T> {
    const storageMode = getStorageMode();
    if (storageMode !== 'dynamodb') {
        throw new Error('DynamoDB not enabled. Set STORAGE_MODE=dynamodb');
    }

    const docClient = getDynamoDBDocumentClient();
    try {
        return await fn(docClient);
    } catch (error) {
        console.error('DynamoDB operation failed:', error);
        throw error;
    }
}

export async function testDynamoDBConnection(): Promise<boolean> {
    const storageMode = getStorageMode();
    if (storageMode !== 'dynamodb') {
        console.log('DynamoDB not enabled, skipping connection test');
        return false;
    }

    // Skip connection test if using dummy credentials or if explicitly disabled
    if (
        process.env.SKIP_DYNAMODB_CONNECTION_TEST === 'true' ||
        process.env.AWS_ACCESS_KEY_ID === 'dummy_access_key' ||
        process.env.AWS_SECRET_ACCESS_KEY === 'dummy_secret_key'
    ) {
        console.log(
            'DynamoDB connection test skipped (using dummy credentials or disabled)',
        );
        return true; // Return true to allow app to start
    }

    try {
        const docClient = getDynamoDBDocumentClient();

        // Try to perform a simple operation - list tables or scan a small table
        // For systiva table, we'll try to scan with a limit of 1
        const tableName = process.env.DYNAMODB_SYSTIVA_TABLE || 'systiva';

        await docClient.send(
            new ScanCommand({
                TableName: tableName,
                Limit: 1,
            }),
        );

        console.log('DynamoDB connection test successful');
        return true;
    } catch (error) {
        console.error('DynamoDB connection test failed:', error);
        return false;
    }
}

// In-memory store for development/testing when using dummy credentials
let inMemoryStore: Record<string, any> = {};

// Check if we should use in-memory store (for development with dummy credentials)
function shouldUseInMemoryStore(): boolean {
    // Only use in-memory store if explicitly requested
    return process.env.USE_IN_MEMORY_DYNAMODB === 'true';
}

// ============================================================================
// AUDIT COLUMNS SUPPORT
// ============================================================================
// These columns are automatically added to all DynamoDB operations:
// - CREATED_BY: User ID who created the record (NUMBER/STRING)
// - CREATION_DATE: ISO timestamp when record was created
// - LAST_UPDATED_BY: User ID who last updated the record (NUMBER/STRING)
// - LAST_UPDATE_DATE: ISO timestamp when record was last updated
// ============================================================================

// Async Local Storage for request context (user info)
import {AsyncLocalStorage} from 'async_hooks';

export interface AuditContext {
    userId?: string | number;
    username?: string;
    email?: string;
}

// Create AsyncLocalStorage instance for request-scoped audit context
export const auditContextStorage = new AsyncLocalStorage<AuditContext>();

// Get current audit context (user info from request)
export function getAuditContext(): AuditContext {
    return auditContextStorage.getStore() || {};
}

// Set audit context for the current request
export function setAuditContext(context: AuditContext): void {
    const store = auditContextStorage.getStore();
    if (store) {
        Object.assign(store, context);
    }
}

// Run code with audit context
export function runWithAuditContext<T>(context: AuditContext, fn: () => T): T {
    return auditContextStorage.run(context, fn);
}

// Add audit columns to an item (for CREATE operations)
function addCreateAuditColumns(item: any): any {
    const now = new Date().toISOString();
    const auditContext = getAuditContext();
    const userId = auditContext.userId || auditContext.username || 'system';

    return {
        ...item,
        CREATED_BY: userId,
        CREATION_DATE: now,
        LAST_UPDATED_BY: userId,
        LAST_UPDATE_DATE: now,
    };
}

// Add audit columns to update expression (for UPDATE operations)
function addUpdateAuditToExpression(
    updateExpression: string,
    expressionAttributeValues: any,
): {updateExpression: string; expressionAttributeValues: any} {
    const now = new Date().toISOString();
    const auditContext = getAuditContext();
    const userId = auditContext.userId || auditContext.username || 'system';

    // Add audit columns to SET expression
    let modifiedExpression = updateExpression;

    // Check if expression already has SET clause
    if (modifiedExpression.toUpperCase().includes('SET ')) {
        // Append to existing SET clause
        modifiedExpression = modifiedExpression.replace(
            /SET /i,
            'SET LAST_UPDATED_BY = :audit_lastUpdatedBy, LAST_UPDATE_DATE = :audit_lastUpdateDate, ',
        );
    } else {
        // Add SET clause
        modifiedExpression = `SET LAST_UPDATED_BY = :audit_lastUpdatedBy, LAST_UPDATE_DATE = :audit_lastUpdateDate ${modifiedExpression}`;
    }

    return {
        updateExpression: modifiedExpression,
        expressionAttributeValues: {
            ...expressionAttributeValues,
            ':audit_lastUpdatedBy': userId,
            ':audit_lastUpdateDate': now,
        },
    };
}

// Utility functions for DynamoDB operations
export const DynamoDBOperations = {
    // Put item (with automatic audit columns)
    async putItem(
        tableName: string,
        item: any,
        skipAudit: boolean = false,
    ): Promise<void> {
        // Add audit columns unless explicitly skipped
        const itemWithAudit = skipAudit ? item : addCreateAuditColumns(item);

        if (shouldUseInMemoryStore()) {
            const key = `${itemWithAudit.PK}#${itemWithAudit.SK}`;
            inMemoryStore[key] = itemWithAudit;
            console.log(`In-memory store: PUT ${key}`);
            return;
        }

        return withDynamoDB(async (client) => {
            await client.send(
                new PutCommand({
                    TableName: tableName,
                    Item: itemWithAudit,
                }),
            );
        });
    },

    // Get item by key
    async getItem(tableName: string, key: any): Promise<any> {
        if (shouldUseInMemoryStore()) {
            const storeKey = `${key.PK}#${key.SK}`;
            const item = inMemoryStore[storeKey];
            console.log(
                `In-memory store: GET ${storeKey} -> ${
                    item ? 'found' : 'not found'
                }`,
            );
            return item || null;
        }

        return withDynamoDB(async (client) => {
            const result = await client.send(
                new GetCommand({
                    TableName: tableName,
                    Key: key,
                }),
            );
            return result.Item;
        });
    },

    // Query items
    async queryItems(
        tableName: string,
        keyConditionExpression: string,
        expressionAttributeValues: any,
    ): Promise<any[]> {
        if (shouldUseInMemoryStore()) {
            const items = Object.values(inMemoryStore);

            // Simple query implementation for in-memory store
            if (keyConditionExpression.includes('PK = :pk')) {
                const pkValue = expressionAttributeValues[':pk'];
                const filteredItems = items.filter(
                    (item) => item.PK === pkValue,
                );

                // Handle begins_with condition
                if (keyConditionExpression.includes('begins_with(SK, :sk)')) {
                    const skPrefix = expressionAttributeValues[':sk'];
                    return filteredItems.filter(
                        (item) => item.SK && item.SK.startsWith(skPrefix),
                    );
                }

                return filteredItems;
            }

            console.log(`In-memory store: QUERY found ${items.length} items`);
            return items;
        }

        return withDynamoDB(async (client) => {
            const result = await client.send(
                new QueryCommand({
                    TableName: tableName,
                    KeyConditionExpression: keyConditionExpression,
                    ExpressionAttributeValues: expressionAttributeValues,
                }),
            );
            return result.Items || [];
        });
    },

    // Scan items (for list operations)
    async scanItems(
        tableName: string,
        filterExpression?: string,
        expressionAttributeValues?: any,
    ): Promise<any[]> {
        if (shouldUseInMemoryStore()) {
            let items = Object.values(inMemoryStore);

            // Simple filter implementation for in-memory store
            if (filterExpression && expressionAttributeValues) {
                items = items.filter((item) => {
                    // Simple implementation for common filters
                    if (filterExpression.includes('entity_type = :type')) {
                        return (
                            item.entity_type ===
                            expressionAttributeValues[':type']
                        );
                    }
                    return true;
                });
            }

            console.log(`In-memory store: SCAN found ${items.length} items`);
            return items;
        }

        return withDynamoDB(async (client) => {
            const params: any = {
                TableName: tableName,
            };

            if (filterExpression) {
                params.FilterExpression = filterExpression;
            }

            if (expressionAttributeValues) {
                params.ExpressionAttributeValues = expressionAttributeValues;
            }

            const result = await client.send(new ScanCommand(params));
            return result.Items || [];
        });
    },

    // Update item (with automatic audit columns)
    async updateItem(
        tableName: string,
        key: any,
        updateExpression: string,
        expressionAttributeValues: any,
        expressionAttributeNames?: any,
        skipAudit: boolean = false,
    ): Promise<any> {
        // Add audit columns to update expression unless explicitly skipped
        let finalUpdateExpression = updateExpression;
        let finalExpressionAttributeValues = expressionAttributeValues;

        if (!skipAudit) {
            const auditResult = addUpdateAuditToExpression(
                updateExpression,
                expressionAttributeValues,
            );
            finalUpdateExpression = auditResult.updateExpression;
            finalExpressionAttributeValues =
                auditResult.expressionAttributeValues;
        }

        return withDynamoDB(async (client) => {
            const updateParams: any = {
                TableName: tableName,
                Key: key,
                UpdateExpression: finalUpdateExpression,
                ExpressionAttributeValues: finalExpressionAttributeValues,
                ReturnValues: 'ALL_NEW',
            };

            if (
                expressionAttributeNames &&
                Object.keys(expressionAttributeNames).length > 0
            ) {
                updateParams.ExpressionAttributeNames =
                    expressionAttributeNames;
            }

            const result = await client.send(new UpdateCommand(updateParams));
            return result.Attributes;
        });
    },

    // Delete item
    async deleteItem(tableName: string, key: any): Promise<void> {
        if (shouldUseInMemoryStore()) {
            const storeKey = `${key.PK}#${key.SK}`;
            delete inMemoryStore[storeKey];
            console.log(`In-memory store: DELETE ${storeKey}`);
            return;
        }

        return withDynamoDB(async (client) => {
            await client.send(
                new DeleteCommand({
                    TableName: tableName,
                    Key: key,
                }),
            );
        });
    },
};
