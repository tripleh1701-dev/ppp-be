import {DynamoDBOperations} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';

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
}

export class PipelineCanvasDynamoDBService {
    private readonly tableName: string;

    constructor() {
        this.tableName =
            process.env.DYNAMODB_SYS_ACCOUNTS_TABLE || 'sys_accounts';
    }

    async list(): Promise<PipelineCanvas[]> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
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

    async get(id: string): Promise<PipelineCanvas | null> {
        try {
            console.log(`🔍 Looking for pipeline with ID: ${id}`);

            // Since we use composite PK/SK, we need to scan and filter by id attribute
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
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

            const item = items[0];
            console.log(`✅ Pipeline found:`, {
                id: item.id,
                pipelineName: item.pipeline_name || item.pipelineName,
                hasYaml: !!(item.yaml_content || item.yamlContent),
            });

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
            };
        } catch (error) {
            console.error(`❌ Error getting pipeline canvas ${id}:`, error);
            throw error;
        }
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

            // PK pattern: <ACCOUNT_NAME>#<accountId>#PIPELINES
            const accountPK = `${body.accountName.toUpperCase()}#${
                body.accountId
            }#PIPELINES`;
            const pipelineSK = `PIPELINE#${pipelineId}`;

            const item = {
                PK: accountPK,
                SK: pipelineSK,
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
                entity_type: 'pipeline_canvas',
            };

            console.log('Pipeline canvas data to insert:', item);
            console.log('Using PK:', accountPK, 'SK:', pipelineSK);

            await DynamoDBOperations.putItem(this.tableName, item);

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
            };

            console.log('Created pipeline canvas:', created);
            return created;
        } catch (error) {
            console.error('Error creating pipeline canvas:', error);
            throw error;
        }
    }

    // Helper method to get raw item with PK/SK for update/delete operations
    private async getRawItem(id: string): Promise<any | null> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'id = :id AND entity_type = :type',
                {
                    ':id': id,
                    ':type': 'pipeline_canvas',
                },
            );

            if (!items || items.length === 0) {
                return null;
            }

            return items[0];
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

            // First, get the existing item to retrieve accountId and accountName for PK/SK
            const existingItem = await this.getRawItem(id);
            if (!existingItem) {
                console.warn(`⚠️ Pipeline not found for update: ${id}`);
                return null;
            }

            const accountId = existingItem.account_id || existingItem.accountId;
            const accountName =
                existingItem.account_name || existingItem.accountName;

            if (!accountId || !accountName) {
                console.error(
                    `❌ Missing accountId or accountName for pipeline ${id}`,
                );
                return null;
            }

            // PK pattern: <ACCOUNT_NAME>#<accountId>#PIPELINES
            // SK pattern: PIPELINE#<pipelineId>
            const pk = `${accountName.toUpperCase()}#${accountId}#PIPELINES`;
            const sk = `PIPELINE#${id}`;

            console.log(`📝 Updating with PK: ${pk}, SK: ${sk}`);

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
                this.tableName,
                {
                    PK: pk,
                    SK: sk,
                },
                updateExpression,
                expressionAttributeValues,
                expressionAttributeNames,
            );

            console.log(`✅ Pipeline ${id} updated successfully`);
            return await this.get(id);
        } catch (error) {
            console.error(`Error updating pipeline canvas ${id}:`, error);
            throw error;
        }
    }

    async remove(id: string): Promise<boolean> {
        try {
            console.log(`Deleting pipeline canvas with ID: ${id}`);

            // First, get the existing item to retrieve accountId and accountName for PK/SK
            const existingItem = await this.getRawItem(id);
            if (!existingItem) {
                console.warn(`⚠️ Pipeline not found for deletion: ${id}`);
                return false;
            }

            const accountId = existingItem.account_id || existingItem.accountId;
            const accountName =
                existingItem.account_name || existingItem.accountName;

            if (!accountId || !accountName) {
                console.error(
                    `❌ Missing accountId or accountName for pipeline ${id}`,
                );
                return false;
            }

            // PK pattern: <ACCOUNT_NAME>#<accountId>#PIPELINES
            // SK pattern: PIPELINE#<pipelineId>
            const pk = `${accountName.toUpperCase()}#${accountId}#PIPELINES`;
            const sk = `PIPELINE#${id}`;

            console.log(`🗑️ Deleting with PK: ${pk}, SK: ${sk}`);

            await DynamoDBOperations.deleteItem(this.tableName, {
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
    ): Promise<PipelineCanvas[]> {
        try {
            // PK pattern: <ACCOUNT_NAME>#<accountId>#PIPELINES
            const accountPK = `${accountName.toUpperCase()}#${accountId}#PIPELINES`;

            console.log(`🔍 Querying pipelines for account PK: ${accountPK}`);

            // Query by PK to get all pipelines for this account
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :skPrefix)',
                {
                    ':pk': accountPK,
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
                }))
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
