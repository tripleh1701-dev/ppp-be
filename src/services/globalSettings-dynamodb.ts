import {v4 as uuidv4} from 'uuid';
import {DynamoDBOperations} from '../dynamodb';

export interface GlobalSettingEntity {
    id: string;
    accountId: string;
    accountName: string;
    enterpriseId: string;
    enterpriseName: string;
    entityName: string;
    configuration: {
        plan: string[];
        code: string[];
        build: string[];
        test: string[];
        release: string[];
        deploy: string[];
        others: string[];
    };
    createdAt?: string;
    updatedAt?: string;
}

export interface GlobalSettingResponse {
    accountId: string;
    accountName: string;
    enterpriseId: string;
    enterpriseName: string;
    entities: GlobalSettingEntity[];
}

export class GlobalSettingsDynamoDBService {
    private readonly tableName: string;

    constructor() {
        // Use sys_accounts table for storing global settings
        this.tableName =
            process.env.DYNAMODB_SYS_ACCOUNTS_TABLE || 'sys_accounts';
    }

    /**
     * Get all global setting entities for a specific account and enterprise
     */
    async getEntitiesByAccountAndEnterprise(
        accountId: string,
        accountName: string,
        enterpriseId: string,
    ): Promise<GlobalSettingEntity[]> {
        try {
            console.log(
                `🔍 Fetching global settings for account: ${accountId}, enterprise: ${enterpriseId}`,
            );

            const pk = `${accountName}#${accountId}#GLOBAL-SETTINGS`;

            // Query all items with this PK (all entities)
            const result = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk',
                {
                    ':pk': pk,
                },
            );

            console.log(`✅ Found ${result.length} global setting entities`);

            return result
                .filter((item: any) => item.enterprise_id === enterpriseId)
                .map((item: any) => ({
                    id: item.id || item.entity_id,
                    accountId: item.account_id,
                    accountName: item.account_name,
                    enterpriseId: item.enterprise_id,
                    enterpriseName: item.enterprise_name || '',
                    entityName: item.entity_name,
                    configuration: item.configuration || {
                        plan: [],
                        code: [],
                        build: [],
                        test: [],
                        release: [],
                        deploy: [],
                        others: [],
                    },
                    createdAt: item.created_date,
                    updatedAt: item.updated_date,
                }));
        } catch (error) {
            console.error('❌ Error fetching global settings:', error);
            throw error;
        }
    }

    /**
     * Get a specific entity configuration
     */
    async getEntity(
        accountId: string,
        accountName: string,
        enterpriseId: string,
        entityName: string,
    ): Promise<GlobalSettingEntity | null> {
        try {
            const pk = `${accountName}#${accountId}#GLOBAL-SETTINGS`;
            const sk = `ENTERPRISE#${enterpriseId}#ENTITY#${entityName}`;

            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            if (!item) {
                return null;
            }

            return {
                id: item.id || item.entity_id,
                accountId: item.account_id,
                accountName: item.account_name,
                enterpriseId: item.enterprise_id,
                enterpriseName: item.enterprise_name || '',
                entityName: item.entity_name,
                configuration: item.configuration || {
                    plan: [],
                    code: [],
                    build: [],
                    test: [],
                    release: [],
                    deploy: [],
                    others: [],
                },
                createdAt: item.created_date,
                updatedAt: item.updated_date,
            };
        } catch (error) {
            console.error('❌ Error getting entity:', error);
            throw error;
        }
    }

    /**
     * Create a new entity configuration
     */
    async createEntity(
        data: Omit<GlobalSettingEntity, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<GlobalSettingEntity> {
        try {
            const id = uuidv4();
            const now = new Date().toISOString();

            const pk = `${data.accountName}#${data.accountId}#GLOBAL-SETTINGS`;
            const sk = `ENTERPRISE#${data.enterpriseId}#ENTITY#${data.entityName}`;

            console.log(
                `🆕 Creating global setting entity: ${data.entityName} for account: ${data.accountId}, enterprise: ${data.enterpriseId}`,
            );

            const item = {
                PK: pk,
                SK: sk,
                id: id,
                entity_id: id,
                account_id: data.accountId,
                account_name: data.accountName,
                enterprise_id: data.enterpriseId,
                enterprise_name: data.enterpriseName,
                entity_name: data.entityName,
                configuration: data.configuration || {
                    plan: [],
                    code: [],
                    build: [],
                    test: [],
                    release: [],
                    deploy: [],
                    others: [],
                },
                created_date: now,
                updated_date: now,
                entity_type: 'GLOBAL_SETTING_ENTITY',
            };

            await DynamoDBOperations.putItem(this.tableName, item);

            console.log('✅ Global setting entity created successfully');

            return {
                id,
                accountId: data.accountId,
                accountName: data.accountName,
                enterpriseId: data.enterpriseId,
                enterpriseName: data.enterpriseName,
                entityName: data.entityName,
                configuration: data.configuration,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error('❌ Error creating entity:', error);
            throw error;
        }
    }

    /**
     * Update an entity configuration
     */
    async updateEntity(
        accountId: string,
        accountName: string,
        enterpriseId: string,
        entityName: string,
        configuration: GlobalSettingEntity['configuration'],
    ): Promise<GlobalSettingEntity | null> {
        try {
            const pk = `${accountName}#${accountId}#GLOBAL-SETTINGS`;
            const sk = `ENTERPRISE#${enterpriseId}#ENTITY#${entityName}`;
            const now = new Date().toISOString();

            console.log(
                `📝 Updating global setting entity: ${entityName} for account: ${accountId}, enterprise: ${enterpriseId}`,
            );

            // Get existing item first
            const existingItem = await DynamoDBOperations.getItem(
                this.tableName,
                {
                    PK: pk,
                    SK: sk,
                },
            );

            if (!existingItem) {
                console.log('❌ Entity not found');
                return null;
            }

            // Update the configuration
            const updatedItem = {
                ...existingItem,
                configuration,
                updated_date: now,
            };

            await DynamoDBOperations.putItem(this.tableName, updatedItem);

            console.log('✅ Global setting entity updated successfully');

            return {
                id: updatedItem.id || updatedItem.entity_id,
                accountId: updatedItem.account_id,
                accountName: updatedItem.account_name,
                enterpriseId: updatedItem.enterprise_id,
                enterpriseName: updatedItem.enterprise_name || '',
                entityName: updatedItem.entity_name,
                configuration: updatedItem.configuration,
                createdAt: updatedItem.created_date,
                updatedAt: updatedItem.updated_date,
            };
        } catch (error) {
            console.error('❌ Error updating entity:', error);
            throw error;
        }
    }

    /**
     * Delete an entity configuration
     */
    async deleteEntity(
        accountId: string,
        accountName: string,
        enterpriseId: string,
        entityName: string,
    ): Promise<void> {
        try {
            const pk = `${accountName}#${accountId}#GLOBAL-SETTINGS`;
            const sk = `ENTERPRISE#${enterpriseId}#ENTITY#${entityName}`;

            console.log(
                `🗑️ Deleting global setting entity: ${entityName} for account: ${accountId}, enterprise: ${enterpriseId}`,
            );

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            console.log('✅ Global setting entity deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting entity:', error);
            throw error;
        }
    }

    /**
     * Create or update multiple entities (batch save)
     */
    async batchSaveEntities(
        accountId: string,
        accountName: string,
        enterpriseId: string,
        enterpriseName: string,
        entities: Array<{
            entityName: string;
            configuration: GlobalSettingEntity['configuration'];
        }>,
    ): Promise<GlobalSettingEntity[]> {
        try {
            console.log(
                `💾 Batch saving ${entities.length} global setting entities`,
            );

            const results: GlobalSettingEntity[] = [];

            for (const entity of entities) {
                // Check if entity exists
                const existing = await this.getEntity(
                    accountId,
                    accountName,
                    enterpriseId,
                    entity.entityName,
                );

                if (existing) {
                    // Update existing entity
                    const updated = await this.updateEntity(
                        accountId,
                        accountName,
                        enterpriseId,
                        entity.entityName,
                        entity.configuration,
                    );
                    if (updated) {
                        results.push(updated);
                    }
                } else {
                    // Create new entity
                    const created = await this.createEntity({
                        accountId,
                        accountName,
                        enterpriseId,
                        enterpriseName,
                        entityName: entity.entityName,
                        configuration: entity.configuration,
                    });
                    results.push(created);
                }
            }

            console.log(
                '✅ Batch save completed for all global setting entities',
            );

            return results;
        } catch (error) {
            console.error('❌ Error batch saving entities:', error);
            throw error;
        }
    }
}
