import {DynamoDBOperations, withDynamoDB} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';

export interface Enterprise {
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

export class EnterprisesDynamoDBService {
    private readonly tableName: string;

    constructor(dir?: string) {
        // Table name from environment or default to 'systiva'
        this.tableName = process.env.DYNAMODB_SYSTIVA_TABLE || 'systiva';
    }

    async list(): Promise<Enterprise[]> {
        try {
            const items = await DynamoDBOperations.scanItems(this.tableName);

            // Filter and transform enterprise items - support both old SYSTIVA# and new ENTERPRISE# patterns
            return items
                .filter(
                    (item) =>
                        item.entity_type === 'enterprise' ||
                        (item.PK?.startsWith('ENTERPRISE#') &&
                            item.SK?.startsWith('ENTERPRISE#')) ||
                        (item.PK?.startsWith('SYSTIVA#') &&
                            item.SK?.startsWith('ENTERPRISE#')),
                )
                .map((item) => ({
                    // Extract ID from new ENTERPRISE# format or old SYSTIVA# format
                    id:
                        item.id ||
                        item.PK?.replace('ENTERPRISE#', '').replace(
                            'SYSTIVA#',
                            '',
                        ) ||
                        item.SK?.replace('ENTERPRISE#', ''),
                    name: item.enterprise_name || item.name,
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
            console.error('Error listing enterprises:', error);
            throw error;
        }
    }

    async create(body: Omit<Enterprise, 'id'>): Promise<Enterprise> {
        try {
            const enterpriseId = uuidv4();
            const now = new Date().toISOString();

            // New PK/SK pattern: ENTERPRISE#<id> for both PK and SK
            const item = {
                PK: `ENTERPRISE#${enterpriseId}`,
                SK: `ENTERPRISE#${enterpriseId}`,
                id: enterpriseId,
                enterprise_name: body.name,
                name: body.name, // Keep both for compatibility
                created_date: now,
                createdAt: now,
                updated_date: now,
                updatedAt: now,
                entity_type: 'enterprise',
            };

            await DynamoDBOperations.putItem(this.tableName, item);

            return {
                id: enterpriseId,
                name: body.name,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error('Error creating enterprise:', error);
            throw error;
        }
    }

    async update(
        id: string,
        body: Omit<Enterprise, 'id'>,
    ): Promise<Enterprise | null> {
        try {
            console.log(`Updating enterprise with ID: ${id}`);

            const now = new Date().toISOString();

            const updateExpression =
                'SET enterprise_name = :name, #name = :name, updated_date = :updated, updatedAt = :updated';
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
                            PK: `ENTERPRISE#${id}`,
                            SK: `ENTERPRISE#${id}`,
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
                name: result.enterprise_name || result.name,
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('Error updating enterprise:', error);
            if ((error as any).name === 'ConditionalCheckFailedException') {
                return null; // Item doesn't exist
            }
            throw error;
        }
    }

    async remove(id: string): Promise<void> {
        try {
            // Try new format first, then old format
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `ENTERPRISE#${id}`,
                SK: `ENTERPRISE#${id}`,
            }).catch(() => {});
            // Also try old SYSTIVA# format for backward compatibility
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `SYSTIVA#${id}`,
                SK: `ENTERPRISE#${id}`,
            });
        } catch (error) {
            console.error('Error removing enterprise:', error);
            throw error;
        }
    }

    async get(id: string): Promise<Enterprise | null> {
        try {
            // Try new format first
            let item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `ENTERPRISE#${id}`,
                SK: `ENTERPRISE#${id}`,
            });

            // Fallback to old SYSTIVA# format
            if (!item) {
                item = await DynamoDBOperations.getItem(this.tableName, {
                    PK: `SYSTIVA#${id}`,
                    SK: `ENTERPRISE#${id}`,
                });
            }

            if (!item) {
                return null;
            }

            return {
                id: item.id || id,
                name: item.enterprise_name || item.name,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
                // Audit columns
                CREATED_BY: item.CREATED_BY || null,
                CREATION_DATE: item.CREATION_DATE || null,
                LAST_UPDATED_BY: item.LAST_UPDATED_BY || null,
                LAST_UPDATE_DATE: item.LAST_UPDATE_DATE || null,
            };
        } catch (error) {
            console.error('Error getting enterprise:', error);
            throw error;
        }
    }

    // Additional DynamoDB-specific methods

    async getByName(name: string): Promise<Enterprise | null> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'enterprise_name = :name OR #name = :name',
                {
                    ':name': name,
                },
            );

            if (items.length === 0) {
                return null;
            }

            const item = items[0];
            return {
                id:
                    item.id ||
                    item.PK?.replace('ENTERPRISE#', '').replace('SYSTIVA#', ''),
                name: item.enterprise_name || item.name,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('Error getting enterprise by name:', error);
            throw error;
        }
    }

    // Method to migrate data from PostgreSQL to DynamoDB
    async migrateFromPostgreSQL(
        pgEnterprises: Array<{id: number; name: string}>,
    ): Promise<void> {
        try {
            console.log(
                `Migrating ${pgEnterprises.length} enterprises to DynamoDB...`,
            );

            for (const pgEnterprise of pgEnterprises) {
                const enterpriseId = pgEnterprise.id.toString(); // Convert number to string
                const now = new Date().toISOString();

                // Use new PK/SK pattern for migration
                const item = {
                    PK: `ENTERPRISE#${enterpriseId}`,
                    SK: `ENTERPRISE#${enterpriseId}`,
                    id: enterpriseId,
                    enterprise_name: pgEnterprise.name,
                    name: pgEnterprise.name,
                    created_date: now,
                    createdAt: now,
                    updated_date: now,
                    updatedAt: now,
                    entity_type: 'enterprise',
                    migrated_from_pg: true,
                    original_pg_id: pgEnterprise.id,
                };

                await DynamoDBOperations.putItem(this.tableName, item);
                console.log(
                    `Migrated enterprise: ${pgEnterprise.name} (ID: ${enterpriseId})`,
                );
            }

            console.log('Migration completed successfully');
        } catch (error) {
            console.error('Error during migration:', error);
            throw error;
        }
    }

    // Debug method to check table contents
    async debugTableContents(): Promise<any> {
        try {
            const items = await DynamoDBOperations.scanItems(this.tableName);
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
