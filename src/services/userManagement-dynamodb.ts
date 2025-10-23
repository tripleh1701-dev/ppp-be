import {DynamoDBOperations, withDynamoDB} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';
import bcrypt from 'bcrypt';

// ==========================================
// INTERFACE DEFINITIONS
// ==========================================

export interface User {
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
    assignedGroups?: string[]; // Group IDs
    createdAt: string;
    updatedAt: string;
}

export interface Group {
    id: string;
    name: string;
    description?: string;
    entity?: string; // Business entity/department
    service?: string; // Service name
    assignedRoles?: string[]; // Role IDs
    createdAt: string;
    updatedAt: string;
}

export interface Role {
    id: string;
    name: string;
    description?: string;
    scopeConfig?: ScopeConfiguration;
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

// ==========================================
// USER MANAGEMENT SERVICE
// ==========================================

export class UserManagementDynamoDBService {
    private readonly tableName: string;

    constructor() {
        // Use systiva table with consistent SYSTIVA# prefix
        this.tableName = process.env.DYNAMODB_SYSTIVA_TABLE || 'systiva';
    }

    private async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }

    private async comparePassword(
        plainPassword: string,
        hashedPassword: string,
    ): Promise<boolean> {
        return bcrypt.compare(plainPassword, hashedPassword);
    }

    // ==========================================
    // AUTHENTICATION
    // ==========================================

    async authenticateUser(
        email: string,
        password: string,
        accountId: string = '51a0f277-742c-49bd-98b1-8f5001d0ddf7', // Systiva account UUID
    ): Promise<User | null> {
        try {
            // Query users by account using PK format: SYSTIVA#${accountId}#USER
            // where accountId is the actual account UUID from DynamoDB
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': `SYSTIVA#${accountId}#USER`,
                    ':sk': 'USER#',
                },
            );

            // Find user by email (case-insensitive)
            const userItem = items.find(
                (item) =>
                    item.email_address?.toLowerCase() === email.toLowerCase(),
            );

            if (!userItem || !userItem.password) {
                console.log('User not found or no password set');
                return null;
            }

            // Verify password
            const isPasswordValid = await this.comparePassword(
                password,
                userItem.password,
            );

            if (!isPasswordValid) {
                console.log('Invalid password');
                return null;
            }

            // Return user without password
            return {
                id: userItem.id,
                firstName: userItem.first_name,
                middleName: userItem.middle_name,
                lastName: userItem.last_name,
                emailAddress: userItem.email_address,
                status: userItem.status,
                startDate: userItem.start_date,
                endDate: userItem.end_date,
                technicalUser: userItem.technical_user,
                assignedGroups: userItem.assigned_groups || [],
                createdAt: userItem.created_date || userItem.createdAt,
                updatedAt: userItem.updated_date || userItem.updatedAt,
            };
        } catch (error) {
            console.error('Error authenticating user:', error);
            return null;
        }
    }

    // ==========================================
    // USER OPERATIONS
    // ==========================================

    async createUser(
        userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<User> {
        try {
            const userId = uuidv4();
            const now = new Date().toISOString();

            const user: User = {
                id: userId,
                ...userData,
                password: userData.password
                    ? await this.hashPassword(userData.password)
                    : undefined,
                assignedGroups: userData.assignedGroups || [],
                createdAt: now,
                updatedAt: now,
            };

            const item = {
                PK: `SYSTIVA#${userId}`,
                SK: `USER#${userId}`,
                id: userId,
                first_name: user.firstName,
                middle_name: user.middleName,
                last_name: user.lastName,
                email_address: user.emailAddress,
                status: user.status,
                start_date: user.startDate,
                end_date: user.endDate,
                password: user.password,
                technical_user: user.technicalUser,
                assigned_groups: user.assignedGroups,
                created_date: now,
                updated_date: now,
                entity_type: 'USER',
            };

            await DynamoDBOperations.putItem(this.tableName, item);

            // Create user-group assignment lookup records
            if (user.assignedGroups && user.assignedGroups.length > 0) {
                for (const groupId of user.assignedGroups) {
                    await this.createUserGroupLookup(userId, groupId);
                }
            }

            // Remove password from response
            const {password, ...userWithoutPassword} = user;
            return userWithoutPassword as User;
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async createUserInAccountTable(
        userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>,
        accountId: string,
        accountName: string,
    ): Promise<User> {
        try {
            const userId = uuidv4();
            const now = new Date().toISOString();

            const user: User = {
                id: userId,
                ...userData,
                password: userData.password
                    ? await this.hashPassword(userData.password)
                    : undefined,
                assignedGroups: userData.assignedGroups || [],
                createdAt: now,
                updatedAt: now,
            };

            // Use account-specific PK format: <ACCOUNT_NAME>#<account_id>#USERS
            const accountPK = `${accountName.toUpperCase()}#${accountId}#USERS`;

            const item = {
                PK: accountPK,
                SK: `USER#${userId}`,
                id: userId,
                account_id: accountId,
                account_name: accountName,
                first_name: user.firstName,
                middle_name: user.middleName,
                last_name: user.lastName,
                email_address: user.emailAddress,
                status: user.status,
                start_date: user.startDate,
                end_date: user.endDate,
                password: user.password,
                technical_user: user.technicalUser,
                assigned_groups: user.assignedGroups,
                created_date: now,
                updated_date: now,
                entity_type: 'USER',
            };

            await DynamoDBOperations.putItem(this.tableName, item);

            // Create user-group assignment lookup records
            if (user.assignedGroups && user.assignedGroups.length > 0) {
                for (const groupId of user.assignedGroups) {
                    await this.createUserGroupLookupInAccount(
                        userId,
                        groupId,
                        accountId,
                        accountName,
                    );
                }
            }

            // Remove password from response
            const {password, ...userWithoutPassword} = user;
            return userWithoutPassword as User;
        } catch (error) {
            console.error('Error creating user in account table:', error);
            throw error;
        }
    }

    async listUsersByAccount(
        accountId: string,
        accountName: string,
    ): Promise<User[]> {
        try {
            const accountPK = `${accountName.toUpperCase()}#${accountId}#USERS`;

            console.log('📋 Querying DynamoDB for account-specific users:', {
                accountId,
                accountName,
                pkPrefix: accountPK,
            });

            // Query systiva table for all users under this account
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': accountPK,
                    ':sk': 'USER#',
                },
            );

            console.log(
                `📋 Found ${items.length} users for account ${accountName}`,
            );
            if (items.length > 0) {
                console.log(
                    '📋 Account users PKs:',
                    items.map((item) => ({
                        PK: item.PK,
                        SK: item.SK,
                        name: `${item.first_name} ${item.last_name}`,
                        account_name: item.account_name,
                    })),
                );
            }

            return items.map((item) => ({
                id: item.id,
                firstName: item.first_name,
                middleName: item.middle_name,
                lastName: item.last_name,
                emailAddress: item.email_address,
                status: item.status,
                startDate: item.start_date,
                endDate: item.end_date,
                technicalUser: item.technical_user,
                assignedGroups: item.assigned_groups || [],
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            }));
        } catch (error) {
            console.error('Error listing users by account:', error);
            throw error;
        }
    }

    async getUser(userId: string): Promise<User | null> {
        try {
            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `SYSTIVA#${userId}`,
                SK: `USER#${userId}`,
            });

            if (!item) {
                return null;
            }

            return {
                id: item.id || userId,
                firstName: item.first_name,
                middleName: item.middle_name,
                lastName: item.last_name,
                emailAddress: item.email_address,
                status: item.status,
                startDate: item.start_date,
                endDate: item.end_date,
                technicalUser: item.technical_user,
                assignedGroups: item.assigned_groups || [],
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('Error getting user:', error);
            throw error;
        }
    }

    async listUsers(): Promise<User[]> {
        try {
            console.log('📋 Querying DynamoDB for Systiva users');

            // Query for Systiva users using correct PK pattern
            const systivaPK = 'SYSTIVA#systiva#USERS';
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': systivaPK,
                    ':sk': 'USER#',
                },
            );

            console.log(`📋 Found ${items.length} Systiva users`);
            if (items.length > 0) {
                console.log(
                    '📋 Systiva users PKs:',
                    items.map((item) => ({
                        PK: item.PK,
                        SK: item.SK,
                        name: `${item.first_name} ${item.last_name}`,
                        account_name: item.account_name,
                    })),
                );
            }

            return items
                .map((item) => ({
                    id: item.id || item.PK?.replace('SYSTIVA#', ''),
                    firstName: item.first_name,
                    middleName: item.middle_name,
                    lastName: item.last_name,
                    emailAddress: item.email_address,
                    status: item.status,
                    startDate: item.start_date,
                    endDate: item.end_date,
                    technicalUser: item.technical_user,
                    assignedGroups: item.assigned_groups || [],
                    createdAt: item.created_date || item.createdAt,
                    updatedAt: item.updated_date || item.updatedAt,
                }))
                .sort((a, b) =>
                    (a.lastName + a.firstName).localeCompare(
                        b.lastName + b.firstName,
                    ),
                );
        } catch (error) {
            console.error('Error listing users:', error);
            throw error;
        }
    }

    async updateUser(
        userId: string,
        updates: Partial<User>,
    ): Promise<User | null> {
        try {
            const now = new Date().toISOString();

            // Get existing user to track group changes
            const existingUser = await this.getUser(userId);
            if (!existingUser) {
                return null;
            }

            const updateFields: string[] = [];
            const expressionAttributeValues: any = {
                ':updated': now,
            };
            const expressionAttributeNames: any = {};

            if (updates.firstName !== undefined) {
                updateFields.push('first_name = :firstName');
                expressionAttributeValues[':firstName'] = updates.firstName;
            }
            if (updates.middleName !== undefined) {
                updateFields.push('middle_name = :middleName');
                expressionAttributeValues[':middleName'] = updates.middleName;
            }
            if (updates.lastName !== undefined) {
                updateFields.push('last_name = :lastName');
                expressionAttributeValues[':lastName'] = updates.lastName;
            }
            if (updates.emailAddress !== undefined) {
                updateFields.push('email_address = :emailAddress');
                expressionAttributeValues[':emailAddress'] =
                    updates.emailAddress;
            }
            if (updates.status !== undefined) {
                updateFields.push('#status = :status');
                expressionAttributeNames['#status'] = 'status';
                expressionAttributeValues[':status'] = updates.status;
            }
            if (updates.startDate !== undefined) {
                updateFields.push('start_date = :startDate');
                expressionAttributeValues[':startDate'] = updates.startDate;
            }
            if (updates.endDate !== undefined) {
                updateFields.push('end_date = :endDate');
                expressionAttributeValues[':endDate'] = updates.endDate;
            }
            if (updates.technicalUser !== undefined) {
                updateFields.push('technical_user = :technicalUser');
                expressionAttributeValues[':technicalUser'] =
                    updates.technicalUser;
            }
            if (updates.assignedGroups !== undefined) {
                updateFields.push('assigned_groups = :assignedGroups');
                expressionAttributeValues[':assignedGroups'] =
                    updates.assignedGroups;

                // Update user-group lookup records
                await this.updateUserGroupLookups(
                    userId,
                    existingUser.assignedGroups || [],
                    updates.assignedGroups,
                );
            }
            if (updates.password !== undefined) {
                const hashedPassword = await this.hashPassword(
                    updates.password,
                );
                updateFields.push('#password = :password');
                expressionAttributeNames['#password'] = 'password';
                expressionAttributeValues[':password'] = hashedPassword;
            }

            // Always ensure entity_type is set (for legacy records that might be missing it)
            updateFields.push('entity_type = :entityType');
            expressionAttributeValues[':entityType'] = 'user';

            updateFields.push('updated_date = :updated');
            updateFields.push('updatedAt = :updated');

            const updateExpression = `SET ${updateFields.join(', ')}`;

            const result = await withDynamoDB(async (client) => {
                const {UpdateCommand} = await import('@aws-sdk/lib-dynamodb');
                const response = await client.send(
                    new UpdateCommand({
                        TableName: this.tableName,
                        Key: {
                            PK: `SYSTIVA#${userId}`,
                            SK: `USER#${userId}`,
                        },
                        UpdateExpression: updateExpression,
                        ExpressionAttributeValues: expressionAttributeValues,
                        ...(Object.keys(expressionAttributeNames).length >
                            0 && {
                            ExpressionAttributeNames: expressionAttributeNames,
                        }),
                        ReturnValues: 'ALL_NEW',
                    }),
                );
                return response.Attributes;
            });

            if (!result) {
                return null;
            }

            return {
                id: result.id || userId,
                firstName: result.first_name,
                middleName: result.middle_name,
                lastName: result.last_name,
                emailAddress: result.email_address,
                status: result.status,
                startDate: result.start_date,
                endDate: result.end_date,
                technicalUser: result.technical_user,
                assignedGroups: result.assigned_groups || [],
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('Error updating user:', error);
            throw error;
        }
    }

    async updateUserInAccountTable(
        userId: string,
        updates: Partial<User>,
        accountId: string,
        accountName: string,
    ): Promise<User | null> {
        try {
            const now = new Date().toISOString();
            const accountPK = `${accountName.toUpperCase()}#${accountId}#USERS`;

            // Get existing user from systiva table
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND SK = :sk',
                {
                    ':pk': accountPK,
                    ':sk': `USER#${userId}`,
                },
            );

            if (!items || items.length === 0) {
                return null;
            }

            const existingUser = items[0];

            const updateFields: string[] = [];
            const expressionAttributeValues: any = {
                ':updated': now,
            };
            const expressionAttributeNames: any = {};

            if (updates.firstName !== undefined) {
                updateFields.push('first_name = :firstName');
                expressionAttributeValues[':firstName'] = updates.firstName;
            }
            if (updates.middleName !== undefined) {
                updateFields.push('middle_name = :middleName');
                expressionAttributeValues[':middleName'] = updates.middleName;
            }
            if (updates.lastName !== undefined) {
                updateFields.push('last_name = :lastName');
                expressionAttributeValues[':lastName'] = updates.lastName;
            }
            if (updates.emailAddress !== undefined) {
                updateFields.push('email_address = :emailAddress');
                expressionAttributeValues[':emailAddress'] =
                    updates.emailAddress;
            }
            if (updates.status !== undefined) {
                updateFields.push('#status = :status');
                expressionAttributeNames['#status'] = 'status';
                expressionAttributeValues[':status'] = updates.status;
            }
            if (updates.startDate !== undefined) {
                updateFields.push('start_date = :startDate');
                expressionAttributeValues[':startDate'] = updates.startDate;
            }
            if (updates.endDate !== undefined) {
                updateFields.push('end_date = :endDate');
                expressionAttributeValues[':endDate'] = updates.endDate;
            }
            if (updates.technicalUser !== undefined) {
                updateFields.push('technical_user = :technicalUser');
                expressionAttributeValues[':technicalUser'] =
                    updates.technicalUser;
            }
            if (updates.assignedGroups !== undefined) {
                updateFields.push('assigned_groups = :assignedGroups');
                expressionAttributeValues[':assignedGroups'] =
                    updates.assignedGroups;

                // Update user-group lookup records
                await this.updateUserGroupLookups(
                    userId,
                    existingUser.assigned_groups || [],
                    updates.assignedGroups,
                );
            }
            if (updates.password !== undefined) {
                const hashedPassword = await this.hashPassword(
                    updates.password,
                );
                updateFields.push('#password = :password');
                expressionAttributeNames['#password'] = 'password';
                expressionAttributeValues[':password'] = hashedPassword;
            }

            // Always ensure entity_type is set
            updateFields.push('entity_type = :entityType');
            expressionAttributeValues[':entityType'] = 'user';

            updateFields.push('updated_date = :updated');
            updateFields.push('updatedAt = :updated');

            const updateExpression = `SET ${updateFields.join(', ')}`;

            const result = await withDynamoDB(async (client) => {
                const {UpdateCommand} = await import('@aws-sdk/lib-dynamodb');
                const response = await client.send(
                    new UpdateCommand({
                        TableName: this.tableName,
                        Key: {
                            PK: accountPK,
                            SK: `USER#${userId}`,
                        },
                        UpdateExpression: updateExpression,
                        ExpressionAttributeValues: expressionAttributeValues,
                        ...(Object.keys(expressionAttributeNames).length >
                            0 && {
                            ExpressionAttributeNames: expressionAttributeNames,
                        }),
                        ReturnValues: 'ALL_NEW',
                    }),
                );
                return response.Attributes;
            });

            if (!result) {
                return null;
            }

            return {
                id: result.id || userId,
                firstName: result.first_name,
                middleName: result.middle_name,
                lastName: result.last_name,
                emailAddress: result.email_address,
                status: result.status,
                startDate: result.start_date,
                endDate: result.end_date,
                technicalUser: result.technical_user,
                assignedGroups: result.assigned_groups || [],
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('Error updating user in account table:', error);
            throw error;
        }
    }

    async deleteUser(userId: string): Promise<void> {
        try {
            // Get user to find assigned groups for cleanup
            const user = await this.getUser(userId);
            if (user && user.assignedGroups) {
                // Delete all user-group lookup records
                for (const groupId of user.assignedGroups) {
                    await this.deleteUserGroupLookup(userId, groupId);
                }
            }

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `SYSTIVA#${userId}`,
                SK: `USER#${userId}`,
            });
        } catch (error) {
            console.error('Error deleting user:', error);
            throw error;
        }
    }

    async deleteUserFromAccountTable(
        userId: string,
        accountId: string,
        accountName: string,
    ): Promise<void> {
        try {
            const accountPK = `${accountName.toUpperCase()}#${accountId}#USERS`;

            // Get user to find assigned groups for cleanup
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND SK = :sk',
                {
                    ':pk': accountPK,
                    ':sk': `USER#${userId}`,
                },
            );

            if (items && items.length > 0) {
                const user = items[0];
                if (user.assigned_groups) {
                    // Delete all user-group lookup records
                    for (const groupId of user.assigned_groups) {
                        await this.deleteUserGroupLookup(userId, groupId);
                    }
                }
            }

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: accountPK,
                SK: `USER#${userId}`,
            });
        } catch (error) {
            console.error('Error deleting user from account table:', error);
            throw error;
        }
    }

    // ==========================================
    // GROUP OPERATIONS
    // ==========================================

    async createGroup(
        groupData: Omit<Group, 'id' | 'createdAt' | 'updatedAt'> & {
            selectedAccountId?: string;
            selectedAccountName?: string;
        },
    ): Promise<Group> {
        try {
            const groupId = uuidv4();
            const now = new Date().toISOString();

            // Determine if this is for a specific account or Systiva
            const isAccountSpecific =
                groupData.selectedAccountId && groupData.selectedAccountName;

            // Use correct PK pattern: <ACCOUNT_NAME>#${account_Id}#GROUPS
            const accountPK = isAccountSpecific
                ? `${groupData.selectedAccountName!.toUpperCase()}#${
                      groupData.selectedAccountId
                  }#GROUPS`
                : `SYSTIVA#systiva#GROUPS`;

            const group: Group = {
                id: groupId,
                name: groupData.name,
                description: groupData.description,
                entity: groupData.entity || '',
                service: groupData.service || '',
                assignedRoles: groupData.assignedRoles || [],
                createdAt: now,
                updatedAt: now,
            };

            const item: any = {
                PK: accountPK,
                SK: `GROUP#${groupId}`,
                id: groupId,
                account_id: groupData.selectedAccountId || 'systiva',
                account_name: groupData.selectedAccountName || 'SYSTIVA',
                group_name: group.name,
                description: group.description,
                entity: group.entity || '',
                service: group.service || '',
                assigned_roles: group.assignedRoles,
                created_date: now,
                updated_date: now,
                entity_type: 'GROUP',
            };

            // Add account fields if account-specific
            if (isAccountSpecific) {
                item.account_id = groupData.selectedAccountId;
                item.account_name = groupData.selectedAccountName;
            }

            console.log('🆕 Creating group in DynamoDB:', item);
            await DynamoDBOperations.putItem(this.tableName, item);
            console.log('🆕 Group created successfully with ID:', groupId);

            // Create group-role assignment lookup records
            if (group.assignedRoles && group.assignedRoles.length > 0) {
                for (const roleId of group.assignedRoles) {
                    await this.createGroupRoleLookup(groupId, roleId);
                }
            }

            return group;
        } catch (error) {
            console.error('Error creating group:', error);
            throw error;
        }
    }

    async getGroup(groupId: string): Promise<Group | null> {
        try {
            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `SYSTIVA#${groupId}`,
                SK: `GROUP#${groupId}`,
            });

            if (!item) {
                return null;
            }

            return {
                id: item.id || groupId,
                name: item.group_name || item.name,
                description: item.description,
                entity: item.entity || '',
                service: item.service || '',
                assignedRoles: item.assigned_roles || [],
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('Error getting group:', error);
            throw error;
        }
    }

    async listGroups(
        accountId?: string,
        accountName?: string,
    ): Promise<Group[]> {
        try {
            console.log(
                '📋 Scanning DynamoDB for groups with entity_type = group',
                {accountId, accountName},
            );

            // Determine if we need to filter by account
            const isAccountSpecific = accountId && accountName;

            let items: any[];
            if (isAccountSpecific) {
                // Query for account-specific groups using correct PK pattern
                const accountPK = `${accountName.toUpperCase()}#${accountId}#GROUPS`;
                console.log(
                    '📋 Querying for account-specific groups with PK:',
                    accountPK,
                );

                items = await DynamoDBOperations.queryItems(
                    this.tableName,
                    'PK = :pk AND begins_with(SK, :sk)',
                    {
                        ':pk': accountPK,
                        ':sk': 'GROUP#',
                    },
                );
            } else {
                // Query for Systiva groups using correct PK pattern
                console.log('📋 Querying for Systiva groups');
                const systivaPK = 'SYSTIVA#systiva#GROUPS';
                items = await DynamoDBOperations.queryItems(
                    this.tableName,
                    'PK = :pk AND begins_with(SK, :sk)',
                    {
                        ':pk': systivaPK,
                        ':sk': 'GROUP#',
                    },
                );
            }

            console.log(`📋 Found ${items.length} groups`);
            console.log('📋 Sample items:', items.slice(0, 2));

            const groups = items
                .map((item) => ({
                    id: item.id || item.PK?.split('#').pop(),
                    name: item.group_name || item.name,
                    description: item.description,
                    entity: item.entity || '',
                    service: item.service || '',
                    assignedRoles: item.assigned_roles || [],
                    createdAt: item.created_date || item.createdAt,
                    updatedAt: item.updated_date || item.updatedAt,
                }))
                .sort((a, b) => a.name.localeCompare(b.name));

            console.log(`📋 Returning ${groups.length} transformed groups`);
            return groups;
        } catch (error) {
            console.error('Error listing groups:', error);
            throw error;
        }
    }

    async updateGroup(
        groupId: string,
        updates: Partial<Group> & {
            selectedAccountId?: string;
            selectedAccountName?: string;
        },
    ): Promise<Group | null> {
        try {
            const now = new Date().toISOString();

            // Determine PK based on account context
            const isAccountSpecific =
                updates.selectedAccountId && updates.selectedAccountName;
            const pkPrefix = isAccountSpecific
                ? `${updates.selectedAccountName!.toUpperCase()}#${
                      updates.selectedAccountId
                  }#GROUP`
                : 'SYSTIVA';

            // Get existing group to track role changes
            const existingGroup = await this.getGroup(groupId);
            if (!existingGroup) {
                return null;
            }

            const updateFields: string[] = [];
            const expressionAttributeValues: any = {
                ':updated': now,
            };
            const expressionAttributeNames: any = {};

            if (updates.name !== undefined) {
                updateFields.push('group_name = :name');
                updateFields.push('#name = :name');
                expressionAttributeNames['#name'] = 'name';
                expressionAttributeValues[':name'] = updates.name;
            }
            if (updates.description !== undefined) {
                updateFields.push('description = :description');
                expressionAttributeValues[':description'] = updates.description;
            }
            if (updates.entity !== undefined) {
                updateFields.push('entity = :entity');
                expressionAttributeValues[':entity'] = updates.entity;
            }
            if (updates.service !== undefined) {
                updateFields.push('#service = :service');
                expressionAttributeNames['#service'] = 'service';
                expressionAttributeValues[':service'] = updates.service;
            }
            if (updates.assignedRoles !== undefined) {
                updateFields.push('assigned_roles = :assignedRoles');
                expressionAttributeValues[':assignedRoles'] =
                    updates.assignedRoles;

                // Update group-role lookup records
                await this.updateGroupRoleLookups(
                    groupId,
                    existingGroup.assignedRoles || [],
                    updates.assignedRoles,
                );
            }

            // Always ensure entity_type is set (for legacy records that might be missing it)
            updateFields.push('entity_type = :entityType');
            expressionAttributeValues[':entityType'] = 'group';

            updateFields.push('updated_date = :updated');
            updateFields.push('updatedAt = :updated');

            const updateExpression = `SET ${updateFields.join(', ')}`;

            const result = await withDynamoDB(async (client) => {
                const {UpdateCommand} = await import('@aws-sdk/lib-dynamodb');
                const response = await client.send(
                    new UpdateCommand({
                        TableName: this.tableName,
                        Key: {
                            PK: `${pkPrefix}#${groupId}`,
                            SK: `GROUP#${groupId}`,
                        },
                        UpdateExpression: updateExpression,
                        ExpressionAttributeValues: expressionAttributeValues,
                        ...(Object.keys(expressionAttributeNames).length >
                            0 && {
                            ExpressionAttributeNames: expressionAttributeNames,
                        }),
                        ReturnValues: 'ALL_NEW',
                    }),
                );
                return response.Attributes;
            });

            if (!result) {
                return null;
            }

            return {
                id: result.id || groupId,
                name: result.group_name || result.name,
                description: result.description,
                entity: result.entity || '',
                service: result.service || '',
                assignedRoles: result.assigned_roles || [],
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('❌ Error updating group:', error);
            throw error;
        }
    }

    async deleteGroup(groupId: string): Promise<void> {
        try {
            // Get group to find assigned roles for cleanup
            const group = await this.getGroup(groupId);
            if (group && group.assignedRoles) {
                // Delete all group-role lookup records
                for (const roleId of group.assignedRoles) {
                    await this.deleteGroupRoleLookup(groupId, roleId);
                }
            }

            // Delete all user-group lookups for this group
            await this.deleteAllUserGroupLookupsForGroup(groupId);

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `SYSTIVA#${groupId}`,
                SK: `GROUP#${groupId}`,
            });
        } catch (error) {
            console.error('Error deleting group:', error);
            throw error;
        }
    }

    // ==========================================
    // ROLE OPERATIONS
    // ==========================================

    async createRole(
        roleData: Omit<Role, 'id' | 'createdAt' | 'updatedAt'> & {
            selectedAccountId?: string;
            selectedAccountName?: string;
        },
    ): Promise<Role> {
        try {
            const roleId = uuidv4();
            const now = new Date().toISOString();

            console.log('📋 createRole called with roleData:', {
                name: roleData.name,
                selectedAccountId: roleData.selectedAccountId,
                selectedAccountName: roleData.selectedAccountName,
                selectedAccountId_type: typeof roleData.selectedAccountId,
                selectedAccountName_type: typeof roleData.selectedAccountName,
                fullRoleData: roleData,
            });

            // Determine if this is for a specific account or Systiva
            const isAccountSpecific =
                roleData.selectedAccountId && roleData.selectedAccountName;

            console.log('📋 isAccountSpecific check:', {
                isAccountSpecific,
                hasAccountId: !!roleData.selectedAccountId,
                hasAccountName: !!roleData.selectedAccountName,
            });

            // Use correct PK pattern: <ACCOUNT_NAME>#${account_Id}#ROLES
            const accountPK = isAccountSpecific
                ? `${roleData.selectedAccountName!.toUpperCase()}#${
                      roleData.selectedAccountId
                  }#ROLES`
                : `SYSTIVA#systiva#ROLES`;

            console.log('📋 Using PK:', accountPK);

            const role: Role = {
                id: roleId,
                ...roleData,
                createdAt: now,
                updatedAt: now,
            };

            const item = {
                PK: accountPK,
                SK: `ROLE#${roleId}`,
                id: roleId,
                account_id: roleData.selectedAccountId || 'systiva',
                account_name: roleData.selectedAccountName || 'SYSTIVA',
                role_name: role.name,
                description: role.description,
                scope_config: role.scopeConfig,
                created_date: now,
                updated_date: now,
                entity_type: 'ROLE',
            };

            console.log('📋 DynamoDB item to be created:', item);

            await DynamoDBOperations.putItem(this.tableName, item);

            console.log(`✅ Role created successfully with PK: ${accountPK}`);

            return role;
        } catch (error) {
            console.error('Error creating role:', error);
            throw error;
        }
    }

    async getRole(roleId: string): Promise<Role | null> {
        try {
            // First, try to find the role by querying with the roleId in SK
            // We need to query listRoles and filter by ID since we don't know the account
            const allRoles = await this.listRoles();
            const role = allRoles.find((r) => r.id === roleId);

            if (!role) {
                console.log(`⚠️ Role not found with ID: ${roleId}`);
                return null;
            }

            return role;
        } catch (error) {
            console.error('Error getting role:', error);
            throw error;
        }
    }

    async listRoles(): Promise<Role[]> {
        try {
            console.log('📋 Querying DynamoDB for Systiva roles');

            // Query for Systiva roles using correct PK pattern
            const systivaPK = 'SYSTIVA#systiva#ROLES';
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': systivaPK,
                    ':sk': 'ROLE#',
                },
            );

            console.log(`📋 Found ${items.length} Systiva roles`);
            if (items.length > 0) {
                console.log(
                    '📋 Systiva roles PKs:',
                    items.map((item) => ({
                        PK: item.PK,
                        SK: item.SK,
                        name: item.role_name || item.name,
                        account_name: item.account_name,
                    })),
                );
            }

            return items
                .map((item) => ({
                    id: item.id || item.PK?.replace('SYSTIVA#', ''),
                    roleName: item.role_name || item.name,
                    name: item.role_name || item.name, // Keep for backwards compatibility
                    description: item.description,
                    scopeConfig: item.scope_config,
                    createdAt: item.created_date || item.createdAt,
                    updatedAt: item.updated_date || item.updatedAt,
                }))
                .sort((a, b) => a.roleName.localeCompare(b.roleName));
        } catch (error) {
            console.error('Error listing roles:', error);
            throw error;
        }
    }

    async listRolesByAccount(
        accountId: string,
        accountName: string,
    ): Promise<Role[]> {
        try {
            const accountPK = `${accountName.toUpperCase()}#${accountId}#ROLES`;

            console.log('📋 Querying DynamoDB for account-specific roles:', {
                accountId,
                accountName,
                pkPrefix: accountPK,
            });

            // Query systiva table for all roles under this account
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': accountPK,
                    ':sk': 'ROLE#',
                },
            );

            console.log(
                `📋 Found ${items.length} roles for account ${accountName}`,
            );
            if (items.length > 0) {
                console.log(
                    '📋 Account roles PKs:',
                    items.map((item) => ({
                        PK: item.PK,
                        SK: item.SK,
                        name: item.role_name || item.name,
                        account_name: item.account_name,
                    })),
                );
            }

            return items.map((item) => ({
                id: item.id,
                roleName: item.role_name || item.name,
                name: item.role_name || item.name, // Keep for backwards compatibility
                description: item.description,
                scopeConfig: item.scope_config,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            }));
        } catch (error) {
            console.error('Error listing roles by account:', error);
            throw error;
        }
    }

    async updateRole(
        roleId: string,
        updates: Partial<Role>,
    ): Promise<Role | null> {
        try {
            const now = new Date().toISOString();

            // First, get the existing role to find its correct PK
            const existingRole = await this.getRole(roleId);
            if (!existingRole) {
                console.log(
                    `⚠️ Cannot update role - role not found: ${roleId}`,
                );
                return null;
            }

            // Find the PK by querying the database
            const allRolesRaw = await withDynamoDB(async (client) => {
                const {QueryCommand} = await import('@aws-sdk/lib-dynamodb');

                // Query Systiva roles
                const systivaResponse = await client.send(
                    new QueryCommand({
                        TableName: this.tableName,
                        KeyConditionExpression:
                            'PK = :pk AND begins_with(SK, :skPrefix)',
                        ExpressionAttributeValues: {
                            ':pk': 'SYSTIVA#systiva#ROLES',
                            ':skPrefix': 'ROLE#',
                        },
                    }),
                );

                return systivaResponse.Items || [];
            });

            const roleRecord = allRolesRaw.find((r) => r.id === roleId);
            if (!roleRecord) {
                console.log(`⚠️ Cannot find role record in DB: ${roleId}`);
                return null;
            }

            const updateFields: string[] = [];
            const expressionAttributeValues: any = {
                ':updated': now,
            };
            const expressionAttributeNames: any = {};

            if (updates.name !== undefined) {
                updateFields.push('role_name = :name');
                updateFields.push('#name = :name');
                expressionAttributeNames['#name'] = 'name';
                expressionAttributeValues[':name'] = updates.name;
            }
            if (updates.description !== undefined) {
                updateFields.push('description = :description');
                expressionAttributeValues[':description'] = updates.description;
            }
            if (updates.scopeConfig !== undefined) {
                updateFields.push('scope_config = :scopeConfig');
                expressionAttributeValues[':scopeConfig'] = updates.scopeConfig;
            }

            // Always ensure entity_type is set (for legacy records that might be missing it)
            updateFields.push('entity_type = :entityType');
            expressionAttributeValues[':entityType'] = 'role';

            updateFields.push('updated_date = :updated');
            updateFields.push('updatedAt = :updated');

            const updateExpression = `SET ${updateFields.join(', ')}`;

            const result = await withDynamoDB(async (client) => {
                const {UpdateCommand} = await import('@aws-sdk/lib-dynamodb');
                const response = await client.send(
                    new UpdateCommand({
                        TableName: this.tableName,
                        Key: {
                            PK: roleRecord.PK,
                            SK: roleRecord.SK,
                        },
                        UpdateExpression: updateExpression,
                        ExpressionAttributeValues: expressionAttributeValues,
                        ...(Object.keys(expressionAttributeNames).length >
                            0 && {
                            ExpressionAttributeNames: expressionAttributeNames,
                        }),
                        ReturnValues: 'ALL_NEW',
                    }),
                );
                return response.Attributes;
            });

            if (!result) {
                return null;
            }

            return {
                id: result.id || roleId,
                name: result.role_name || result.name,
                description: result.description,
                scopeConfig: result.scope_config,
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('Error updating role:', error);
            throw error;
        }
    }

    async deleteRole(roleId: string): Promise<void> {
        try {
            // Delete all group-role lookups for this role
            await this.deleteAllGroupRoleLookupsForRole(roleId);

            // Find the correct PK for this role
            const allRolesRaw = await withDynamoDB(async (client) => {
                const {QueryCommand} = await import('@aws-sdk/lib-dynamodb');

                const systivaResponse = await client.send(
                    new QueryCommand({
                        TableName: this.tableName,
                        KeyConditionExpression:
                            'PK = :pk AND begins_with(SK, :skPrefix)',
                        ExpressionAttributeValues: {
                            ':pk': 'SYSTIVA#systiva#ROLES',
                            ':skPrefix': 'ROLE#',
                        },
                    }),
                );

                return systivaResponse.Items || [];
            });

            const roleRecord = allRolesRaw.find((r) => r.id === roleId);
            if (roleRecord) {
                await DynamoDBOperations.deleteItem(this.tableName, {
                    PK: roleRecord.PK,
                    SK: roleRecord.SK,
                });
            }
        } catch (error) {
            console.error('Error deleting role:', error);
            throw error;
        }
    }

    // ==========================================
    // LOOKUP/ASSIGNMENT OPERATIONS
    // ==========================================

    // User-Group Lookup Management
    private async createUserGroupLookup(
        userId: string,
        groupId: string,
    ): Promise<void> {
        const now = new Date().toISOString();
        const lookupItem = {
            PK: `SYSTIVA#${userId}`,
            SK: `GROUP_ASSIGNMENT#${groupId}`,
            user_id: userId,
            group_id: groupId,
            assigned_at: now,
            entity_type: 'user_group_assignment',
        };
        await DynamoDBOperations.putItem(this.tableName, lookupItem);
    }

    // Account-specific user-group relationship lookups
    private async createUserGroupLookupInAccount(
        userId: string,
        groupId: string,
        accountId: string,
        accountName: string,
    ): Promise<void> {
        const now = new Date().toISOString();

        // User's groups relationship: PK: USER#${accountId}#${userId}#GROUPS, SK: GROUP#${groupId}
        const userGroupsItem = {
            PK: `USER#${accountId}#${userId}#GROUPS`,
            SK: `GROUP#${groupId}`,
            user_id: userId,
            group_id: groupId,
            account_id: accountId,
            account_name: accountName,
            assigned_at: now,
            entity_type: 'GROUP_MEMBERSHIP',
        };
        await DynamoDBOperations.putItem(this.tableName, userGroupsItem);

        // Group's members relationship: PK: GROUP#${accountId}#${groupId}#MEMBERS, SK: USER#${userId}
        const groupMembersItem = {
            PK: `GROUP#${accountId}#${groupId}#MEMBERS`,
            SK: `USER#${userId}`,
            user_id: userId,
            group_id: groupId,
            account_id: accountId,
            account_name: accountName,
            assigned_at: now,
            entity_type: 'USER_IN_GROUP',
        };
        await DynamoDBOperations.putItem(this.tableName, groupMembersItem);
    }

    private async deleteUserGroupLookup(
        userId: string,
        groupId: string,
    ): Promise<void> {
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `SYSTIVA#${userId}`,
            SK: `GROUP_ASSIGNMENT#${groupId}`,
        });
    }

    private async deleteUserGroupLookupInAccount(
        userId: string,
        groupId: string,
        accountId: string,
    ): Promise<void> {
        // Delete user's groups relationship
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `USER#${accountId}#${userId}#GROUPS`,
            SK: `GROUP#${groupId}`,
        });

        // Delete group's members relationship
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `GROUP#${accountId}#${groupId}#MEMBERS`,
            SK: `USER#${userId}`,
        });
    }

    private async updateUserGroupLookups(
        userId: string,
        oldGroups: string[],
        newGroups: string[],
    ): Promise<void> {
        // Find groups to remove
        const groupsToRemove = oldGroups.filter((g) => !newGroups.includes(g));
        for (const groupId of groupsToRemove) {
            await this.deleteUserGroupLookup(userId, groupId);
        }

        // Find groups to add
        const groupsToAdd = newGroups.filter((g) => !oldGroups.includes(g));
        for (const groupId of groupsToAdd) {
            await this.createUserGroupLookup(userId, groupId);
        }
    }

    private async deleteAllUserGroupLookupsForGroup(
        groupId: string,
    ): Promise<void> {
        // Query all users assigned to this group
        const items = await DynamoDBOperations.scanItems(
            this.tableName,
            'entity_type = :type AND group_id = :groupId',
            {
                ':type': 'user_group_assignment',
                ':groupId': groupId,
            },
        );

        // Delete all lookup records
        for (const item of items) {
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: item.PK,
                SK: item.SK,
            });
        }
    }

    // Group-Role Lookup Management
    private async createGroupRoleLookup(
        groupId: string,
        roleId: string,
    ): Promise<void> {
        const now = new Date().toISOString();
        const lookupItem = {
            PK: `SYSTIVA#${groupId}`,
            SK: `ROLE_ASSIGNMENT#${roleId}`,
            group_id: groupId,
            role_id: roleId,
            assigned_at: now,
            entity_type: 'group_role_assignment',
        };
        await DynamoDBOperations.putItem(this.tableName, lookupItem);
    }

    // Account-specific group-role relationship lookups
    private async createGroupRoleLookupInAccount(
        groupId: string,
        roleId: string,
        accountId: string,
        accountName: string,
    ): Promise<void> {
        const now = new Date().toISOString();

        // Group's roles relationship: PK: GROUP#${accountId}#${groupId}#ROLES, SK: ROLE#${roleId}
        const groupRolesItem = {
            PK: `GROUP#${accountId}#${groupId}#ROLES`,
            SK: `ROLE#${roleId}`,
            group_id: groupId,
            role_id: roleId,
            account_id: accountId,
            account_name: accountName,
            assigned_at: now,
            entity_type: 'GROUP_ROLE_ASSIGNMENT',
        };
        await DynamoDBOperations.putItem(this.tableName, groupRolesItem);

        // Role's groups relationship: PK: ROLE#${accountId}#${roleId}#GROUPS, SK: GROUP#${groupId}
        const roleGroupsItem = {
            PK: `ROLE#${accountId}#${roleId}#GROUPS`,
            SK: `GROUP#${groupId}`,
            group_id: groupId,
            role_id: roleId,
            account_id: accountId,
            account_name: accountName,
            assigned_at: now,
            entity_type: 'ROLE_GROUP_ASSIGNMENT',
        };
        await DynamoDBOperations.putItem(this.tableName, roleGroupsItem);
    }

    private async deleteGroupRoleLookup(
        groupId: string,
        roleId: string,
    ): Promise<void> {
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `SYSTIVA#${groupId}`,
            SK: `ROLE_ASSIGNMENT#${roleId}`,
        });
    }

    private async deleteGroupRoleLookupInAccount(
        groupId: string,
        roleId: string,
        accountId: string,
    ): Promise<void> {
        // Delete group's roles relationship
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `GROUP#${accountId}#${groupId}#ROLES`,
            SK: `ROLE#${roleId}`,
        });

        // Delete role's groups relationship
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `ROLE#${accountId}#${roleId}#GROUPS`,
            SK: `GROUP#${groupId}`,
        });
    }

    private async updateGroupRoleLookups(
        groupId: string,
        oldRoles: string[],
        newRoles: string[],
    ): Promise<void> {
        // Find roles to remove
        const rolesToRemove = oldRoles.filter((r) => !newRoles.includes(r));
        for (const roleId of rolesToRemove) {
            await this.deleteGroupRoleLookup(groupId, roleId);
        }

        // Find roles to add
        const rolesToAdd = newRoles.filter((r) => !oldRoles.includes(r));
        for (const roleId of rolesToAdd) {
            await this.createGroupRoleLookup(groupId, roleId);
        }
    }

    // User-Role Lookup Management (for direct user-role assignments)
    private async createUserRoleLookupInAccount(
        userId: string,
        roleId: string,
        accountId: string,
        accountName: string,
    ): Promise<void> {
        const now = new Date().toISOString();

        // User's direct roles: PK: USER#${accountId}#${userId}#ROLES, SK: ROLE#${roleId}
        const userRolesItem = {
            PK: `USER#${accountId}#${userId}#ROLES`,
            SK: `ROLE#${roleId}`,
            user_id: userId,
            role_id: roleId,
            account_id: accountId,
            account_name: accountName,
            assigned_at: now,
            entity_type: 'USER_ROLE_ASSIGNMENT',
        };
        await DynamoDBOperations.putItem(this.tableName, userRolesItem);

        // Role's direct users: PK: ROLE#${accountId}#${roleId}#USERS, SK: USER#${userId}
        const roleUsersItem = {
            PK: `ROLE#${accountId}#${roleId}#USERS`,
            SK: `USER#${userId}`,
            user_id: userId,
            role_id: roleId,
            account_id: accountId,
            account_name: accountName,
            assigned_at: now,
            entity_type: 'USER_ROLE_ASSIGNMENT',
        };
        await DynamoDBOperations.putItem(this.tableName, roleUsersItem);
    }

    private async deleteUserRoleLookupInAccount(
        userId: string,
        roleId: string,
        accountId: string,
    ): Promise<void> {
        // Delete user's direct roles
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `USER#${accountId}#${userId}#ROLES`,
            SK: `ROLE#${roleId}`,
        });

        // Delete role's direct users
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `ROLE#${accountId}#${roleId}#USERS`,
            SK: `USER#${userId}`,
        });
    }

    private async deleteAllGroupRoleLookupsForRole(
        roleId: string,
    ): Promise<void> {
        // Query all groups assigned to this role
        const items = await DynamoDBOperations.scanItems(
            this.tableName,
            'entity_type = :type AND role_id = :roleId',
            {
                ':type': 'group_role_assignment',
                ':roleId': roleId,
            },
        );

        // Delete all lookup records
        for (const item of items) {
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: item.PK,
                SK: item.SK,
            });
        }
    }

    // ==========================================
    // QUERY HELPERS
    // ==========================================

    async getUserGroups(userId: string): Promise<Group[]> {
        try {
            const user = await this.getUser(userId);
            if (!user || !user.assignedGroups) {
                return [];
            }

            const groups: Group[] = [];
            for (const groupId of user.assignedGroups) {
                const group = await this.getGroup(groupId);
                if (group) {
                    groups.push(group);
                }
            }

            return groups;
        } catch (error) {
            console.error('Error getting user groups:', error);
            throw error;
        }
    }

    async getGroupRoles(groupId: string): Promise<Role[]> {
        try {
            const group = await this.getGroup(groupId);
            if (!group || !group.assignedRoles) {
                return [];
            }

            const roles: Role[] = [];
            for (const roleId of group.assignedRoles) {
                const role = await this.getRole(roleId);
                if (role) {
                    roles.push(role);
                }
            }

            return roles;
        } catch (error) {
            console.error('Error getting group roles:', error);
            throw error;
        }
    }

    async getUserWithFullHierarchy(userId: string): Promise<any> {
        try {
            const user = await this.getUser(userId);
            if (!user) {
                return null;
            }

            const groups = await this.getUserGroups(userId);
            const groupsWithRoles = await Promise.all(
                groups.map(async (group) => {
                    const roles = await this.getGroupRoles(group.id);
                    return {
                        ...group,
                        roles,
                    };
                }),
            );

            return {
                ...user,
                groups: groupsWithRoles,
            };
        } catch (error) {
            console.error('Error getting user with full hierarchy:', error);
            throw error;
        }
    }

    // Debug method
    async debugTableContents(): Promise<any> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'begins_with(entity_type, :prefix)',
                {
                    ':prefix': 'user',
                },
            );
            return {
                tableName: this.tableName,
                totalItems: items.length,
                items: items.slice(0, 10),
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
