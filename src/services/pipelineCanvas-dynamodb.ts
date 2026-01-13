import {DynamoDBOperations} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';
import {
    CrossAccountDynamoDBService,
    AccountAwsConfig,
} from './crossAccountDynamoDB';

export interface PipelineCanvas {
    id: string;
    pipelineName: string;
    details: string;
    service: string;
    entity: string;
    status: string;
    lastUpdated: string;
    createdAt: string;
    updatedAt: string;
    accountId?: string;
    accountName?: string;
    enterpriseId?: string;
    enterpriseName?: string;
    yamlContent?: string;
    createdBy?: string;
    cloudType?: 'public' | 'private'; // Cloud type for table selection
    awsAccountId?: string; // AWS account ID where the account's DynamoDB is provisioned
}

export class PipelineCanvasDynamoDBService {
    // Default table (fallback for listing across accounts)
    private readonly defaultTableName: string;
    // Cross-account DynamoDB service for account-specific tables
    private readonly crossAccountService: CrossAccountDynamoDBService;

    constructor() {
        this.defaultTableName =
            process.env.DYNAMODB_SYS_ACCOUNTS_TABLE || 'sys_accounts';
        this.crossAccountService = new CrossAccountDynamoDBService();
    }

    /**
     * Get the correct DynamoDB table name based on cloud type
     * - Public cloud: account-admin-public-dev
     * - Private cloud: account-<account_id>-admin-private-dev
     */
    private getTableName(
        accountId: string,
        cloudType?: 'public' | 'private',
    ): string {
        if (cloudType === 'private') {
            const tableName = `account-${accountId}-admin-private-dev`;
            console.log(
                `📦 Using PRIVATE account table: ${tableName} for account: ${accountId}`,
            );
            return tableName;
        }
        // Default to public
        const tableName = 'account-admin-public-dev';
        console.log(
            `📦 Using PUBLIC account table: ${tableName} for account: ${accountId}`,
        );
        return tableName;
    }

    /**
     * Generate PK following the convention: ACCOUNT#<ACCOUNT_id>
     */
    private generatePK(accountId: string): string {
        return `ACCOUNT#${accountId}`;
    }

    /**
     * Generate SK following the convention: PIPELINE#<pipelineId>
     */
    private generateSK(pipelineId: string): string {
        return `PIPELINE#${pipelineId}`;
    }

    async list(): Promise<PipelineCanvas[]> {
        try {
            // For listing all pipelines, we scan the default table
            // In production, you might want to query specific account tables
            const items = await DynamoDBOperations.scanItems(
                this.defaultTableName,
                'entity_type = :type',
                {
                    ':type': 'pipeline_canvas',
                },
            );

            return items
                .map((item) => ({
                    id: item.id,
                    pipelineName: item.pipeline_name || item.pipelineName,
                    details: item.details || '',
                    service: item.service || '',
                    entity: item.entity || '',
                    status: item.status || 'Active',
                    lastUpdated:
                        item.last_updated || item.lastUpdated || item.updatedAt,
                    createdAt: item.created_at || item.createdAt,
                    updatedAt: item.updated_at || item.updatedAt,
                    accountId: item.account_id || item.accountId,
                    accountName: item.account_name || item.accountName,
                    enterpriseId: item.enterprise_id || item.enterpriseId,
                    enterpriseName: item.enterprise_name || item.enterpriseName,
                    yamlContent: item.yaml_content || item.yamlContent,
                    createdBy: item.created_by || item.createdBy,
                    cloudType: item.cloud_type || item.cloudType,
                }))
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                );
        } catch (error) {
            console.error('Error listing pipeline canvas:', error);
            throw error;
        }
    }

    async get(
        id: string,
        accountId?: string,
        cloudType?: 'public' | 'private',
    ): Promise<PipelineCanvas | null> {
        try {
            console.log(`🔍 Looking for pipeline with ID: ${id}`);

            // If accountId is provided, use direct query with PK/SK
            if (accountId) {
                const tableName = this.getTableName(accountId, cloudType);
                const pk = this.generatePK(accountId);
                const sk = this.generateSK(id);

                console.log(
                    `📊 Querying table: ${tableName}, PK: ${pk}, SK: ${sk}`,
                );

                try {
                    const item = await DynamoDBOperations.getItem(tableName, {
                        PK: pk,
                        SK: sk,
                    });

                    if (item) {
                        return this.mapItemToPipeline(item);
                    }
                } catch (err) {
                    console.log(`⚠️ Direct query failed, falling back to scan`);
                }
            }

            // Fallback: scan default table by id
            const items = await DynamoDBOperations.scanItems(
                this.defaultTableName,
                'id = :id AND entity_type = :type',
                {
                    ':id': id,
                    ':type': 'pipeline_canvas',
                },
            );

            console.log(`📊 Found ${items.length} matching pipelines`);

            if (!items || items.length === 0) {
                console.warn(`⚠️ No pipeline found with ID: ${id}`);
                return null;
            }

            return this.mapItemToPipeline(items[0]);
        } catch (error) {
            console.error(`❌ Error getting pipeline canvas ${id}:`, error);
            throw error;
        }
    }

    private mapItemToPipeline(item: any): PipelineCanvas {
        return {
            id: item.id,
            pipelineName: item.pipeline_name || item.pipelineName,
            details: item.details || '',
            service: item.service || '',
            entity: item.entity || '',
            status: item.status || 'Active',
            lastUpdated:
                item.last_updated || item.lastUpdated || item.updatedAt,
            createdAt: item.created_at || item.createdAt,
            updatedAt: item.updated_at || item.updatedAt,
            accountId: item.account_id || item.accountId,
            accountName: item.account_name || item.accountName,
            enterpriseId: item.enterprise_id || item.enterpriseId,
            enterpriseName: item.enterprise_name || item.enterpriseName,
            yamlContent: item.yaml_content || item.yamlContent,
            createdBy: item.created_by || item.createdBy,
            cloudType: item.cloud_type || item.cloudType,
            awsAccountId: item.aws_account_id || item.awsAccountId,
        };
    }

    async create(
        body: Omit<PipelineCanvas, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<PipelineCanvas> {
        try {
            console.log(
                'PipelineCanvasDynamoDBService.create called with body:',
                body,
            );

            if (!body.accountId || !body.accountName) {
                throw new Error(
                    'accountId and accountName are required to create a pipeline',
                );
            }

            const pipelineId = uuidv4();
            const now = new Date().toISOString();

            // Get the correct table based on cloud type
            const tableName = this.getTableName(body.accountId, body.cloudType);

            // PK pattern: ACCOUNT#<ACCOUNT_id> (matching the Core Entities convention)
            const pk = this.generatePK(body.accountId);
            // SK pattern: PIPELINE#<pipelineId>
            const sk = this.generateSK(pipelineId);

            const item = {
                PK: pk,
                SK: sk,
                id: pipelineId,
                pipeline_name: body.pipelineName,
                pipelineName: body.pipelineName,
                details: body.details || '',
                service: body.service || '',
                entity: body.entity || '',
                status: body.status || 'Active',
                last_updated: body.lastUpdated || now,
                lastUpdated: body.lastUpdated || now,
                created_at: now,
                createdAt: now,
                updated_at: now,
                updatedAt: now,
                account_id: body.accountId,
                accountId: body.accountId,
                account_name: body.accountName,
                accountName: body.accountName,
                enterprise_id: body.enterpriseId,
                enterpriseId: body.enterpriseId,
                enterprise_name: body.enterpriseName,
                enterpriseName: body.enterpriseName,
                yaml_content: body.yamlContent,
                yamlContent: body.yamlContent,
                created_by: body.createdBy,
                createdBy: body.createdBy,
                cloud_type: body.cloudType || 'public',
                cloudType: body.cloudType || 'public',
                aws_account_id: body.awsAccountId,
                awsAccountId: body.awsAccountId,
                entity_type: 'pipeline_canvas',
            };

            console.log(`📦 Saving pipeline to table: ${tableName}`);
            console.log(`   PK: ${pk}`);
            console.log(`   SK: ${sk}`);
            console.log(`   Cloud Type: ${body.cloudType || 'public'}`);
            console.log(
                `   AWS Account ID: ${body.awsAccountId || 'default (local)'}`,
            );

            // Use cross-account DynamoDB if awsAccountId is provided
            if (body.awsAccountId) {
                const awsConfig: AccountAwsConfig = {
                    awsAccountId: body.awsAccountId,
                    cloudType: body.cloudType || 'public',
                    accountId: body.accountId,
                };
                console.log(
                    `🔑 Using cross-account access to AWS account: ${body.awsAccountId}`,
                );
                await this.crossAccountService.putItem(awsConfig, item);
            } else {
                // Use default DynamoDB (same AWS account)
                await DynamoDBOperations.putItem(tableName, item);
            }

            const created: PipelineCanvas = {
                id: pipelineId,
                pipelineName: body.pipelineName,
                details: body.details || '',
                service: body.service || '',
                entity: body.entity || '',
                status: body.status || 'Active',
                lastUpdated: body.lastUpdated || now,
                createdAt: now,
                updatedAt: now,
                accountId: body.accountId,
                accountName: body.accountName,
                enterpriseId: body.enterpriseId,
                enterpriseName: body.enterpriseName,
                yamlContent: body.yamlContent,
                createdBy: body.createdBy,
                cloudType: body.cloudType || 'public',
                awsAccountId: body.awsAccountId,
            };

            console.log('✅ Created pipeline canvas:', created);
            return created;
        } catch (error) {
            console.error('Error creating pipeline canvas:', error);
            throw error;
        }
    }

    // Helper method to get raw item with PK/SK for update/delete operations
    private async getRawItem(
        id: string,
        accountId?: string,
        cloudType?: 'public' | 'private',
    ): Promise<{item: any; tableName: string} | null> {
        try {
            // If accountId is provided, try direct get first
            if (accountId) {
                const tableName = this.getTableName(accountId, cloudType);
                const pk = this.generatePK(accountId);
                const sk = this.generateSK(id);

                try {
                    const item = await DynamoDBOperations.getItem(tableName, {
                        PK: pk,
                        SK: sk,
                    });

                    if (item) {
                        return {item, tableName};
                    }
                } catch (err) {
                    console.log(`⚠️ Direct get failed, trying scan`);
                }
            }

            // Fallback: scan default table
            const items = await DynamoDBOperations.scanItems(
                this.defaultTableName,
                'id = :id AND entity_type = :type',
                {
                    ':id': id,
                    ':type': 'pipeline_canvas',
                },
            );

            if (!items || items.length === 0) {
                return null;
            }

            return {item: items[0], tableName: this.defaultTableName};
        } catch (error) {
            console.error(`Error getting raw item for pipeline ${id}:`, error);
            throw error;
        }
    }

    async update(
        id: string,
        body: Partial<Omit<PipelineCanvas, 'id' | 'createdAt'>>,
    ): Promise<PipelineCanvas | null> {
        try {
            console.log(`Updating pipeline canvas with ID: ${id}`);

            // Get the existing item to determine table and PK/SK
            const result = await this.getRawItem(
                id,
                body.accountId,
                body.cloudType,
            );
            if (!result) {
                console.warn(`⚠️ Pipeline not found for update: ${id}`);
                return null;
            }

            const {item: existingItem, tableName} = result;
            const accountId = existingItem.account_id || existingItem.accountId;
            const cloudType =
                body.cloudType ||
                existingItem.cloud_type ||
                existingItem.cloudType ||
                'public';

            if (!accountId) {
                console.error(`❌ Missing accountId for pipeline ${id}`);
                return null;
            }

            // PK pattern: ACCOUNT#<ACCOUNT_id>
            // SK pattern: PIPELINE#<pipelineId>
            const pk = this.generatePK(accountId);
            const sk = this.generateSK(id);
            const targetTable = this.getTableName(accountId, cloudType);

            console.log(`📝 Updating in table: ${targetTable}`);
            console.log(`   PK: ${pk}, SK: ${sk}`);

            const now = new Date().toISOString();

            const updateParts: string[] = [];
            const expressionAttributeValues: any = {
                ':updated': now,
            };
            const expressionAttributeNames: any = {};

            if (body.pipelineName !== undefined) {
                updateParts.push(
                    'pipeline_name = :pipelineName, pipelineName = :pipelineName',
                );
                expressionAttributeValues[':pipelineName'] = body.pipelineName;
            }
            if (body.details !== undefined) {
                updateParts.push('details = :details');
                expressionAttributeValues[':details'] = body.details;
            }
            if (body.service !== undefined) {
                updateParts.push('service = :service');
                expressionAttributeValues[':service'] = body.service;
            }
            if (body.entity !== undefined) {
                updateParts.push('entity = :entity');
                expressionAttributeValues[':entity'] = body.entity;
            }
            if (body.status !== undefined) {
                updateParts.push('#status = :status');
                expressionAttributeNames['#status'] = 'status';
                expressionAttributeValues[':status'] = body.status;
            }
            if (body.yamlContent !== undefined) {
                updateParts.push(
                    'yaml_content = :yamlContent, yamlContent = :yamlContent',
                );
                expressionAttributeValues[':yamlContent'] = body.yamlContent;
            }
            if (body.lastUpdated !== undefined) {
                updateParts.push(
                    'last_updated = :lastUpdated, lastUpdated = :lastUpdated',
                );
                expressionAttributeValues[':lastUpdated'] = body.lastUpdated;
            }

            updateParts.push('updated_at = :updated, updatedAt = :updated');

            const updateExpression = 'SET ' + updateParts.join(', ');

            await DynamoDBOperations.updateItem(
                targetTable,
                {
                    PK: pk,
                    SK: sk,
                },
                updateExpression,
                expressionAttributeValues,
                expressionAttributeNames,
            );

            console.log(`✅ Pipeline ${id} updated successfully`);
            return await this.get(id, accountId, cloudType);
        } catch (error) {
            console.error(`Error updating pipeline canvas ${id}:`, error);
            throw error;
        }
    }

    async remove(
        id: string,
        accountId?: string,
        cloudType?: 'public' | 'private',
    ): Promise<boolean> {
        try {
            console.log(`Deleting pipeline canvas with ID: ${id}`);

            // Get the existing item to determine table and PK/SK
            const result = await this.getRawItem(id, accountId, cloudType);
            if (!result) {
                console.warn(`⚠️ Pipeline not found for deletion: ${id}`);
                return false;
            }

            const {item: existingItem} = result;
            const existingAccountId =
                accountId || existingItem.account_id || existingItem.accountId;
            const existingCloudType =
                cloudType ||
                existingItem.cloud_type ||
                existingItem.cloudType ||
                'public';

            if (!existingAccountId) {
                console.error(`❌ Missing accountId for pipeline ${id}`);
                return false;
            }

            // PK pattern: ACCOUNT#<ACCOUNT_id>
            // SK pattern: PIPELINE#<pipelineId>
            const pk = this.generatePK(existingAccountId);
            const sk = this.generateSK(id);
            const targetTable = this.getTableName(
                existingAccountId,
                existingCloudType,
            );

            console.log(`🗑️ Deleting from table: ${targetTable}`);
            console.log(`   PK: ${pk}, SK: ${sk}`);

            await DynamoDBOperations.deleteItem(targetTable, {
                PK: pk,
                SK: sk,
            });

            console.log(`✅ Successfully deleted pipeline canvas ${id}`);
            return true;
        } catch (error) {
            console.error(`Error deleting pipeline canvas ${id}:`, error);
            throw error;
        }
    }

    // Get pipelines filtered by account and enterprise
    async listByAccountEnterprise(
        accountId: string,
        accountName: string,
        enterpriseId?: string,
        cloudType?: 'public' | 'private',
    ): Promise<PipelineCanvas[]> {
        try {
            // Get the correct table based on cloud type
            const tableName = this.getTableName(accountId, cloudType);

            // PK pattern: ACCOUNT#<ACCOUNT_id>
            const pk = this.generatePK(accountId);

            console.log(
                `🔍 Querying pipelines from table: ${tableName}, PK: ${pk}`,
            );

            // Query by PK to get all pipelines for this account
            const items = await DynamoDBOperations.queryItems(
                tableName,
                'PK = :pk AND begins_with(SK, :skPrefix)',
                {
                    ':pk': pk,
                    ':skPrefix': 'PIPELINE#',
                },
            );

            console.log(
                `📊 Found ${items.length} pipelines for account ${accountName}`,
            );

            // Filter by enterpriseId if provided
            let filteredItems = items;
            if (enterpriseId) {
                filteredItems = items.filter(
                    (item) =>
                        item.enterprise_id === enterpriseId ||
                        item.enterpriseId === enterpriseId,
                );
                console.log(
                    `📊 After enterprise filter: ${filteredItems.length} pipelines`,
                );
            }

            return filteredItems
                .map((item) => this.mapItemToPipeline(item))
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                );
        } catch (error) {
            console.error(
                'Error listing pipeline canvas by account/enterprise:',
                error,
            );
            throw error;
        }
    }
}
