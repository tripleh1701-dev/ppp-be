import {v4 as uuidv4} from 'uuid';
import {DynamoDBOperations} from '../dynamodb';

export interface BuildExecution {
    id: string;
    buildId: string;
    buildName: string;
    accountId: string;
    accountName: string;
    enterpriseId?: string;
    enterpriseName?: string;
    buildNumber: string;
    branch: string;
    commit: string;
    duration: string;
    status: 'success' | 'failed' | 'running' | 'pending';
    triggeredBy: string;
    startTime: string;
    endTime?: string;
    environmentVariables?: Record<string, string>;
    buildConfiguration?: any;
    artifacts?: Array<{
        id: string;
        name: string;
        size: string;
        type: string;
        downloadUrl?: string;
    }>;
    stages?: Array<{
        id: string;
        name: string;
        status: 'success' | 'failed' | 'running' | 'pending';
        duration?: string;
        startTime?: string;
        endTime?: string;
        substeps?: Array<{
            name: string;
            status: string;
        }>;
        logs?: string[];
    }>;
    metrics?: {
        cpuUsage?: number;
        memoryUsage?: number;
        networkUsage?: number;
    };
    testResults?: {
        passed?: number;
        failed?: number;
        skipped?: number;
        coverage?: number;
    };
    createdAt: string;
    updatedAt: string;
}

export class BuildExecutionsDynamoDBService {
    private readonly tableName: string;

    constructor() {
        this.tableName =
            process.env.DYNAMODB_SYS_ACCOUNTS_TABLE || 'sys_accounts';
    }

    /**
     * Get all build executions for a specific build/job
     */
    async listByBuildId(
        accountId: string,
        accountName: string,
        buildId: string,
    ): Promise<BuildExecution[]> {
        try {
            // PK pattern: <ACCOUNT_NAME>#<accountId>#BUILD#<buildId>#EXECUTIONS
            const pk = `${accountName.toUpperCase()}#${accountId}#BUILD#${buildId}#EXECUTIONS`;

            console.log(`🔍 Fetching build executions with PK: ${pk}`);

            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk',
                {':pk': pk},
            );

            console.log(`✅ Found ${items.length} build execution(s)`);

            return items.map((item: any) => ({
                id: item.id,
                buildId: item.build_id,
                buildName: item.build_name,
                accountId: item.account_id,
                accountName: item.account_name,
                enterpriseId: item.enterprise_id,
                enterpriseName: item.enterprise_name,
                buildNumber: item.build_number,
                branch: item.branch,
                commit: item.commit,
                duration: item.duration,
                status: item.status,
                triggeredBy: item.triggered_by,
                startTime: item.start_time,
                endTime: item.end_time,
                environmentVariables: item.environment_variables
                    ? JSON.parse(item.environment_variables)
                    : {},
                buildConfiguration: item.build_configuration
                    ? JSON.parse(item.build_configuration)
                    : null,
                artifacts: item.artifacts ? JSON.parse(item.artifacts) : [],
                stages: item.stages ? JSON.parse(item.stages) : [],
                metrics: item.metrics ? JSON.parse(item.metrics) : {},
                testResults: item.test_results
                    ? JSON.parse(item.test_results)
                    : {},
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            }));
        } catch (error) {
            console.error(
                `❌ Error fetching build executions for buildId ${buildId}:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Get a specific build execution
     */
    async get(
        accountId: string,
        accountName: string,
        buildId: string,
        executionId: string,
    ): Promise<BuildExecution | null> {
        try {
            const pk = `${accountName.toUpperCase()}#${accountId}#BUILD#${buildId}#EXECUTIONS`;
            const sk = `EXECUTION#${executionId}`;

            console.log(`🔍 Fetching build execution: PK=${pk}, SK=${sk}`);

            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            if (!item) {
                console.log('❌ Build execution not found');
                return null;
            }

            return {
                id: item.id,
                buildId: item.build_id,
                buildName: item.build_name,
                accountId: item.account_id,
                accountName: item.account_name,
                enterpriseId: item.enterprise_id,
                enterpriseName: item.enterprise_name,
                buildNumber: item.build_number,
                branch: item.branch,
                commit: item.commit,
                duration: item.duration,
                status: item.status,
                triggeredBy: item.triggered_by,
                startTime: item.start_time,
                endTime: item.end_time,
                environmentVariables: item.environment_variables
                    ? JSON.parse(item.environment_variables)
                    : {},
                buildConfiguration: item.build_configuration
                    ? JSON.parse(item.build_configuration)
                    : null,
                artifacts: item.artifacts ? JSON.parse(item.artifacts) : [],
                stages: item.stages ? JSON.parse(item.stages) : [],
                metrics: item.metrics ? JSON.parse(item.metrics) : {},
                testResults: item.test_results
                    ? JSON.parse(item.test_results)
                    : {},
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error(
                `❌ Error fetching build execution ${executionId}:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Create a new build execution
     */
    async create(
        executionData: Omit<BuildExecution, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<BuildExecution> {
        try {
            console.log(
                'BuildExecutionsDynamoDBService.create called with:',
                executionData,
            );

            if (!executionData.accountId || !executionData.accountName) {
                throw new Error(
                    'accountId and accountName are required to create a build execution',
                );
            }

            if (!executionData.buildId) {
                throw new Error(
                    'buildId is required to create a build execution',
                );
            }

            const executionId = uuidv4();
            const now = new Date().toISOString();

            // PK pattern: <ACCOUNT_NAME>#<accountId>#BUILD#<buildId>#EXECUTIONS
            const pk = `${executionData.accountName.toUpperCase()}#${
                executionData.accountId
            }#BUILD#${executionData.buildId}#EXECUTIONS`;
            const sk = `EXECUTION#${executionId}`;

            const item = {
                PK: pk,
                SK: sk,
                id: executionId,
                build_id: executionData.buildId,
                build_name: executionData.buildName,
                account_id: executionData.accountId,
                account_name: executionData.accountName,
                enterprise_id: executionData.enterpriseId || '',
                enterprise_name: executionData.enterpriseName || '',
                build_number: executionData.buildNumber,
                branch: executionData.branch,
                commit: executionData.commit,
                duration: executionData.duration,
                status: executionData.status,
                triggered_by: executionData.triggeredBy,
                start_time: executionData.startTime,
                end_time: executionData.endTime || '',
                environment_variables: JSON.stringify(
                    executionData.environmentVariables || {},
                ),
                build_configuration: JSON.stringify(
                    executionData.buildConfiguration || null,
                ),
                artifacts: JSON.stringify(executionData.artifacts || []),
                stages: JSON.stringify(executionData.stages || []),
                metrics: JSON.stringify(executionData.metrics || {}),
                test_results: JSON.stringify(executionData.testResults || {}),
                created_date: now,
                createdAt: now,
                updated_date: now,
                updatedAt: now,
                entity_type: 'build_execution',
            };

            console.log('📝 Saving build execution to DynamoDB:', item);

            await DynamoDBOperations.putItem(this.tableName, item);

            console.log('✅ Build execution created successfully');

            return {
                id: executionId,
                ...executionData,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error('❌ Error creating build execution:', error);
            throw error;
        }
    }

    /**
     * Update an existing build execution
     */
    async update(
        accountId: string,
        accountName: string,
        buildId: string,
        executionId: string,
        updates: Partial<BuildExecution>,
    ): Promise<BuildExecution> {
        try {
            const pk = `${accountName.toUpperCase()}#${accountId}#BUILD#${buildId}#EXECUTIONS`;
            const sk = `EXECUTION#${executionId}`;

            console.log(`📝 Updating build execution: PK=${pk}, SK=${sk}`);

            // Get existing item
            const existing = await DynamoDBOperations.getItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            if (!existing) {
                throw new Error(`Build execution ${executionId} not found`);
            }

            const now = new Date().toISOString();

            const updatedItem = {
                ...existing,
                ...(updates.buildName && {build_name: updates.buildName}),
                ...(updates.buildNumber && {
                    build_number: updates.buildNumber,
                }),
                ...(updates.branch && {branch: updates.branch}),
                ...(updates.commit && {commit: updates.commit}),
                ...(updates.duration && {duration: updates.duration}),
                ...(updates.status && {status: updates.status}),
                ...(updates.triggeredBy && {
                    triggered_by: updates.triggeredBy,
                }),
                ...(updates.startTime && {start_time: updates.startTime}),
                ...(updates.endTime && {end_time: updates.endTime}),
                ...(updates.environmentVariables && {
                    environment_variables: JSON.stringify(
                        updates.environmentVariables,
                    ),
                }),
                ...(updates.buildConfiguration && {
                    build_configuration: JSON.stringify(
                        updates.buildConfiguration,
                    ),
                }),
                ...(updates.artifacts && {
                    artifacts: JSON.stringify(updates.artifacts),
                }),
                ...(updates.stages && {
                    stages: JSON.stringify(updates.stages),
                }),
                ...(updates.metrics && {
                    metrics: JSON.stringify(updates.metrics),
                }),
                ...(updates.testResults && {
                    test_results: JSON.stringify(updates.testResults),
                }),
                updated_date: now,
                updatedAt: now,
            };

            await DynamoDBOperations.putItem(this.tableName, updatedItem);

            console.log('✅ Build execution updated successfully');

            return {
                id: executionId,
                buildId: updatedItem.build_id,
                buildName: updatedItem.build_name,
                accountId: updatedItem.account_id,
                accountName: updatedItem.account_name,
                enterpriseId: updatedItem.enterprise_id,
                enterpriseName: updatedItem.enterprise_name,
                buildNumber: updatedItem.build_number,
                branch: updatedItem.branch,
                commit: updatedItem.commit,
                duration: updatedItem.duration,
                status: updatedItem.status,
                triggeredBy: updatedItem.triggered_by,
                startTime: updatedItem.start_time,
                endTime: updatedItem.end_time,
                environmentVariables: JSON.parse(
                    updatedItem.environment_variables,
                ),
                buildConfiguration: JSON.parse(updatedItem.build_configuration),
                artifacts: JSON.parse(updatedItem.artifacts),
                stages: JSON.parse(updatedItem.stages),
                metrics: JSON.parse(updatedItem.metrics),
                testResults: JSON.parse(updatedItem.test_results),
                createdAt: updatedItem.created_date || updatedItem.createdAt,
                updatedAt: now,
            };
        } catch (error) {
            console.error(
                `❌ Error updating build execution ${executionId}:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Delete a build execution
     */
    async delete(
        accountId: string,
        accountName: string,
        buildId: string,
        executionId: string,
    ): Promise<void> {
        try {
            const pk = `${accountName.toUpperCase()}#${accountId}#BUILD#${buildId}#EXECUTIONS`;
            const sk = `EXECUTION#${executionId}`;

            console.log(`🗑️ Deleting build execution: PK=${pk}, SK=${sk}`);

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: pk,
                SK: sk,
            });

            console.log('✅ Build execution deleted successfully');
        } catch (error) {
            console.error(
                `❌ Error deleting build execution ${executionId}:`,
                error,
            );
            throw error;
        }
    }

    /**
     * Get latest build execution for a build
     */
    async getLatest(
        accountId: string,
        accountName: string,
        buildId: string,
    ): Promise<BuildExecution | null> {
        try {
            const executions = await this.listByBuildId(
                accountId,
                accountName,
                buildId,
            );

            if (executions.length === 0) {
                return null;
            }

            // Sort by createdAt descending and return the first one
            executions.sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() -
                    new Date(a.createdAt).getTime(),
            );

            return executions[0];
        } catch (error) {
            console.error(
                `❌ Error fetching latest build execution for buildId ${buildId}:`,
                error,
            );
            throw error;
        }
    }
}
