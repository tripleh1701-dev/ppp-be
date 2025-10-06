import {DynamoDBOperations, withDynamoDB} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';

export interface Product {
    id: string; // Changed to string for DynamoDB
    name: string;
    createdAt?: string;
    updatedAt?: string;
}

export class ProductsDynamoDBService {
    private readonly tableName: string;

    constructor(dir?: string) {
        // Table name from environment or default to 'systiva'
        this.tableName = process.env.DYNAMODB_SYSTIVA_TABLE || 'systiva';
    }

    async list(): Promise<Product[]> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {
                    ':type': 'product',
                },
            );

            // Transform DynamoDB items to Product interface
            return items
                .map((item) => ({
                    id: item.PK?.replace('SYSTIVA#', '') || item.id,
                    name: item.product_name || item.name,
                    createdAt: item.created_date || item.createdAt,
                    updatedAt: item.updated_date || item.updatedAt,
                }))
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } catch (error) {
            console.error('Error listing products:', error);
            throw error;
        }
    }

    async create(body: Omit<Product, 'id'>): Promise<Product> {
        try {
            const productId = uuidv4();
            const now = new Date().toISOString();

            const item = {
                PK: `SYSTIVA#${productId}`,
                SK: `PRODUCT#${productId}`,
                id: productId,
                product_name: body.name,
                name: body.name, // Keep both for compatibility
                created_date: now,
                createdAt: now,
                updated_date: now,
                updatedAt: now,
                entity_type: 'product',
            };

            await DynamoDBOperations.putItem(this.tableName, item);

            return {
                id: productId,
                name: body.name,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error('Error creating product:', error);
            throw error;
        }
    }

    async update(
        id: string,
        body: Omit<Product, 'id'>,
    ): Promise<Product | null> {
        try {
            console.log(`Updating product with ID: ${id}`);

            const now = new Date().toISOString();

            const updateExpression =
                'SET product_name = :name, #name = :name, updated_date = :updated, updatedAt = :updated';
            const expressionAttributeValues = {
                ':name': body.name,
                ':updated': now,
            };

            // Use ExpressionAttributeNames for reserved words
            const expressionAttributeNames = {
                '#name': 'name',
            };

            const result = await withDynamoDB(async (client) => {
                const {UpdateCommand} = await import('@aws-sdk/lib-dynamodb');
                const response = await client.send(
                    new UpdateCommand({
                        TableName: this.tableName,
                        Key: {
                            PK: `SYSTIVA#${id}`,
                            SK: `PRODUCT#${id}`,
                        },
                        UpdateExpression: updateExpression,
                        ExpressionAttributeValues: expressionAttributeValues,
                        ExpressionAttributeNames: expressionAttributeNames,
                        ReturnValues: 'ALL_NEW',
                    }),
                );
                return response.Attributes;
            });

            if (!result) {
                return null;
            }

            return {
                id: result.id || id,
                name: result.product_name || result.name,
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('Error updating product:', error);
            if ((error as any).name === 'ConditionalCheckFailedException') {
                return null; // Item doesn't exist
            }
            throw error;
        }
    }

    async remove(id: string): Promise<void> {
        try {
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `SYSTIVA#${id}`,
                SK: `PRODUCT#${id}`,
            });
        } catch (error) {
            console.error('Error removing product:', error);
            throw error;
        }
    }

    async get(id: string): Promise<Product | null> {
        try {
            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `SYSTIVA#${id}`,
                SK: `PRODUCT#${id}`,
            });

            if (!item) {
                return null;
            }

            return {
                id: item.id || id,
                name: item.product_name || item.name,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('Error getting product:', error);
            throw error;
        }
    }

    // Debug method to check table contents
    async debugTableContents(): Promise<any> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {
                    ':type': 'product',
                },
            );
            return {
                tableName: this.tableName,
                totalItems: items.length,
                items: items.slice(0, 10), // Return first 10 items for debugging
                itemStructure: items.length > 0 ? Object.keys(items[0]) : [],
            };
        } catch (error) {
            console.error('Error debugging table contents:', error);
            return {
                tableName: this.tableName,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
}
