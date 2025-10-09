import {v4 as uuidv4} from 'uuid';
import {DynamoDBOperations} from '../dynamodb';

export interface Environment {
    id: string;
    environmentName: string;
    details: string;
    deploymentType: 'Integration' | 'Extension';
    testConnectivity: 'Success' | 'Failed' | 'Pending' | 'Not Tested';
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
    url?: string;
    credentialName?: string;
    tags?: string[];
    environmentType?: 'Preproduction' | 'Production';
    accountId?: string;
    accountName?: string;
    enterpriseId?: string;
    createdAt?: string;
    updatedAt?: string;
}

export class EnvironmentsDynamoDBService {
    private readonly tableName: string;

    constructor() {
        this.tableName = 'sys_accounts';
    }

    async getAll(): Promise<Environment[]> {
        try {
            console.log(
                '📋 Listing all environments from DynamoDB table:',
                this.tableName,
            );

            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {
                    ':type': 'environment',
                },
            );

            console.log(`✅ Found ${items.length} environments`);

            return items
                .map((item) => this.mapDynamoDBItemToEnvironment(item))
                .sort((a, b) =>
                    (a.environmentName || '').localeCompare(
                        b.environmentName || '',
                    ),
                );
        } catch (error) {
            console.error('❌ Error listing environments:', error);
            throw error;
        }
    }

    async getByAccountId(accountId: string): Promise<Environment[]> {
        try {
            console.log('🔍 Getting environments for account:', accountId);

            // Query by PK pattern for the account
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'begins_with(PK, :pk) AND begins_with(SK, :sk)',
                {
                    ':pk': `#${accountId}#ENVIRONMENTS`,
                    ':sk': 'ENVIRONMENT#',
                },
            );

            console.log(
                `✅ Found ${items.length} environments for account ${accountId}`,
            );

            return items.map((item) => this.mapDynamoDBItemToEnvironment(item));
        } catch (error) {
            console.error('❌ Error getting environments by account:', error);
            return [];
        }
    }

    async getById(id: string): Promise<Environment | null> {
        try {
            console.log('🔍 Getting environment:', id);

            // We need to scan since we don't know the account
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'id = :id AND entity_type = :type',
                {
                    ':id': id,
                    ':type': 'environment',
                },
            );

            if (!items || items.length === 0) {
                console.log('❌ Environment not found:', id);
                return null;
            }

            return this.mapDynamoDBItemToEnvironment(items[0]);
        } catch (error) {
            console.error('❌ Error getting environment:', error);
            return null;
        }
    }

    async create(
        environment: Omit<Environment, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<Environment> {
        try {
            const environmentId = uuidv4();
            const now = new Date().toISOString();

            const newEnvironment: Environment = {
                id: environmentId,
                ...environment,
                createdAt: now,
                updatedAt: now,
            };

            // Use account name from payload (sent from frontend breadcrumb)
            const accountName = (
                environment.accountName || 'SYSTIVA'
            ).toUpperCase();
            const accountId = environment.accountId || 'systiva';

            console.log('🏢 Creating environment with account context:', {
                accountName,
                accountId,
                enterpriseId: environment.enterpriseId,
            });

            // Create PK format: <ACCOUNT_NAME>#<account_id>#ENVIRONMENTS
            const accountPK = `${accountName}#${accountId}#ENVIRONMENTS`;

            const item = {
                PK: accountPK,
                SK: `ENVIRONMENT#${environmentId}`,
                id: environmentId,
                account_id: environment.accountId || null,
                account_name: accountName,
                enterprise_id: environment.enterpriseId || null,
                environment_name: newEnvironment.environmentName,
                details: newEnvironment.details,
                deployment_type: newEnvironment.deploymentType,
                test_connectivity: newEnvironment.testConnectivity,
                status: newEnvironment.status,
                url: newEnvironment.url || null,
                credential_name: newEnvironment.credentialName || null,
                tags: newEnvironment.tags || [],
                environment_type: newEnvironment.environmentType || null,
                created_date: now,
                updated_date: now,
                entity_type: 'environment',
            };

            console.log(
                '💾 Creating environment in DynamoDB with PK:',
                accountPK,
            );
            console.log('📝 Full item:', item);

            await DynamoDBOperations.putItem(this.tableName, item);

            console.log('✅ Environment created successfully:', environmentId);

            return newEnvironment;
        } catch (error) {
            console.error('❌ Error creating environment:', error);
            throw error;
        }
    }

    async update(
        id: string,
        updates: Partial<Environment>,
    ): Promise<Environment | null> {
        try {
            console.log('📝 Updating environment:', id, updates);

            // First, find the environment to get its PK and SK
            const existing = await this.getById(id);
            if (!existing) {
                console.log('❌ Environment not found for update:', id);
                return null;
            }

            // Use account name from existing environment
            const accountName = (
                existing.accountName || 'SYSTIVA'
            ).toUpperCase();
            const accountId = existing.accountId || 'systiva';
            const pk = `${accountName}#${accountId}#ENVIRONMENTS`;
            const sk = `ENVIRONMENT#${id}`;

            const now = new Date().toISOString();

            // Build update expression
            const updateFields: string[] = [];
            const expressionAttributeValues: Record<string, any> = {
                ':updated': now,
            };
            const expressionAttributeNames: Record<string, string> = {};

            if (updates.environmentName !== undefined) {
                updateFields.push('#environment_name = :environment_name');
                expressionAttributeValues[':environment_name'] =
                    updates.environmentName;
                expressionAttributeNames['#environment_name'] =
                    'environment_name';
            }
            if (updates.details !== undefined) {
                updateFields.push('details = :details');
                expressionAttributeValues[':details'] = updates.details;
            }
            if (updates.deploymentType !== undefined) {
                updateFields.push('deployment_type = :deployment_type');
                expressionAttributeValues[':deployment_type'] =
                    updates.deploymentType;
            }
            if (updates.testConnectivity !== undefined) {
                updateFields.push('test_connectivity = :test_connectivity');
                expressionAttributeValues[':test_connectivity'] =
                    updates.testConnectivity;
            }
            if (updates.status !== undefined) {
                updateFields.push('#status = :status');
                expressionAttributeValues[':status'] = updates.status;
                expressionAttributeNames['#status'] = 'status';
            }
            if (updates.url !== undefined) {
                updateFields.push('url = :url');
                expressionAttributeValues[':url'] = updates.url;
            }
            if (updates.credentialName !== undefined) {
                updateFields.push('credential_name = :credential_name');
                expressionAttributeValues[':credential_name'] =
                    updates.credentialName;
            }
            if (updates.tags !== undefined) {
                updateFields.push('tags = :tags');
                expressionAttributeValues[':tags'] = updates.tags;
            }
            if (updates.environmentType !== undefined) {
                updateFields.push('environment_type = :environment_type');
                expressionAttributeValues[':environment_type'] =
                    updates.environmentType;
            }
            if (updates.accountId !== undefined) {
                updateFields.push('account_id = :account_id');
                expressionAttributeValues[':account_id'] = updates.accountId;
            }
            if (updates.enterpriseId !== undefined) {
                updateFields.push('enterprise_id = :enterprise_id');
                expressionAttributeValues[':enterprise_id'] =
                    updates.enterpriseId;
            }

            if (updateFields.length === 0) {
                return existing;
            }

            const updateExpression = `SET ${updateFields.join(
                ', ',
            )}, updated_date = :updated`;

            console.log('📝 DynamoDB UpdateCommand:', {
                TableName: this.tableName,
                Key: {PK: pk, SK: sk},
                UpdateExpression: updateExpression,
            });

            await DynamoDBOperations.updateItem(
                this.tableName,
                {PK: pk, SK: sk},
                updateExpression,
                expressionAttributeValues,
                Object.keys(expressionAttributeNames).length > 0
                    ? expressionAttributeNames
                    : undefined,
            );

            console.log('✅ Environment updated successfully');

            // Return updated environment
            return await this.getById(id);
        } catch (error) {
            console.error('❌ Error updating environment:', error);
            throw error;
        }
    }

    async delete(id: string): Promise<boolean> {
        try {
            console.log('🗑️ Deleting environment:', id);

            // First, find the environment to get its PK and SK
            const existing = await this.getById(id);
            if (!existing) {
                console.log('❌ Environment not found for deletion:', id);
                return false;
            }

            // Use account name from existing environment
            const accountName = (
                existing.accountName || 'SYSTIVA'
            ).toUpperCase();
            const accountId = existing.accountId || 'systiva';
            const pk = `${accountName}#${accountId}#ENVIRONMENTS`;
            const sk = `ENVIRONMENT#${id}`;

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            console.log('✅ Environment deleted successfully');
            return true;
        } catch (error) {
            console.error('❌ Error deleting environment:', error);
            return false;
        }
    }

    private mapDynamoDBItemToEnvironment(item: any): Environment {
        return {
            id: item.id,
            environmentName:
                item.environment_name || item.environmentName || '',
            details: item.details || '',
            deploymentType:
                item.deployment_type || item.deploymentType || 'Integration',
            testConnectivity:
                item.test_connectivity || item.testConnectivity || 'Not Tested',
            status: item.status || 'PENDING',
            url: item.url || undefined,
            credentialName:
                item.credential_name || item.credentialName || undefined,
            tags: item.tags || [],
            environmentType:
                item.environment_type || item.environmentType || undefined,
            accountId: item.account_id || item.accountId || undefined,
            accountName: item.account_name || item.accountName || undefined,
            enterpriseId: item.enterprise_id || item.enterpriseId || undefined,
            createdAt: item.created_date || item.createdAt,
            updatedAt: item.updated_date || item.updatedAt,
        };
    }
}
