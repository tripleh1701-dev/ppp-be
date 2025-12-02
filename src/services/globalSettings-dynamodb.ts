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
     * Get all global setting entities from the database (no filters)
     */
    async getAllEntities(): Promise<GlobalSettingEntity[]> {
        try {
            console.log('🔍 Fetching all global settings entities from database');

            // Scan all items with entity_type = GLOBAL_SETTING_ENTITY
            const result = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {
                    ':type': 'GLOBAL_SETTING_ENTITY',
                },
            );

            console.log(`✅ Found ${result.length} global setting entities`);

            return result.map((item: any) => {
                // Normalize configuration - handle string values like "Not configured"
                let config = item.configuration;
                if (typeof config === 'string' || !config || !(typeof config === 'object')) {
                    config = {
                        plan: [],
                        code: [],
                        build: [],
                        test: [],
                        release: [],
                        deploy: [],
                        others: [],
                    };
                }
                return {
                    id: item.id || item.entity_id,
                    accountId: item.account_id,
                    accountName: item.account_name,
                    enterpriseId: item.enterprise_id,
                    enterpriseName: item.enterprise_name || '',
                    entityName: item.entity_name,
                    configuration: config,
                    createdAt: item.created_date,
                    updatedAt: item.updated_date,
                };
            });
        } catch (error) {
            console.error('❌ Error fetching all global settings:', error);
            throw error;
        }
    }

    /**
     * Get all global setting entities for a specific account and enterprise
     */
    async getEntitiesByAccountAndEnterprise(
        accountId: string,
        accountName: string,
        enterpriseId: string,
        enterpriseName: string,
    ): Promise<GlobalSettingEntity[]> {
        try {
            console.log(
                `🔍 Fetching global settings for account: ${accountId} (${accountName}), enterprise: ${enterpriseId} (${enterpriseName})`,
            );

            const pk = `${accountName}#${accountId}#GLOBAL-SETTINGS`;
            const normalizedEnterpriseName = enterpriseName.toLowerCase();

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
                .filter(
                    (item: any) =>
                        item.enterprise_id === enterpriseId &&
                        (item.enterprise_name || '').toLowerCase() ===
                            normalizedEnterpriseName,
                )
                .map((item: any) => {
                    // Normalize configuration - handle string values like "Not configured"
                    let config = item.configuration;
                    if (typeof config === 'string' || !config || !(typeof config === 'object')) {
                        config = {
                            plan: [],
                            code: [],
                            build: [],
                            test: [],
                            release: [],
                            deploy: [],
                            others: [],
                        };
                    }
                    return {
                        id: item.id || item.entity_id,
                        accountId: item.account_id,
                        accountName: item.account_name,
                        enterpriseId: item.enterprise_id,
                        enterpriseName: item.enterprise_name || '',
                        entityName: item.entity_name,
                        configuration: config,
                        createdAt: item.created_date,
                        updatedAt: item.updated_date,
                    };
                });
        } catch (error) {
            console.error('❌ Error fetching global settings:', error);
            throw error;
        }
    }

    /**
     * Get a specific entity by ID
     */
    async getEntityById(id: string): Promise<GlobalSettingEntity | null> {
        try {
            console.log(`🔍 Fetching global setting entity by ID: ${id}`);

            // Scan all entities and filter by ID in memory
            // This is more reliable than using FilterExpression with reserved words
            const allEntities = await this.getAllEntities();
            const found = allEntities.find(e => e.id === id);
            
            if (!found) {
                console.log('❌ Entity not found by ID');
                return null;
            }

            console.log('✅ Entity found by ID');
            return found;
        } catch (error) {
            console.error('❌ Error getting entity by ID:', error);
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
        enterpriseName: string,
        entityName: string,
    ): Promise<GlobalSettingEntity | null> {
        try {
            const pk = `${accountName}#${accountId}#GLOBAL-SETTINGS`;
            const sk = `ENTERPRISE#${enterpriseId}#ENTITY#${entityName}`;
            const normalizedEnterpriseName = enterpriseName.toLowerCase();

            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            if (
                !item ||
                (item.enterprise_name || '').toLowerCase() !==
                    normalizedEnterpriseName
            ) {
                return null;
            }

            // Normalize configuration - handle string values like "Not configured"
            let config = item.configuration;
            if (typeof config === 'string' || !config || !(typeof config === 'object')) {
                config = {
                    plan: [],
                    code: [],
                    build: [],
                    test: [],
                    release: [],
                    deploy: [],
                    others: [],
                };
            }

            return {
                id: item.id || item.entity_id,
                accountId: item.account_id,
                accountName: item.account_name,
                enterpriseId: item.enterprise_id,
                enterpriseName: item.enterprise_name || '',
                entityName: item.entity_name,
                configuration: config,
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
     * Update an entity configuration by ID
     * Handles entity name changes by updating the existing record
     */
    async updateEntityById(
        recordId: string,
        accountId: string,
        accountName: string,
        enterpriseId: string,
        enterpriseName: string,
        newEntityName: string,
        configuration: GlobalSettingEntity['configuration'],
    ): Promise<GlobalSettingEntity | null> {
        try {
            const now = new Date().toISOString();
            const normalizedEnterpriseName = enterpriseName.toLowerCase();

            console.log(
                `📝 Updating global setting entity by ID: ${recordId}, new entity name: ${newEntityName}, account: ${accountId} (${accountName}), enterprise: ${enterpriseId} (${enterpriseName})`,
            );

            // Get existing item by ID
            const existingItem = await this.getEntityById(recordId);

            if (!existingItem) {
                console.log('❌ Entity not found by ID');
                return null;
            }

            // Verify account and enterprise match
            if (
                existingItem.accountId !== accountId ||
                existingItem.accountName !== accountName ||
                existingItem.enterpriseId !== enterpriseId ||
                (existingItem.enterpriseName || '').toLowerCase() !== normalizedEnterpriseName
            ) {
                console.log('❌ Account or enterprise mismatch');
                return null;
            }

            const pk = `${accountName}#${accountId}#GLOBAL-SETTINGS`;
            const oldSk = `ENTERPRISE#${enterpriseId}#ENTITY#${existingItem.entityName}`;
            const newSk = `ENTERPRISE#${enterpriseId}#ENTITY#${newEntityName}`;
            const entityNameChanged = existingItem.entityName !== newEntityName;

            let updatedItem: any;

            if (entityNameChanged) {
                console.log(`📝 Entity name changed from "${existingItem.entityName}" to "${newEntityName}"`);
                
                // Update the existing record with new entity name
                // Note: DynamoDB doesn't allow updating the Sort Key (SK) directly,
                // so we need to update the item with new SK and remove the old one
                // But we preserve all data including ID and creation date to make it feel like an update
                updatedItem = {
                    PK: pk,
                    SK: newSk, // New sort key with new entity name
                    id: recordId, // Keep the same ID
                    entity_id: recordId,
                    account_id: accountId,
                    account_name: accountName,
                    enterprise_id: enterpriseId,
                    enterprise_name: enterpriseName,
                    entity_name: newEntityName, // Update entity name field
                    configuration: configuration || {
                        plan: [],
                        code: [],
                        build: [],
                        test: [],
                        release: [],
                        deploy: [],
                        others: [],
                    },
                    created_date: existingItem.createdAt || now, // Preserve original creation date
                    updated_date: now,
                    entity_type: 'GLOBAL_SETTING_ENTITY',
                };
                
                // Since DynamoDB doesn't support updating the Sort Key (SK),
                // we need to write the updated item first, then delete the old one
                // This ensures data integrity - if delete fails, we still have the updated record
                await DynamoDBOperations.putItem(this.tableName, updatedItem);
                console.log('✅ Updated record with new entity name');
                
                // Remove the old record with old SK (only if SK actually changed)
                if (oldSk !== newSk) {
                    console.log(`🗑️ Removing old record entry with entity name: ${existingItem.entityName}`);
                    try {
                        await DynamoDBOperations.deleteItem(this.tableName, {
                            PK: pk,
                            SK: oldSk,
                        });
                        console.log('✅ Old record entry removed successfully');
                    } catch (deleteError) {
                        console.error('⚠️ Warning: Failed to remove old record entry:', deleteError);
                        // The updated record is already saved, so this is not critical
                    }
                }
                
                // Return the updated item (already saved above)
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
            } else {
                // Entity name unchanged, just update configuration
                console.log('📝 Entity name unchanged, updating configuration');
                updatedItem = {
                    PK: pk,
                    SK: oldSk,
                    id: recordId,
                    entity_id: recordId,
                    account_id: accountId,
                    account_name: accountName,
                    enterprise_id: enterpriseId,
                    enterprise_name: enterpriseName,
                    entity_name: newEntityName,
                    configuration: configuration || {
                        plan: [],
                        code: [],
                        build: [],
                        test: [],
                        release: [],
                        deploy: [],
                        others: [],
                    },
                    created_date: existingItem.createdAt || now,
                    updated_date: now,
                    entity_type: 'GLOBAL_SETTING_ENTITY',
                };
            }

            await DynamoDBOperations.putItem(this.tableName, updatedItem);

            console.log('✅ Global setting entity saved successfully');

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
            console.error('❌ Error updating entity by ID:', error);
            throw error;
        }
    }

    /**
     * Update an entity configuration (upsert - creates if doesn't exist)
     * Handles entity name changes by updating the existing record
     * @deprecated Use updateEntityById instead
     */
    async updateEntity(
        accountId: string,
        accountName: string,
        enterpriseId: string,
        enterpriseName: string,
        oldEntityName: string,
        newEntityName: string,
        configuration: GlobalSettingEntity['configuration'],
    ): Promise<GlobalSettingEntity | null> {
        try {
            const pk = `${accountName}#${accountId}#GLOBAL-SETTINGS`;
            const oldSk = `ENTERPRISE#${enterpriseId}#ENTITY#${oldEntityName}`;
            const newSk = `ENTERPRISE#${enterpriseId}#ENTITY#${newEntityName}`;
            const now = new Date().toISOString();
            const normalizedEnterpriseName = enterpriseName.toLowerCase();
            const entityNameChanged = oldEntityName !== newEntityName;

            console.log(
                `📝 Updating/Upserting global setting entity: ${oldEntityName}${entityNameChanged ? ` -> ${newEntityName} (renamed)` : ''} for account: ${accountId} (${accountName}), enterprise: ${enterpriseId} (${enterpriseName})`,
            );

            // Get existing item using old entity name (from URL parameter)
            const existingItem = await DynamoDBOperations.getItem(
                this.tableName,
                {
                    PK: pk,
                    SK: oldSk,
                },
            );

            let updatedItem: any;

            if (
                !existingItem ||
                (existingItem.enterprise_name || '').toLowerCase() !==
                    normalizedEnterpriseName
            ) {
                // Entity doesn't exist with old name, create new one with new name
                console.log('📝 Entity not found, creating new entity');
                const id = uuidv4();
                updatedItem = {
                    PK: pk,
                    SK: newSk,
                    id: id,
                    entity_id: id,
                    account_id: accountId,
                    account_name: accountName,
                    enterprise_id: enterpriseId,
                    enterprise_name: enterpriseName,
                    entity_name: newEntityName,
                    configuration: configuration || {
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
            } else {
                // Entity exists, update it
                console.log('📝 Entity found, updating existing entity');
                
                // If entity name changed, we need to handle the SK change
                if (entityNameChanged) {
                    console.log(`📝 Entity name changed from "${oldEntityName}" to "${newEntityName}"`);
                    
                    // Create new item with new SK (new entity name)
                    updatedItem = {
                        ...existingItem,
                        PK: pk,
                        SK: newSk, // New sort key with new entity name
                        entity_name: newEntityName, // Update entity name
                        configuration,
                        enterprise_name: enterpriseName,
                        updated_date: now,
                    };
                    
                    // Delete old item with old SK (old entity name)
                    // Only delete if the SK is different (entity name changed)
                    if (oldSk !== newSk) {
                        console.log(`🗑️ Deleting old record with entity name: ${oldEntityName}`);
                        try {
                            await DynamoDBOperations.deleteItem(this.tableName, {
                                PK: pk,
                                SK: oldSk,
                            });
                            console.log('✅ Old record deleted successfully');
                        } catch (deleteError) {
                            console.error('⚠️ Warning: Failed to delete old record:', deleteError);
                            // Continue anyway - the new record is created
                        }
                    }
                } else {
                    // Entity name unchanged, just update configuration
                    updatedItem = {
                        ...existingItem,
                        configuration,
                        enterprise_name: enterpriseName,
                        updated_date: now,
                    };
                }
            }

            await DynamoDBOperations.putItem(this.tableName, updatedItem);

            console.log('✅ Global setting entity saved successfully');

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
        enterpriseName: string,
        entityName: string,
    ): Promise<void> {
        try {
            const pk = `${accountName}#${accountId}#GLOBAL-SETTINGS`;
            const sk = `ENTERPRISE#${enterpriseId}#ENTITY#${entityName}`;
            const normalizedEnterpriseName = enterpriseName.toLowerCase();

            console.log(
                `🗑️ Deleting global setting entity: ${entityName} for account: ${accountId} (${accountName}), enterprise: ${enterpriseId} (${enterpriseName})`,
            );

            const existingItem = await DynamoDBOperations.getItem(
                this.tableName,
                {
                    PK: pk,
                    SK: sk,
                },
            );

            if (
                !existingItem ||
                (existingItem.enterprise_name || '').toLowerCase() !==
                    normalizedEnterpriseName
            ) {
                console.log('❌ Entity not found for deletion');
                return;
            }

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
}
