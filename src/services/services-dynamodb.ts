import {DynamoDBOperations, withDynamoDB} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';

export interface Service {
    id: string; // Changed to string for DynamoDB
    name: string;
    createdAt?: string;
    updatedAt?: string;
    // Audit columns
    CREATED_BY?: string | number | null;
    CREATION_DATE?: string | null;
    LAST_UPDATED_BY?: string | number | null;
    LAST_UPDATE_DATE?: string | null;
}

export class ServicesDynamoDBService {
    private readonly tableName: string;

    constructor(dir?: string) {
        // Table name from environment or default
        this.tableName =
            process.env.DYNAMODB_TABLE ||
            `systiva-admin-${
                process.env.WORKSPACE || process.env.NODE_ENV || 'dev'
            }`;
    }

    async list(): Promise<Service[]> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {
                    ':type': 'service',
                },
            );

            // Transform DynamoDB items to Service interface - use SERVICE# pattern
            return items
                .map((item) => ({
                    id: item.id || item.PK?.replace('SERVICE#', ''),
                    name: item.service_name || item.name,
                    createdAt: item.created_date || item.createdAt,
                    updatedAt: item.updated_date || item.updatedAt,
                    // Audit columns
                    CREATED_BY: item.CREATED_BY || null,
                    CREATION_DATE: item.CREATION_DATE || null,
                    LAST_UPDATED_BY: item.LAST_UPDATED_BY || null,
                    LAST_UPDATE_DATE: item.LAST_UPDATE_DATE || null,
                }))
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        } catch (error) {
            console.error('Error listing services:', error);
            throw error;
        }
    }

    async create(body: Omit<Service, 'id'>): Promise<Service> {
        try {
            console.log(
                'ServicesDynamoDBService.create called with body:',
                body,
            );

            const serviceId = uuidv4();
            const now = new Date().toISOString();

            // New PK/SK pattern: SERVICE#<id>
            const item = {
                PK: `SERVICE#${serviceId}`,
                SK: `SERVICE#${serviceId}`,
                id: serviceId,
                service_name: body.name,
                name: body.name, // Keep both for compatibility
                created_date: now,
                createdAt: now,
                updated_date: now,
                updatedAt: now,
                entity_type: 'service',
            };

            console.log('Service data to insert:', item);

            await DynamoDBOperations.putItem(this.tableName, item);

            const created = {
                id: serviceId,
                name: body.name,
                createdAt: now,
                updatedAt: now,
            };

            console.log('Created service:', created);
            return created;
        } catch (error) {
            console.error('Error creating service:', error);
            throw error;
        }
    }

    async update(
        id: string,
        body: Omit<Service, 'id'>,
    ): Promise<Service | null> {
        try {
            console.log(`Updating service with ID: ${id}`);

            const now = new Date().toISOString();

            const updateExpression =
                'SET service_name = :name, #name = :name, updated_date = :updated, updatedAt = :updated';
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
                            PK: `SERVICE#${id}`,
                            SK: `SERVICE#${id}`,
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
                name: result.service_name || result.name,
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('Error updating service:', error);
            if ((error as any).name === 'ConditionalCheckFailedException') {
                return null; // Item doesn't exist
            }
            throw error;
        }
    }

    async remove(id: string): Promise<void> {
        try {
            // Delete using SERVICE# format (new format)
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `SERVICE#${id}`,
                SK: `SERVICE#${id}`,
            });
            // Also try legacy SYSTIVA# format for cleanup
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `SYSTIVA#${id}`,
                SK: `SERVICE#${id}`,
            });
        } catch (error) {
            console.error('Error removing service:', error);
            throw error;
        }
    }

    async get(id: string): Promise<Service | null> {
        try {
            // Get using SERVICE#<id> / SERVICE#<id> format
            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `SERVICE#${id}`,
                SK: `SERVICE#${id}`,
            });

            if (!item) {
                return null;
            }

            return {
                id: item.id || id,
                name: item.service_name || item.name,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('Error getting service:', error);
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
                    ':type': 'service',
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
