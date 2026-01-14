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
        // Table name from environment or default
        this.tableName =
            process.env.DYNAMODB_TABLE ||
            `systiva-admin-${
                process.env.WORKSPACE || process.env.NODE_ENV || 'dev'
            }`;
    }

    async list(): Promise<Enterprise[]> {
        try {
            const items = await DynamoDBOperations.scanItems(this.tableName);

            // Filter and transform enterprise items - use ENTERPRISE# pattern only
            return items
                .filter(
                    (item) =>
                        item.entity_type === 'enterprise' ||
                        (item.PK?.startsWith('ENTERPRISE#') &&
                            item.SK?.startsWith('ENTERPRISE#')),
                )
                .map((item) => ({
                    // Extract ID from ENTERPRISE# format
                    id:
                        item.id ||
                        item.PK?.replace('ENTERPRISE#', '') ||
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
            // Delete using ENTERPRISE# format (new format)
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `ENTERPRISE#${id}`,
                SK: `ENTERPRISE#${id}`,
            });
            // Also try legacy SYSTIVA# format for cleanup
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
            // Get using ENTERPRISE#<id> / ENTERPRISE#<id> format
            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `ENTERPRISE#${id}`,
                SK: `ENTERPRISE#${id}`,
            });

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
                id: item.id || item.PK?.replace('ENTERPRISE#', ''),
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

            // Find enterprise items specifically
            const enterpriseItems = items.filter(
                (item) =>
                    item.entity_type === 'enterprise' ||
                    (item.PK?.startsWith('ENTERPRISE#') &&
                        item.SK?.startsWith('ENTERPRISE#')),
            );

            // Group all items by PK prefix for analysis
            const pkPrefixes: Record<string, number> = {};
            items.forEach((item) => {
                const pk = item.PK || 'NO_PK';
                const prefix = pk.includes('#') ? pk.split('#')[0] : pk;
                pkPrefixes[prefix] = (pkPrefixes[prefix] || 0) + 1;
            });

            return {
                tableName: this.tableName,
                totalItems: items.length,
                enterpriseItemsCount: enterpriseItems.length,
                enterpriseItems: enterpriseItems.slice(0, 20).map((item) => ({
                    PK: item.PK,
                    SK: item.SK,
                    id: item.id,
                    name: item.enterprise_name || item.name,
                    entity_type: item.entity_type,
                })),
                pkPrefixes: pkPrefixes,
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
