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
            region: process.env.AWS_REGION || 'us-east-1',
        };

        // Add credentials if provided via environment variables
        if (
            process.env.AWS_ACCESS_KEY_ID &&
            process.env.AWS_SECRET_ACCESS_KEY
        ) {
            config.credentials = {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            };
        }

        // For local DynamoDB development
        if (process.env.DYNAMODB_ENDPOINT) {
            config.endpoint = process.env.DYNAMODB_ENDPOINT;
        }

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
        // For enterprise configuration, we'll try to scan with a limit of 1
        const tableName =
            process.env.DYNAMODB_ENTERPRISE_TABLE || 'EnterpriseConfig';

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

// Utility functions for DynamoDB operations
export const DynamoDBOperations = {
    // Put item
    async putItem(tableName: string, item: any): Promise<void> {
        if (shouldUseInMemoryStore()) {
            const key = `${item.PK}#${item.SK}`;
            inMemoryStore[key] = item;
            console.log(`In-memory store: PUT ${key}`);
            return;
        }

        return withDynamoDB(async (client) => {
            await client.send(
                new PutCommand({
                    TableName: tableName,
                    Item: item,
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

    // Update item
    async updateItem(
        tableName: string,
        key: any,
        updateExpression: string,
        expressionAttributeValues: any,
    ): Promise<any> {
        return withDynamoDB(async (client) => {
            const result = await client.send(
                new UpdateCommand({
                    TableName: tableName,
                    Key: key,
                    UpdateExpression: updateExpression,
                    ExpressionAttributeValues: expressionAttributeValues,
                    ReturnValues: 'ALL_NEW',
                }),
            );
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
