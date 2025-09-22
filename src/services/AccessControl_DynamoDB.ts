import {DynamoDBDocumentClient} from '@aws-sdk/lib-dynamodb';
import {
    PutCommand,
    GetCommand,
    QueryCommand,
    UpdateCommand,
    DeleteCommand,
    ScanCommand,
    BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import {getDynamoDBDocumentClient} from '../dynamodb';
import {v4 as uuid} from 'uuid';
import bcrypt from 'bcrypt';

// Interface definitions matching your AccessControl structure
export interface UserRecord {
    id: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    emailAddress: string;
    status: 'ACTIVE' | 'INACTIVE';
    startDate: string;
    endDate?: string | null;
    password?: string;
    technicalUser: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface GroupRecord {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ScopePermission {
    resource: string;
    view?: boolean;
    create?: boolean;
    edit?: boolean;
    delete?: boolean;
}

export interface ScopeConfiguration {
    configured?: boolean;
    accountSettings?: ScopePermission[];
    accessControl?: ScopePermission[];
    securityGovernance?: ScopePermission[];
    pipelines?: ScopePermission[];
    builds?: ScopePermission[];
    createdAt?: string;
    updatedAt?: string;
}

export interface RoleRecord {
    id: string;
    name: string;
    description?: string;
    permissions?: string[];
    scopeConfig?: ScopeConfiguration;
    createdAt: string;
    updatedAt: string;
}

export interface ServiceRecord {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}

// Assignment interfaces
export interface UserGroupAssignment {
    userId: string;
    groupId: string;
    assignedAt: string;
}

export interface GroupRoleAssignment {
    groupId: string;
    roleId: string;
    assignedAt: string;
}

export interface GroupServiceAssignment {
    groupId: string;
    serviceId: string;
    assignedAt: string;
}

export class AccessControl_DynamoDBService {
    private client: DynamoDBDocumentClient;
    private tableName: string;

    constructor() {
        this.client = getDynamoDBDocumentClient();
        this.tableName = process.env.DYNAMODB_RBAC_TABLE || 'accessControl';
    }

    private async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }

    private async verifyPassword(
        password: string,
        hash: string,
    ): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    // ==========================================
    // USER OPERATIONS
    // ==========================================

    async createUser(
        userData: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<UserRecord> {
        const userId = uuid();
        const now = new Date().toISOString();

        const user: UserRecord = {
            id: userId,
            ...userData,
            password: userData.password
                ? await this.hashPassword(userData.password)
                : undefined,
            createdAt: now,
            updatedAt: now,
        };

        // Debug: Confirm technicalUser field is being stored
        console.log(
            '🔍 DynamoDB storing user with technicalUser:',
            user.technicalUser,
        );

        const itemToStore = {
            PK: `USER#${userId}`,
            SK: 'PROFILE',
            ...user,
            entityType: 'USER',
        };

        const command = new PutCommand({
            TableName: this.tableName,
            Item: itemToStore,
        });

        await this.client.send(command);

        // Remove password from response
        const {password, ...userWithoutPassword} = user;
        return userWithoutPassword as UserRecord;
    }

    async getUser(userId: string): Promise<UserRecord | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE',
            },
        });

        const result = await this.client.send(command);
        if (!result.Item) return null;

        const {PK, SK, entityType, password, ...user} = result.Item;
        return user as UserRecord;
    }

    async listUsers(
        options: {
            page?: number;
            limit?: number;
            search?: string;
            status?: 'ACTIVE' | 'INACTIVE';
        } = {},
    ): Promise<{
        users: UserRecord[];
        total: number;
        page: number;
        limit: number;
    }> {
        const {page = 1, limit = 50, search, status} = options;

        const command = new ScanCommand({
            TableName: this.tableName,
            FilterExpression: '#entityType = :entityType',
            ExpressionAttributeNames: {
                '#entityType': 'entityType',
            },
            ExpressionAttributeValues: {
                ':entityType': 'USER',
            },
        });

        const result = await this.client.send(command);
        let users = (result.Items || []).map((item) => {
            const {PK, SK, entityType, password, ...user} = item;
            return user as UserRecord;
        });

        // Apply filters
        if (search) {
            const searchLower = search.toLowerCase();
            users = users.filter(
                (user) =>
                    user.firstName.toLowerCase().includes(searchLower) ||
                    user.lastName.toLowerCase().includes(searchLower) ||
                    user.emailAddress.toLowerCase().includes(searchLower),
            );
        }

        if (status) {
            users = users.filter((user) => user.status === status);
        }

        // Apply pagination
        const total = users.length;
        const startIndex = (page - 1) * limit;
        const paginatedUsers = users.slice(startIndex, startIndex + limit);

        return {
            users: paginatedUsers,
            total,
            page,
            limit,
        };
    }

    async updateUser(
        userId: string,
        updates: Partial<UserRecord>,
    ): Promise<UserRecord | null> {
        const now = new Date().toISOString();

        // If password is being updated, hash it
        if (updates.password) {
            updates.password = await this.hashPassword(updates.password);
        }

        const updateExpression = [];
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        let valueIndex = 0;
        Object.entries(updates).forEach(([key, value]) => {
            if (key !== 'id' && key !== 'createdAt') {
                updateExpression.push(`#${key} = :val${valueIndex}`);
                expressionAttributeNames[`#${key}`] = key;
                expressionAttributeValues[`:val${valueIndex}`] = value;
                valueIndex++;
            }
        });

        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = now;

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE',
            },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW',
        });

        const result = await this.client.send(command);
        if (!result.Attributes) return null;

        const {PK, SK, entityType, password, ...user} = result.Attributes;
        return user as UserRecord;
    }

    async deleteUser(userId: string): Promise<void> {
        // Delete user profile
        const deleteUserCommand = new DeleteCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: 'PROFILE',
            },
        });

        await this.client.send(deleteUserCommand);

        // Also delete all user-group assignments
        await this.removeUserFromAllGroups(userId);
    }

    // ==========================================
    // GROUP OPERATIONS
    // ==========================================

    async createGroup(
        groupData: Omit<GroupRecord, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<GroupRecord> {
        const groupId = uuid();
        const now = new Date().toISOString();

        const group: GroupRecord = {
            id: groupId,
            ...groupData,
            createdAt: now,
            updatedAt: now,
        };

        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `GROUP#${groupId}`,
                SK: 'PROFILE',
                ...group,
                entityType: 'GROUP',
            },
        });

        await this.client.send(command);
        return group;
    }

    async getGroup(groupId: string): Promise<GroupRecord | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `GROUP#${groupId}`,
                SK: 'PROFILE',
            },
        });

        const result = await this.client.send(command);
        if (!result.Item) return null;

        const {PK, SK, entityType, ...group} = result.Item;
        return group as GroupRecord;
    }

    async listGroups(): Promise<GroupRecord[]> {
        const command = new ScanCommand({
            TableName: this.tableName,
            FilterExpression: '#entityType = :entityType',
            ExpressionAttributeNames: {
                '#entityType': 'entityType',
            },
            ExpressionAttributeValues: {
                ':entityType': 'GROUP',
            },
        });

        const result = await this.client.send(command);
        return (result.Items || []).map((item) => {
            const {PK, SK, entityType, ...group} = item;
            return group as GroupRecord;
        });
    }

    async updateGroup(
        groupId: string,
        updates: Partial<GroupRecord>,
    ): Promise<GroupRecord | null> {
        const now = new Date().toISOString();

        const updateExpression = [];
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        Object.entries(updates).forEach(([key, value], index) => {
            if (key !== 'id' && key !== 'createdAt') {
                updateExpression.push(`#${key} = :val${index}`);
                expressionAttributeNames[`#${key}`] = key;
                expressionAttributeValues[`:val${index}`] = value;
            }
        });

        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = now;

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `GROUP#${groupId}`,
                SK: 'PROFILE',
            },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW',
        });

        const result = await this.client.send(command);
        if (!result.Attributes) return null;

        const {PK, SK, entityType, ...group} = result.Attributes;
        return group as GroupRecord;
    }

    async deleteGroup(groupId: string): Promise<void> {
        // Delete group profile
        const deleteGroupCommand = new DeleteCommand({
            TableName: this.tableName,
            Key: {
                PK: `GROUP#${groupId}`,
                SK: 'PROFILE',
            },
        });

        await this.client.send(deleteGroupCommand);

        // Also delete all related assignments
        await this.removeAllUsersFromGroup(groupId);
        await this.removeAllRolesFromGroup(groupId);
        await this.removeAllServicesFromGroup(groupId);
    }

    // ==========================================
    // ROLE OPERATIONS
    // ==========================================

    async createRole(
        roleData: Omit<RoleRecord, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<RoleRecord> {
        const roleId = uuid();
        const now = new Date().toISOString();

        const role: RoleRecord = {
            id: roleId,
            ...roleData,
            createdAt: now,
            updatedAt: now,
        };

        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `ROLE#${roleId}`,
                SK: 'PROFILE',
                ...role,
                entityType: 'ROLE',
            },
        });

        await this.client.send(command);
        return role;
    }

    async getRole(roleId: string): Promise<RoleRecord | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `ROLE#${roleId}`,
                SK: 'PROFILE',
            },
        });

        const result = await this.client.send(command);
        if (!result.Item) return null;

        const {PK, SK, entityType, ...role} = result.Item;
        return role as RoleRecord;
    }

    async listRoles(): Promise<RoleRecord[]> {
        const command = new ScanCommand({
            TableName: this.tableName,
            FilterExpression: '#entityType = :entityType',
            ExpressionAttributeNames: {
                '#entityType': 'entityType',
            },
            ExpressionAttributeValues: {
                ':entityType': 'ROLE',
            },
        });

        const result = await this.client.send(command);
        return (result.Items || []).map((item) => {
            const {PK, SK, entityType, ...role} = item;
            return role as RoleRecord;
        });
    }

    async updateRole(
        roleId: string,
        updates: Partial<RoleRecord>,
    ): Promise<RoleRecord | null> {
        const now = new Date().toISOString();

        const updateExpression = [];
        const expressionAttributeNames: Record<string, string> = {};
        const expressionAttributeValues: Record<string, any> = {};

        Object.entries(updates).forEach(([key, value], index) => {
            if (key !== 'id' && key !== 'createdAt') {
                updateExpression.push(`#${key} = :val${index}`);
                expressionAttributeNames[`#${key}`] = key;
                expressionAttributeValues[`:val${index}`] = value;
            }
        });

        updateExpression.push('#updatedAt = :updatedAt');
        expressionAttributeNames['#updatedAt'] = 'updatedAt';
        expressionAttributeValues[':updatedAt'] = now;

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `ROLE#${roleId}`,
                SK: 'PROFILE',
            },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
            ReturnValues: 'ALL_NEW',
        });

        const result = await this.client.send(command);
        if (!result.Attributes) return null;

        const {PK, SK, entityType, ...role} = result.Attributes;
        return role as RoleRecord;
    }

    // Scope Configuration methods
    async updateRoleScope(
        roleId: string,
        scopeConfig: ScopeConfiguration,
    ): Promise<RoleRecord | null> {
        const now = new Date().toISOString();
        scopeConfig.updatedAt = now;
        scopeConfig.configured = true;

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `ROLE#${roleId}`,
                SK: 'PROFILE',
            },
            UpdateExpression:
                'SET #scopeConfig = :scopeConfig, #updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#scopeConfig': 'scopeConfig',
                '#updatedAt': 'updatedAt',
            },
            ExpressionAttributeValues: {
                ':scopeConfig': scopeConfig,
                ':updatedAt': now,
            },
            ReturnValues: 'ALL_NEW',
        });

        const result = await this.client.send(command);
        if (!result.Attributes) return null;

        const {PK, SK, entityType, ...role} = result.Attributes;
        return role as RoleRecord;
    }

    async getRoleScope(roleId: string): Promise<ScopeConfiguration | null> {
        const role = await this.getRole(roleId);
        return role?.scopeConfig || null;
    }

    async deleteRole(roleId: string): Promise<void> {
        // Delete role profile
        const deleteRoleCommand = new DeleteCommand({
            TableName: this.tableName,
            Key: {
                PK: `ROLE#${roleId}`,
                SK: 'PROFILE',
            },
        });

        await this.client.send(deleteRoleCommand);

        // Also remove role from all groups
        await this.removeRoleFromAllGroups(roleId);
    }

    // ==========================================
    // SERVICE OPERATIONS
    // ==========================================

    async createService(
        serviceData: Omit<ServiceRecord, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<ServiceRecord> {
        const serviceId = uuid();
        const now = new Date().toISOString();

        const service: ServiceRecord = {
            id: serviceId,
            ...serviceData,
            createdAt: now,
            updatedAt: now,
        };

        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `SERVICE#${serviceId}`,
                SK: 'PROFILE',
                ...service,
                entityType: 'SERVICE',
            },
        });

        await this.client.send(command);
        return service;
    }

    async getService(serviceId: string): Promise<ServiceRecord | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `SERVICE#${serviceId}`,
                SK: 'PROFILE',
            },
        });

        const result = await this.client.send(command);
        if (!result.Item) return null;

        const {PK, SK, entityType, ...service} = result.Item;
        return service as ServiceRecord;
    }

    async listServices(): Promise<ServiceRecord[]> {
        const command = new ScanCommand({
            TableName: this.tableName,
            FilterExpression: '#entityType = :entityType',
            ExpressionAttributeNames: {
                '#entityType': 'entityType',
            },
            ExpressionAttributeValues: {
                ':entityType': 'SERVICE',
            },
        });

        const result = await this.client.send(command);
        return (result.Items || []).map((item) => {
            const {PK, SK, entityType, ...service} = item;
            return service as ServiceRecord;
        });
    }

    // ==========================================
    // ASSIGNMENT OPERATIONS
    // ==========================================

    // User-Group Assignments
    async assignUserToGroup(userId: string, groupId: string): Promise<void> {
        const now = new Date().toISOString();

        const commands = [
            new PutCommand({
                TableName: this.tableName,
                Item: {
                    PK: `USER#${userId}`,
                    SK: `GROUP#${groupId}`,
                    userId,
                    groupId,
                    assignedAt: now,
                    entityType: 'USER_GROUP_ASSIGNMENT',
                },
            }),
            new PutCommand({
                TableName: this.tableName,
                Item: {
                    PK: `GROUP#${groupId}`,
                    SK: `USER#${userId}`,
                    userId,
                    groupId,
                    assignedAt: now,
                    entityType: 'GROUP_USER_ASSIGNMENT',
                },
            }),
        ];

        for (const command of commands) {
            await this.client.send(command);
        }
    }

    async removeUserFromGroup(userId: string, groupId: string): Promise<void> {
        const commands = [
            new DeleteCommand({
                TableName: this.tableName,
                Key: {
                    PK: `USER#${userId}`,
                    SK: `GROUP#${groupId}`,
                },
            }),
            new DeleteCommand({
                TableName: this.tableName,
                Key: {
                    PK: `GROUP#${groupId}`,
                    SK: `USER#${userId}`,
                },
            }),
        ];

        for (const command of commands) {
            await this.client.send(command);
        }
    }

    async getUserGroups(userId: string): Promise<GroupRecord[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}`,
                ':sk': 'GROUP#',
            },
        });

        const result = await this.client.send(command);
        const groupIds = (result.Items || []).map((item) => item.groupId);

        // Fetch group details
        const groups = [];
        for (const groupId of groupIds) {
            const group = await this.getGroup(groupId);
            if (group) groups.push(group);
        }

        return groups;
    }

    async getGroupUsers(groupId: string): Promise<UserRecord[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `GROUP#${groupId}`,
                ':sk': 'USER#',
            },
        });

        const result = await this.client.send(command);
        const userIds = (result.Items || []).map((item) => item.userId);

        // Fetch user details
        const users = [];
        for (const userId of userIds) {
            const user = await this.getUser(userId);
            if (user) users.push(user);
        }

        return users;
    }

    // Group-Role Assignments
    async assignRoleToGroup(groupId: string, roleId: string): Promise<void> {
        const now = new Date().toISOString();

        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `GROUP#${groupId}`,
                SK: `ROLE#${roleId}`,
                groupId,
                roleId,
                assignedAt: now,
                entityType: 'GROUP_ROLE_ASSIGNMENT',
            },
        });

        await this.client.send(command);
    }

    async removeRoleFromGroup(groupId: string, roleId: string): Promise<void> {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: {
                PK: `GROUP#${groupId}`,
                SK: `ROLE#${roleId}`,
            },
        });

        await this.client.send(command);
    }

    async getGroupRoles(groupId: string): Promise<RoleRecord[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `GROUP#${groupId}`,
                ':sk': 'ROLE#',
            },
        });

        const result = await this.client.send(command);
        const roleIds = (result.Items || []).map((item) => item.roleId);

        // Fetch role details
        const roles = [];
        for (const roleId of roleIds) {
            const role = await this.getRole(roleId);
            if (role) roles.push(role);
        }

        return roles;
    }

    // Group-Service Assignments
    async assignServiceToGroup(
        groupId: string,
        serviceId: string,
    ): Promise<void> {
        const now = new Date().toISOString();

        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `GROUP#${groupId}`,
                SK: `SERVICE#${serviceId}`,
                groupId,
                serviceId,
                assignedAt: now,
                entityType: 'GROUP_SERVICE_ASSIGNMENT',
            },
        });

        await this.client.send(command);
    }

    async removeServiceFromGroup(
        groupId: string,
        serviceId: string,
    ): Promise<void> {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: {
                PK: `GROUP#${groupId}`,
                SK: `SERVICE#${serviceId}`,
            },
        });

        await this.client.send(command);
    }

    async getGroupServices(groupId: string): Promise<ServiceRecord[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `GROUP#${groupId}`,
                ':sk': 'SERVICE#',
            },
        });

        const result = await this.client.send(command);
        const serviceIds = (result.Items || []).map((item) => item.serviceId);

        // Fetch service details
        const services = [];
        for (const serviceId of serviceIds) {
            const service = await this.getService(serviceId);
            if (service) services.push(service);
        }

        return services;
    }

    // Helper methods for cleanup operations
    private async removeUserFromAllGroups(userId: string): Promise<void> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `USER#${userId}`,
                ':sk': 'GROUP#',
            },
        });

        const result = await this.client.send(command);

        for (const item of result.Items || []) {
            await this.removeUserFromGroup(userId, item.groupId);
        }
    }

    private async removeAllUsersFromGroup(groupId: string): Promise<void> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `GROUP#${groupId}`,
                ':sk': 'USER#',
            },
        });

        const result = await this.client.send(command);

        for (const item of result.Items || []) {
            await this.removeUserFromGroup(item.userId, groupId);
        }
    }

    private async removeAllRolesFromGroup(groupId: string): Promise<void> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `GROUP#${groupId}`,
                ':sk': 'ROLE#',
            },
        });

        const result = await this.client.send(command);

        for (const item of result.Items || []) {
            await this.removeRoleFromGroup(groupId, item.roleId);
        }
    }

    private async removeRoleFromAllGroups(roleId: string): Promise<void> {
        // This requires a GSI or scan to find all groups with this role
        // For now, we'll use a scan (not optimal for large datasets)
        const command = new ScanCommand({
            TableName: this.tableName,
            FilterExpression: 'SK = :sk',
            ExpressionAttributeValues: {
                ':sk': `ROLE#${roleId}`,
            },
        });

        const result = await this.client.send(command);

        for (const item of result.Items || []) {
            const groupId = item.PK.replace('GROUP#', '');
            await this.removeRoleFromGroup(groupId, roleId);
        }
    }

    private async removeAllServicesFromGroup(groupId: string): Promise<void> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
            ExpressionAttributeValues: {
                ':pk': `GROUP#${groupId}`,
                ':sk': 'SERVICE#',
            },
        });

        const result = await this.client.send(command);

        for (const item of result.Items || []) {
            await this.removeServiceFromGroup(groupId, item.serviceId);
        }
    }
}
