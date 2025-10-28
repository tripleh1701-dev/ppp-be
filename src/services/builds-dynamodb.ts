import {v4 as uuidv4} from 'uuid';
import {DynamoDBOperations} from '../dynamodb';

export interface Build {
    id: string;
    buildName: string;
    description: string;
    entity: string;
    pipeline: string;
    status: string;
    artifact: string;
    build: string;
    accountId: string;
    accountName: string;
    enterpriseId?: string;
    enterpriseName?: string;
    stages?: Array<{
        id: string;
        name: string;
        status: string;
        deployedAt: string;
    }>;
    createdAt: string;
    updatedAt: string;
}

export class BuildsDynamoDBService {
    private readonly tableName: string;

    constructor() {
        this.tableName =
            process.env.DYNAMODB_SYS_ACCOUNTS_TABLE || 'sys_accounts';
    }

    /**
     * List all builds for a specific account and enterprise
     */
    async list(
        accountId: string,
        accountName: string,
        enterpriseId?: string,
    ): Promise<Build[]> {
        try {
            // PK pattern: <ACCOUNT_NAME>#<accountId>#BUILDS
            const pk = `${accountName.toUpperCase()}#${accountId}#BUILDS`;

            console.log(`🔍 Fetching builds with PK: ${pk}`);

            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk',
                {':pk': pk},
            );

            console.log(`✅ Found ${items.length} build(s)`);

            // Filter by enterprise if provided
            let builds = items.map((item: any) => ({
                id: item.id,
                buildName: item.build_name,
                description: item.description || '',
                entity: item.entity || '',
                pipeline: item.pipeline || '',
                status: item.status || '',
                artifact: item.artifact || '',
                build: item.build || '',
                accountId: item.account_id,
                accountName: item.account_name,
                enterpriseId: item.enterprise_id || '',
                enterpriseName: item.enterprise_name || '',
                stages: item.stages ? JSON.parse(item.stages) : [],
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            }));

            if (enterpriseId) {
                builds = builds.filter(
                    (build: Build) => build.enterpriseId === enterpriseId,
                );
                console.log(
                    `✅ Filtered to ${builds.length} build(s) for enterprise ${enterpriseId}`,
                );
            }

            return builds;
        } catch (error) {
            console.error('❌ Error fetching builds:', error);
            throw error;
        }
    }

    /**
     * Get a specific build by ID
     */
    async get(
        accountId: string,
        accountName: string,
        buildId: string,
    ): Promise<Build | null> {
        try {
            const pk = `${accountName.toUpperCase()}#${accountId}#BUILDS`;
            const sk = `BUILD#${buildId}`;

            console.log(`🔍 Fetching build: PK=${pk}, SK=${sk}`);

            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            if (!item) {
                console.log('❌ Build not found');
                return null;
            }

            return {
                id: item.id,
                buildName: item.build_name,
                description: item.description || '',
                entity: item.entity || '',
                pipeline: item.pipeline || '',
                status: item.status || '',
                artifact: item.artifact || '',
                build: item.build || '',
                accountId: item.account_id,
                accountName: item.account_name,
                enterpriseId: item.enterprise_id || '',
                enterpriseName: item.enterprise_name || '',
                stages: item.stages ? JSON.parse(item.stages) : [],
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error(`❌ Error fetching build ${buildId}:`, error);
            throw error;
        }
    }

    /**
     * Create a new build
     */
    async create(
        buildData: Omit<Build, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<Build> {
        try {
            console.log('BuildsDynamoDBService.create called with:', buildData);

            if (!buildData.accountId || !buildData.accountName) {
                throw new Error(
                    'accountId and accountName are required to create a build',
                );
            }

            if (!buildData.buildName) {
                throw new Error('buildName is required to create a build');
            }

            const buildId = uuidv4();
            const now = new Date().toISOString();

            // PK pattern: <ACCOUNT_NAME>#<accountId>#BUILDS
            const pk = `${buildData.accountName.toUpperCase()}#${
                buildData.accountId
            }#BUILDS`;
            const sk = `BUILD#${buildId}`;

            const item = {
                PK: pk,
                SK: sk,
                id: buildId,
                build_name: buildData.buildName,
                description: buildData.description || '',
                entity: buildData.entity || '',
                pipeline: buildData.pipeline || '',
                status: buildData.status || '',
                artifact: buildData.artifact || '',
                build: buildData.build || '',
                account_id: buildData.accountId,
                account_name: buildData.accountName,
                enterprise_id: buildData.enterpriseId || '',
                enterprise_name: buildData.enterpriseName || '',
                stages: JSON.stringify(buildData.stages || []),
                created_date: now,
                createdAt: now,
                updated_date: now,
                updatedAt: now,
                entity_type: 'build',
            };

            console.log('📝 Saving build to DynamoDB:', item);

            await DynamoDBOperations.putItem(this.tableName, item);

            console.log('✅ Build created successfully');

            return {
                id: buildId,
                ...buildData,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error('❌ Error creating build:', error);
            throw error;
        }
    }

    /**
     * Update an existing build
     */
    async update(
        accountId: string,
        accountName: string,
        buildId: string,
        updates: Partial<Build>,
    ): Promise<Build> {
        try {
            const pk = `${accountName.toUpperCase()}#${accountId}#BUILDS`;
            const sk = `BUILD#${buildId}`;

            console.log(`📝 Updating build: PK=${pk}, SK=${sk}`);

            // Get existing item
            const existing = await DynamoDBOperations.getItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            if (!existing) {
                throw new Error(`Build ${buildId} not found`);
            }

            const now = new Date().toISOString();

            const updatedItem = {
                ...existing,
                ...(updates.buildName && {build_name: updates.buildName}),
                ...(updates.description !== undefined && {
                    description: updates.description,
                }),
                ...(updates.entity !== undefined && {entity: updates.entity}),
                ...(updates.pipeline !== undefined && {
                    pipeline: updates.pipeline,
                }),
                ...(updates.status !== undefined && {status: updates.status}),
                ...(updates.artifact !== undefined && {
                    artifact: updates.artifact,
                }),
                ...(updates.build !== undefined && {build: updates.build}),
                ...(updates.enterpriseId !== undefined && {
                    enterprise_id: updates.enterpriseId,
                }),
                ...(updates.enterpriseName !== undefined && {
                    enterprise_name: updates.enterpriseName,
                }),
                ...(updates.stages && {
                    stages: JSON.stringify(updates.stages),
                }),
                updated_date: now,
                updatedAt: now,
            };

            await DynamoDBOperations.putItem(this.tableName, updatedItem);

            console.log('✅ Build updated successfully');

            return {
                id: buildId,
                buildName: updatedItem.build_name,
                description: updatedItem.description || '',
                entity: updatedItem.entity || '',
                pipeline: updatedItem.pipeline || '',
                status: updatedItem.status || '',
                artifact: updatedItem.artifact || '',
                build: updatedItem.build || '',
                accountId: updatedItem.account_id,
                accountName: updatedItem.account_name,
                enterpriseId: updatedItem.enterprise_id || '',
                enterpriseName: updatedItem.enterprise_name || '',
                stages: JSON.parse(updatedItem.stages || '[]'),
                createdAt: updatedItem.created_date || updatedItem.createdAt,
                updatedAt: now,
            };
        } catch (error) {
            console.error(`❌ Error updating build ${buildId}:`, error);
            throw error;
        }
    }

    /**
     * Delete a build
     */
    async delete(
        accountId: string,
        accountName: string,
        buildId: string,
    ): Promise<void> {
        try {
            const pk = `${accountName.toUpperCase()}#${accountId}#BUILDS`;
            const sk = `BUILD#${buildId}`;

            console.log(`🗑️ Deleting build: PK=${pk}, SK=${sk}`);

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            console.log('✅ Build deleted successfully');
        } catch (error) {
            console.error(`❌ Error deleting build ${buildId}:`, error);
            throw error;
        }
    }
}
