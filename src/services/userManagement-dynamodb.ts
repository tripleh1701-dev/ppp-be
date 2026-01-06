import {DynamoDBOperations, withDynamoDB} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';
import bcrypt from 'bcrypt';
import {
    encryptPassword,
    decryptPassword,
    isValidEncryptedPassword,
    logPasswordOperation,
    EncryptedPassword,
} from '../utils/passwordEncryption';

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
    product?: string; // Product name/identifier
    service?: string; // Service name
    assignedRoles?: string[]; // Role IDs
    enterpriseId?: string; // Enterprise ID for account-specific groups
    enterpriseName?: string; // Enterprise name for account-specific groups
    createdAt: string;
    updatedAt: string;
}

export interface Role {
    id: string;
    name: string;
    roleName?: string; // legacy UI field
    description?: string;
    entity?: string;
    product?: string;
    service?: string;
    enterpriseId?: string;
    enterpriseName?: string;
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
        // Use systiva table with consistent ACCOUNT# prefix pattern
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
    ): Promise<User | null> {
        try {
            console.log(`🔐 Authenticating user: ${email}`);

            // Try new format first: ACCOUNT#SYSTIVA for global users
            let systivaItems = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': 'ACCOUNT#SYSTIVA',
                    ':sk': 'USER#',
                },
            );

            // Fallback to old format: SYSTIVA#systiva#USERS
            if (!systivaItems || systivaItems.length === 0) {
                systivaItems = await DynamoDBOperations.queryItems(
                    this.tableName,
                    'PK = :pk AND begins_with(SK, :sk)',
                    {
                        ':pk': 'SYSTIVA#systiva#USERS',
                        ':sk': 'USER#',
                    },
                );
            }

            console.log(`Found ${systivaItems.length} users in Systiva table`);

            // Find user by email (case-insensitive)
            let userItem = systivaItems.find(
                (item) =>
                    item.email_address?.toLowerCase() === email.toLowerCase(),
            );

            // If not found in Systiva table, search in account-specific tables
            if (!userItem) {
                console.log(
                    'User not found in Systiva table, searching account tables...',
                );
                // Get all accounts and search their user tables
                const allUsers = await this.listAllUsers();
                userItem = allUsers.find(
                    (item: any) =>
                        item.email_address?.toLowerCase() ===
                        email.toLowerCase(),
                );
            }

            if (!userItem) {
                console.log('❌ User not found');
                return null;
            }

            console.log(
                `✅ Found user: ${userItem.first_name} ${userItem.last_name}`,
            );

            // Handle password verification
            let passwordHash: string | null = null;
            let isPlainTextPassword = false;

            // Check for encrypted password (new format)
            if (
                userItem.password_encrypted &&
                isValidEncryptedPassword(userItem.password_encrypted)
            ) {
                try {
                    const decrypted = decryptPassword(
                        userItem.password_encrypted,
                    );
                    const decryptedPassword = decrypted.password;

                    // Check if decrypted value is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
                    const isBcryptHash = /^\$2[ayb]\$.{56}$/.test(
                        decryptedPassword,
                    );

                    if (isBcryptHash) {
                        // New format: encrypted bcrypt hash
                        passwordHash = decryptedPassword;
                    } else {
                        // Legacy format: encrypted plain text password
                        // We'll do direct comparison and then upgrade to bcrypt hash
                        isPlainTextPassword = true;
                        passwordHash = decryptedPassword;
                    }
                    logPasswordOperation('decrypt', userItem.id, true);
                } catch (error) {
                    console.error(
                        `❌ Failed to decrypt password for user ${userItem.id}:`,
                        error,
                    );
                    logPasswordOperation('decrypt', userItem.id, false);
                    return null;
                }
            } else if (userItem.password) {
                // Legacy bcrypt password (directly stored, not encrypted)
                passwordHash = userItem.password;
            } else {
                console.log('❌ No password set for user');
                return null;
            }

            if (!passwordHash) {
                console.log('❌ No password hash available');
                return null;
            }

            // Verify password
            let isPasswordValid = false;

            if (isPlainTextPassword) {
                // Legacy format: direct string comparison
                isPasswordValid = password === passwordHash;

                // If password is valid, upgrade to bcrypt hash for future logins
                if (isPasswordValid) {
                    console.log(
                        '⚠️  Legacy password format detected. Upgrading to bcrypt hash...',
                    );
                    try {
                        const bcryptHash = await this.hashPassword(password);
                        const encryptedBcryptHash = encryptPassword(bcryptHash);

                        // Determine the PK and SK from the user item
                        const userPK =
                            userItem.PK ||
                            (userItem.account_name && userItem.account_id
                                ? `${userItem.account_name.toUpperCase()}#${
                                      userItem.account_id
                                  }#USERS`
                                : `SYSTIVA#systiva#USERS`);
                        const userSK = userItem.SK || `USER#${userItem.id}`;

                        // Update the user's password to the new format
                        await DynamoDBOperations.updateItem(
                            this.tableName,
                            {PK: userPK, SK: userSK},
                            'SET password_encrypted = :passwordEncrypted REMOVE password',
                            {':passwordEncrypted': encryptedBcryptHash},
                        );
                        console.log(
                            '✅ Password upgraded to bcrypt hash format',
                        );
                    } catch (upgradeError) {
                        console.error(
                            '⚠️  Failed to upgrade password format:',
                            upgradeError,
                        );
                        // Continue anyway since authentication succeeded
                    }
                }
            } else {
                // New format: use bcrypt comparison
                isPasswordValid = await this.comparePassword(
                    password,
                    passwordHash,
                );
            }

            if (!isPasswordValid) {
                console.log('❌ Invalid password');
                return null;
            }

            console.log('✅ Password verified');

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

    // Helper method to search all user tables
    private async listAllUsers(): Promise<any[]> {
        try {
            // Scan for all USER records across all partitions
            const allItems = await withDynamoDB(async (client) => {
                const {ScanCommand} = await import('@aws-sdk/lib-dynamodb');
                const response = await client.send(
                    new ScanCommand({
                        TableName: this.tableName,
                        FilterExpression:
                            'begins_with(SK, :sk) AND entity_type = :type',
                        ExpressionAttributeValues: {
                            ':sk': 'USER#',
                            ':type': 'USER',
                        },
                    }),
                );
                return response.Items || [];
            });

            console.log(
                `📋 Found ${allItems.length} total users across all tables`,
            );
            return allItems;
        } catch (error) {
            console.error('Error listing all users:', error);
            return [];
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

            // Handle password encryption
            // First hash with bcrypt, then encrypt the bcrypt hash (for authentication)
            // Also store plain text password encrypted with AES (for display purposes)
            let encryptedPasswordData: EncryptedPassword | undefined;
            let encryptedDisplayPassword: EncryptedPassword | undefined;
            if (userData.password) {
                try {
                    // Hash password with bcrypt first (for authentication)
                    const bcryptHash = await this.hashPassword(
                        userData.password,
                    );
                    // Then encrypt the bcrypt hash
                    encryptedPasswordData = encryptPassword(bcryptHash);

                    // Also encrypt the plain text password for display purposes (reversible)
                    encryptedDisplayPassword = encryptPassword(
                        userData.password,
                    );

                    logPasswordOperation('encrypt', userId, true);
                } catch (error) {
                    console.error(
                        `❌ Failed to encrypt password for user ${userId}:`,
                        error,
                    );
                    logPasswordOperation('encrypt', userId, false);
                    throw new Error('Failed to encrypt password');
                }
            }

            const user: User = {
                id: userId,
                ...userData,
                assignedGroups: userData.assignedGroups || [],
                createdAt: now,
                updatedAt: now,
            };

            // New pattern: ACCOUNT#SYSTIVA for global users
            const item = {
                PK: 'ACCOUNT#SYSTIVA',
                SK: `USER#${userId}`,
                id: userId,
                account_id: 'systiva',
                account_name: 'SYSTIVA',
                first_name: user.firstName,
                middle_name: user.middleName,
                last_name: user.lastName,
                email_address: user.emailAddress,
                status: user.status,
                start_date: user.startDate,
                end_date: user.endDate,
                password_encrypted: encryptedPasswordData, // Store encrypted password (for authentication)
                password_display_encrypted: encryptedDisplayPassword, // Store display password (for display)
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

            // Return user with decrypted password for frontend
            return user;
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async createUserInAccountTable(
        userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'> & {
            enterpriseId?: string;
            enterpriseName?: string;
        },
        accountId: string,
        accountName?: string, // Optional - stored for reference but not required
    ): Promise<User> {
        try {
            const userId = uuidv4();
            const now = new Date().toISOString();

            // Handle password encryption using AES (same as Systiva users)
            // First hash with bcrypt, then encrypt the bcrypt hash (for authentication)
            // Also store plain text password encrypted with AES (for display purposes)
            let encryptedPasswordData: EncryptedPassword | undefined;
            let encryptedDisplayPassword: EncryptedPassword | undefined;
            if (userData.password) {
                try {
                    // Hash password with bcrypt first (for authentication)
                    const bcryptHash = await this.hashPassword(
                        userData.password,
                    );
                    // Then encrypt the bcrypt hash
                    encryptedPasswordData = encryptPassword(bcryptHash);

                    // Also encrypt the plain text password for display purposes (reversible)
                    encryptedDisplayPassword = encryptPassword(
                        userData.password,
                    );

                    logPasswordOperation('encrypt', userId, true);
                } catch (error) {
                    console.error(
                        `❌ Failed to encrypt password for user ${userId}:`,
                        error,
                    );
                    logPasswordOperation('encrypt', userId, false);
                    throw new Error('Failed to encrypt password');
                }
            }

            const user: User = {
                id: userId,
                ...userData,
                assignedGroups: userData.assignedGroups || [],
                createdAt: now,
                updatedAt: now,
            };

            // Use account-specific PK format: ACCOUNT#<ACCOUNT_id>
            const accountPK = `ACCOUNT#${accountId}`;

            const item: any = {
                PK: accountPK,
                SK: `USER#${userId}`,
                id: userId,
                account_id: accountId,
                account_name: accountName || '', // Optional - stored for reference
                enterprise_id: userData.enterpriseId || '', // Store enterprise context
                enterprise_name: userData.enterpriseName || '', // Store enterprise context (optional)
                first_name: user.firstName,
                middle_name: user.middleName,
                last_name: user.lastName,
                email_address: user.emailAddress,
                status: user.status,
                start_date: user.startDate,
                end_date: user.endDate,
                password_encrypted: encryptedPasswordData, // Store encrypted password (for authentication)
                password_display_encrypted: encryptedDisplayPassword, // Store display password (for display)
                technical_user: user.technicalUser,
                assigned_groups: user.assignedGroups,
                created_date: now,
                updated_date: now,
                entity_type: 'USER',
            };

            console.log('💾 Creating user:', {
                account_id: accountId,
                enterprise_id: item.enterprise_id,
            });

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

            // Return user with decrypted password for frontend
            return user;
        } catch (error) {
            console.error('Error creating user in account table:', error);
            throw error;
        }
    }

    async listUsersByAccount(
        accountId: string,
        accountName?: string, // Optional - not used for query, only for logging
        enterpriseId?: string,
        enterpriseName?: string, // Optional - not used for query, only for logging
    ): Promise<User[]> {
        try {
            // PK pattern: ACCOUNT#<ACCOUNT_id>
            const accountPK = `ACCOUNT#${accountId}`;

            console.log('📋 Querying DynamoDB for account-specific users:', {
                accountId,
                enterpriseId,
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
                        enterprise_name: item.enterprise_name,
                    })),
                );
            }

            // Filter by enterprise if specified (same logic as groups)
            let filteredItems = items;
            if (enterpriseId && enterpriseName) {
                console.log(
                    `📋 🔍 Filtering by enterprise: ${enterpriseName} (${enterpriseId})`,
                );
                filteredItems = items.filter((item) => {
                    const matchesEnterprise =
                        item.enterprise_id === enterpriseId;
                    if (!matchesEnterprise) {
                        console.log(
                            `📋 ❌ Filtered out user ${item.id} (enterprise_id: ${item.enterprise_id} !== ${enterpriseId})`,
                        );
                    }
                    return matchesEnterprise;
                });
                console.log(
                    `📋 ✅ After enterprise filter: ${filteredItems.length} users`,
                );
            }

            return filteredItems.map((item) => {
                // Handle password decryption - prioritize display password (reversible)
                let decryptedPassword: string | undefined;

                // First, try to decrypt display password (plain text encrypted with AES)
                if (
                    item.password_display_encrypted &&
                    isValidEncryptedPassword(item.password_display_encrypted)
                ) {
                    try {
                        const decrypted = decryptPassword(
                            item.password_display_encrypted,
                        );
                        decryptedPassword = decrypted.password;
                        console.log(
                            `✅ Decrypted display password for user ${item.id}`,
                        );
                    } catch (error) {
                        console.error(
                            `❌ Failed to decrypt display password for user ${item.id}:`,
                            error,
                        );
                    }
                }

                // If display password not available, try legacy password_encrypted
                if (
                    !decryptedPassword &&
                    item.password_encrypted &&
                    isValidEncryptedPassword(item.password_encrypted)
                ) {
                    try {
                        const decrypted = decryptPassword(
                            item.password_encrypted,
                        );
                        const decryptedValue = decrypted.password;

                        // Check if decrypted value is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
                        const isBcryptHash = /^\$2[ayb]\$.{56}$/.test(
                            decryptedValue,
                        );

                        if (isBcryptHash) {
                            // New format: encrypted bcrypt hash - cannot decrypt to plain text
                            // Return undefined as we cannot show plain text from bcrypt hash
                            decryptedPassword = undefined;
                            console.log(
                                `⚠️  Password for user ${item.id} is stored as bcrypt hash - cannot display plain text`,
                            );
                        } else {
                            // Legacy format: encrypted plain text password - return the plain text
                            decryptedPassword = decryptedValue;
                        }
                        logPasswordOperation(
                            'decrypt',
                            item.id || 'unknown',
                            true,
                        );
                    } catch (error) {
                        console.error(
                            `❌ Failed to decrypt password for user ${item.id}:`,
                            error,
                        );
                        logPasswordOperation(
                            'decrypt',
                            item.id || 'unknown',
                            false,
                        );
                        decryptedPassword = undefined; // Don't expose broken encrypted data
                    }
                } else if (item.password) {
                    // Legacy bcrypt password stored directly - cannot decrypt bcrypt
                    decryptedPassword = undefined;
                }

                return {
                    id: item.id,
                    firstName: item.first_name,
                    middleName: item.middle_name,
                    lastName: item.last_name,
                    emailAddress: item.email_address,
                    status: item.status,
                    startDate: item.start_date,
                    endDate: item.end_date,
                    password: decryptedPassword,
                    technicalUser: item.technical_user,
                    assignedGroups: item.assigned_groups || [],
                    // Include account and enterprise context in response
                    accountId: item.account_id,
                    accountName: item.account_name,
                    enterpriseId: item.enterprise_id,
                    enterpriseName: item.enterprise_name,
                    createdAt: item.created_date || item.createdAt,
                    updatedAt: item.updated_date || item.updatedAt,
                };
            });
        } catch (error) {
            console.error('Error listing users by account:', error);
            throw error;
        }
    }

    async getUser(userId: string): Promise<User | null> {
        try {
            // Try new pattern first: ACCOUNT#SYSTIVA
            let item = await DynamoDBOperations.getItem(this.tableName, {
                PK: 'ACCOUNT#SYSTIVA',
                SK: `USER#${userId}`,
            });
            // Fallback to old pattern
            if (!item) {
                item = await DynamoDBOperations.getItem(this.tableName, {
                    PK: 'SYSTIVA#systiva#USERS',
                    SK: `USER#${userId}`,
                });
            }

            if (!item) {
                return null;
            }

            // Handle password decryption - prioritize display password (reversible)
            let decryptedPassword: string | undefined;

            // First, try to decrypt display password (plain text encrypted with AES)
            if (
                item.password_display_encrypted &&
                isValidEncryptedPassword(item.password_display_encrypted)
            ) {
                try {
                    const decrypted = decryptPassword(
                        item.password_display_encrypted,
                    );
                    decryptedPassword = decrypted.password;
                    console.log(
                        `✅ Decrypted display password for user ${userId}`,
                    );
                } catch (error) {
                    console.error(
                        `❌ Failed to decrypt display password for user ${userId}:`,
                        error,
                    );
                }
            }

            // If display password not available, try legacy password_encrypted
            if (
                !decryptedPassword &&
                item.password_encrypted &&
                isValidEncryptedPassword(item.password_encrypted)
            ) {
                try {
                    const decrypted = decryptPassword(item.password_encrypted);
                    const decryptedValue = decrypted.password;

                    // Check if decrypted value is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
                    const isBcryptHash = /^\$2[ayb]\$.{56}$/.test(
                        decryptedValue,
                    );

                    if (isBcryptHash) {
                        // New format: encrypted bcrypt hash - cannot decrypt to plain text
                        // Return undefined as we cannot show plain text from bcrypt hash
                        decryptedPassword = undefined;
                        console.log(
                            `⚠️  Password for user ${userId} is stored as bcrypt hash - cannot display plain text`,
                        );
                    } else {
                        // Legacy format: encrypted plain text password - return the plain text
                        decryptedPassword = decryptedValue;
                    }
                    logPasswordOperation('decrypt', userId, true);
                } catch (error) {
                    console.error(
                        `❌ Failed to decrypt password for user ${userId}:`,
                        error,
                    );
                    logPasswordOperation('decrypt', userId, false);
                    decryptedPassword = undefined;
                }
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
                password: decryptedPassword,
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

            // Query for Systiva users using new pattern first, then fallback
            const newSystivaPK = 'ACCOUNT#SYSTIVA';
            let items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {':pk': newSystivaPK, ':sk': 'USER#'},
            );
            // Fallback to old pattern
            if (!items || items.length === 0) {
                items = await DynamoDBOperations.queryItems(
                    this.tableName,
                    'PK = :pk AND begins_with(SK, :sk)',
                    {':pk': 'SYSTIVA#systiva#USERS', ':sk': 'USER#'},
                );
            }
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
                .map((item) => {
                    // Handle password decryption - prioritize display password (reversible)
                    let decryptedPassword: string | undefined;

                    // First, try to decrypt display password (plain text encrypted with AES)
                    if (
                        item.password_display_encrypted &&
                        isValidEncryptedPassword(
                            item.password_display_encrypted,
                        )
                    ) {
                        try {
                            const decrypted = decryptPassword(
                                item.password_display_encrypted,
                            );
                            decryptedPassword = decrypted.password;
                            console.log(
                                `✅ Decrypted display password for user ${
                                    item.id || 'unknown'
                                }`,
                            );
                        } catch (error) {
                            console.error(
                                `❌ Failed to decrypt display password for user ${
                                    item.id || 'unknown'
                                }:`,
                                error,
                            );
                        }
                    }

                    // If display password not available, try legacy password_encrypted
                    if (
                        !decryptedPassword &&
                        item.password_encrypted &&
                        isValidEncryptedPassword(item.password_encrypted)
                    ) {
                        try {
                            const decrypted = decryptPassword(
                                item.password_encrypted,
                            );
                            const decryptedValue = decrypted.password;

                            // Check if decrypted value is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
                            const isBcryptHash = /^\$2[ayb]\$.{56}$/.test(
                                decryptedValue,
                            );

                            if (isBcryptHash) {
                                // New format: encrypted bcrypt hash - cannot decrypt to plain text
                                // Return undefined as we cannot show plain text from bcrypt hash
                                decryptedPassword = undefined;
                                console.log(
                                    `⚠️  Password for user ${
                                        item.id || 'unknown'
                                    } is stored as bcrypt hash - cannot display plain text`,
                                );
                            } else {
                                // Legacy format: encrypted plain text password - return the plain text
                                decryptedPassword = decryptedValue;
                            }
                            logPasswordOperation(
                                'decrypt',
                                item.id || 'unknown',
                                true,
                            );
                        } catch (error) {
                            console.error(
                                `❌ Failed to decrypt password for user ${
                                    item.id || 'unknown'
                                }:`,
                                error,
                            );
                            logPasswordOperation(
                                'decrypt',
                                item.id || 'unknown',
                                false,
                            );
                            decryptedPassword = undefined; // Don't expose broken encrypted data
                        }
                    } else if (item.password) {
                        // Legacy bcrypt password stored directly - cannot decrypt bcrypt
                        decryptedPassword = undefined;
                    }

                    return {
                        id: item.id || item.PK?.replace('SYSTIVA#', ''),
                        firstName: item.first_name,
                        middleName: item.middle_name,
                        lastName: item.last_name,
                        emailAddress: item.email_address,
                        status: item.status,
                        startDate: item.start_date,
                        endDate: item.end_date,
                        password: decryptedPassword,
                        technicalUser: item.technical_user,
                        assignedGroups: item.assigned_groups || [],
                        // Include account and enterprise context in response
                        accountId: item.account_id,
                        accountName: item.account_name,
                        enterpriseId: item.enterprise_id,
                        enterpriseName: item.enterprise_name,
                        createdAt: item.created_date || item.createdAt,
                        updatedAt: item.updated_date || item.updatedAt,
                    };
                })
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
                // Handle password encryption
                // First hash with bcrypt, then encrypt the bcrypt hash (for authentication)
                let encryptedPasswordData: EncryptedPassword | undefined;
                // Also store plain text password encrypted with AES (for display purposes)
                let encryptedDisplayPassword: EncryptedPassword | undefined;
                try {
                    // Hash password with bcrypt first (for authentication)
                    const bcryptHash = await this.hashPassword(
                        updates.password,
                    );
                    // Then encrypt the bcrypt hash
                    encryptedPasswordData = encryptPassword(bcryptHash);

                    // Also encrypt the plain text password for display purposes (reversible)
                    encryptedDisplayPassword = encryptPassword(
                        updates.password,
                    );

                    logPasswordOperation('encrypt', userId, true);
                } catch (error) {
                    console.error(
                        `❌ Failed to encrypt password for user ${userId}:`,
                        error,
                    );
                    logPasswordOperation('encrypt', userId, false);
                    throw new Error('Failed to encrypt password');
                }

                updateFields.push('password_encrypted = :passwordEncrypted');
                expressionAttributeValues[':passwordEncrypted'] =
                    encryptedPasswordData;

                // Store display password (plain text encrypted with AES, reversible)
                updateFields.push(
                    'password_display_encrypted = :passwordDisplayEncrypted',
                );
                expressionAttributeValues[':passwordDisplayEncrypted'] =
                    encryptedDisplayPassword;

                // Remove old bcrypt password field if it exists
                updateFields.push('password = :passwordRemove');
                expressionAttributeValues[':passwordRemove'] = null;
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
                            PK: 'ACCOUNT#SYSTIVA',
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

            // Handle password for response
            // If password was provided in updates, return it (user just entered it)
            // Otherwise, try to decrypt stored display password or legacy password
            let decryptedPassword: string | undefined;
            if (updates.password !== undefined) {
                // Password was just updated - return the plain text password from the request
                decryptedPassword = updates.password;
                console.log(
                    `✅ Returning plain text password from update request for user ${userId}`,
                );
            } else {
                // Password was not updated, try to decrypt stored display password first
                if (
                    result.password_display_encrypted &&
                    isValidEncryptedPassword(result.password_display_encrypted)
                ) {
                    try {
                        const decrypted = decryptPassword(
                            result.password_display_encrypted,
                        );
                        decryptedPassword = decrypted.password;
                        console.log(
                            `✅ Decrypted display password for user ${userId}`,
                        );
                    } catch (error) {
                        console.error(
                            `❌ Failed to decrypt display password for user ${userId}:`,
                            error,
                        );
                    }
                }

                // If display password not available, try legacy password_encrypted
                if (
                    !decryptedPassword &&
                    result.password_encrypted &&
                    isValidEncryptedPassword(result.password_encrypted)
                ) {
                    try {
                        const decrypted = decryptPassword(
                            result.password_encrypted,
                        );
                        const decryptedValue = decrypted.password;

                        // Check if decrypted value is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
                        const isBcryptHash = /^\$2[ayb]\$.{56}$/.test(
                            decryptedValue,
                        );

                        if (isBcryptHash) {
                            // New format: encrypted bcrypt hash - cannot decrypt to plain text
                            // Return undefined as we cannot show plain text from bcrypt hash
                            decryptedPassword = undefined;
                            console.log(
                                `⚠️  Password for user ${userId} is stored as bcrypt hash - cannot display plain text`,
                            );
                        } else {
                            // Legacy format: encrypted plain text password - return the plain text
                            decryptedPassword = decryptedValue;
                        }
                        logPasswordOperation('decrypt', userId, true);
                    } catch (error) {
                        console.error(
                            `❌ Failed to decrypt password for user ${userId}:`,
                            error,
                        );
                        logPasswordOperation('decrypt', userId, false);
                        decryptedPassword = undefined;
                    }
                }
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
                password: decryptedPassword,
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
        updates: Partial<User> & {
            enterpriseId?: string;
            enterpriseName?: string;
        },
        accountId: string,
        accountName: string,
    ): Promise<User | null> {
        try {
            const now = new Date().toISOString();
            // PK pattern: ACCOUNT#<ACCOUNT_id>
            const accountPK = `ACCOUNT#${accountId}`;

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
                // Handle password encryption using AES (same as Systiva users)
                // First hash with bcrypt, then encrypt the bcrypt hash (for authentication)
                let encryptedPasswordData: EncryptedPassword | undefined;
                // Also store plain text password encrypted with AES (for display purposes)
                let encryptedDisplayPassword: EncryptedPassword | undefined;
                try {
                    // Hash password with bcrypt first (for authentication)
                    const bcryptHash = await this.hashPassword(
                        updates.password,
                    );
                    // Then encrypt the bcrypt hash
                    encryptedPasswordData = encryptPassword(bcryptHash);

                    // Also encrypt the plain text password for display purposes (reversible)
                    encryptedDisplayPassword = encryptPassword(
                        updates.password,
                    );

                    logPasswordOperation('encrypt', userId, true);
                } catch (error) {
                    console.error(
                        `❌ Failed to encrypt password for user ${userId}:`,
                        error,
                    );
                    logPasswordOperation('encrypt', userId, false);
                    throw new Error('Failed to encrypt password');
                }

                updateFields.push('password_encrypted = :passwordEncrypted');
                expressionAttributeValues[':passwordEncrypted'] =
                    encryptedPasswordData;

                // Store display password (plain text encrypted with AES, reversible)
                updateFields.push(
                    'password_display_encrypted = :passwordDisplayEncrypted',
                );
                expressionAttributeValues[':passwordDisplayEncrypted'] =
                    encryptedDisplayPassword;

                // Remove old bcrypt password field if it exists
                updateFields.push('#password = :passwordRemove');
                expressionAttributeNames['#password'] = 'password';
                expressionAttributeValues[':passwordRemove'] = null;
            }

            // Update enterprise fields if provided
            if (updates.enterpriseId !== undefined) {
                updateFields.push('enterprise_id = :enterpriseId');
                expressionAttributeValues[':enterpriseId'] =
                    updates.enterpriseId;
            }
            if (updates.enterpriseName !== undefined) {
                updateFields.push('enterprise_name = :enterpriseName');
                expressionAttributeValues[':enterpriseName'] =
                    updates.enterpriseName;
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

            // Handle password for response
            // If password was provided in updates, return it (user just entered it)
            // Otherwise, try to decrypt stored display password or legacy password
            let decryptedPassword: string | undefined;
            if (updates.password !== undefined) {
                // Password was just updated - return the plain text password from the request
                decryptedPassword = updates.password;
                console.log(
                    `✅ Returning plain text password from update request for user ${userId}`,
                );
            } else {
                // Password was not updated, try to decrypt stored display password first
                if (
                    result.password_display_encrypted &&
                    isValidEncryptedPassword(result.password_display_encrypted)
                ) {
                    try {
                        const decrypted = decryptPassword(
                            result.password_display_encrypted,
                        );
                        decryptedPassword = decrypted.password;
                        console.log(
                            `✅ Decrypted display password for user ${userId}`,
                        );
                    } catch (error) {
                        console.error(
                            `❌ Failed to decrypt display password for user ${userId}:`,
                            error,
                        );
                    }
                }

                // If display password not available, try legacy password_encrypted
                if (
                    !decryptedPassword &&
                    result.password_encrypted &&
                    isValidEncryptedPassword(result.password_encrypted)
                ) {
                    try {
                        const decrypted = decryptPassword(
                            result.password_encrypted,
                        );
                        const decryptedValue = decrypted.password;

                        // Check if decrypted value is a bcrypt hash (starts with $2a$, $2b$, or $2y$)
                        const isBcryptHash = /^\$2[ayb]\$.{56}$/.test(
                            decryptedValue,
                        );

                        if (isBcryptHash) {
                            // New format: encrypted bcrypt hash - cannot decrypt to plain text
                            // Return undefined as we cannot show plain text from bcrypt hash
                            decryptedPassword = undefined;
                            console.log(
                                `⚠️  Password for user ${userId} is stored as bcrypt hash - cannot display plain text`,
                            );
                        } else {
                            // Legacy format: encrypted plain text password - return the plain text
                            decryptedPassword = decryptedValue;
                        }
                        logPasswordOperation('decrypt', userId, true);
                    } catch (error) {
                        console.error(
                            `❌ Failed to decrypt password for user ${userId}:`,
                            error,
                        );
                        logPasswordOperation('decrypt', userId, false);
                        decryptedPassword = undefined;
                    }
                }
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
                password: decryptedPassword,
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

            // Delete from both new and old patterns
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: 'ACCOUNT#SYSTIVA',
                SK: `USER#${userId}`,
            }).catch(() => {});
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: 'SYSTIVA#systiva#USERS',
                SK: `USER#${userId}`,
            }).catch(() => {});

            console.log(`✅ User ${userId} deleted successfully from DynamoDB`);
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
            // PK pattern: ACCOUNT#<ACCOUNT_id>
            const accountPK = `ACCOUNT#${accountId}`;

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
            selectedAccountName?: string; // Optional - not required
            selectedEnterpriseId?: string;
            selectedEnterpriseName?: string; // Optional - not required
            id?: string;
        },
    ): Promise<Group> {
        try {
            const groupId = groupData.id || uuidv4();
            const now = new Date().toISOString();

            // Determine if this is for a specific account or Systiva (only accountId required)
            const isAccountSpecific = !!groupData.selectedAccountId;

            // Use PK pattern: ACCOUNT#<ACCOUNT_id>
            const accountPK = isAccountSpecific
                ? `ACCOUNT#${groupData.selectedAccountId}`
                : `ACCOUNT#SYSTIVA`;

            const group: Group = {
                id: groupId,
                name: groupData.name,
                description: groupData.description,
                entity: groupData.entity || '',
                product: groupData.product || '',
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
                enterprise_id: groupData.selectedEnterpriseId || 'systiva',
                enterprise_name: groupData.selectedEnterpriseName || 'SYSTIVA',
                group_name: group.name,
                description: group.description,
                entity: group.entity || '',
                product: group.product || '',
                service: group.service || '',
                assigned_roles: group.assignedRoles,
                created_date: now,
                updated_date: now,
                entity_type: 'GROUP',
            };

            // Add account and enterprise fields if account-specific
            if (isAccountSpecific) {
                item.account_id = groupData.selectedAccountId;
                item.account_name = groupData.selectedAccountName;
                item.enterprise_id =
                    groupData.selectedEnterpriseId || 'systiva';
                item.enterprise_name =
                    groupData.selectedEnterpriseName || 'SYSTIVA';
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

    async getGroup(
        groupId: string,
        accountId?: string,
        accountName?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<Group | null> {
        try {
            // Determine PK based on account context (only accountId required)
            const isAccountSpecific = !!accountId;
            // PK pattern: ACCOUNT#<ACCOUNT_id>
            const pkPrefix = isAccountSpecific
                ? `ACCOUNT#${accountId}`
                : 'ACCOUNT#SYSTIVA';
            // Legacy fallback patterns
            const legacyPkPrefix = isAccountSpecific
                ? `${
                      accountName?.toUpperCase() || accountId
                  }#${accountId}#GROUPS`
                : 'SYSTIVA#systiva#GROUPS';

            console.log(
                `🔍 Getting group ${groupId} from partition: ${pkPrefix} (fallback: ${legacyPkPrefix})`,
            );

            // Try new format first: ACCOUNT#<ACCOUNT_id>
            let item = await DynamoDBOperations.getItem(this.tableName, {
                PK: pkPrefix,
                SK: `GROUP#${groupId}`,
            });

            // Fallback to legacy format
            if (!item) {
                item = await DynamoDBOperations.getItem(this.tableName, {
                    PK: legacyPkPrefix,
                    SK: `GROUP#${groupId}`,
                });
            }

            if (!item) {
                console.log(
                    `⚠️  Group ${groupId} not found in ${pkPrefix} or ${legacyPkPrefix}`,
                );
                return null;
            }

            return {
                id: item.id || groupId,
                name: item.group_name || item.name,
                description: item.description,
                entity: item.entity || '',
                product: item.product || '',
                service: item.service || '',
                assignedRoles: item.assigned_roles || [],
                enterpriseId: item.enterprise_id,
                enterpriseName: item.enterprise_name,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('Error getting group:', error);
            throw error;
        }
    }

    async debugListAllGroups(): Promise<any> {
        try {
            const allItems = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {':type': 'GROUP'},
            );
            return {
                total: allItems.length,
                groups: allItems.map((item) => ({
                    PK: item.PK,
                    SK: item.SK,
                    id: item.id,
                    group_name: item.group_name,
                    account_id: item.account_id,
                    account_name: item.account_name,
                    enterprise_id: item.enterprise_id,
                    enterprise_name: item.enterprise_name,
                })),
            };
        } catch (error) {
            console.error('Error in debugListAllGroups:', error);
            throw error;
        }
    }

    async debugDeleteAllGroups(): Promise<any> {
        try {
            const allItems = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {':type': 'GROUP'},
            );

            console.log(
                `🗑️  Deleting all ${allItems.length} groups from database...`,
            );

            for (const item of allItems) {
                console.log(
                    `🗑️  Deleting group: ${item.id} (${
                        item.group_name || 'unnamed'
                    }) from ${item.PK}`,
                );
                await DynamoDBOperations.deleteItem(this.tableName, {
                    PK: item.PK,
                    SK: item.SK,
                });
            }

            console.log(`✅ Successfully deleted ${allItems.length} groups`);
            return {
                success: true,
                deletedCount: allItems.length,
                message: `Deleted ${allItems.length} groups from database`,
            };
        } catch (error) {
            console.error('Error in debugDeleteAllGroups:', error);
            throw error;
        }
    }

    async debugClearAllUserGroupAssignments(): Promise<any> {
        try {
            // Delete all user-group assignment lookup records
            const assignmentItems = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {':type': 'user_group_assignment'},
            );

            console.log(
                `🗑️  Deleting ${assignmentItems.length} user-group assignment records...`,
            );

            for (const item of assignmentItems) {
                await DynamoDBOperations.deleteItem(this.tableName, {
                    PK: item.PK,
                    SK: item.SK,
                });
            }

            // Clear assigned_groups field from all users
            const allUsers = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {':type': 'USER'},
            );

            console.log(`🔄 Found ${allUsers.length} users in database`);
            let clearedCount = 0;

            for (const user of allUsers) {
                console.log(
                    `👤 User ${user.id} (${user.first_name} ${user.last_name}):`,
                    {
                        PK: user.PK,
                        SK: user.SK,
                        assigned_groups: user.assigned_groups,
                        hasGroups: !!(
                            user.assigned_groups &&
                            user.assigned_groups.length > 0
                        ),
                    },
                );

                if (user.assigned_groups && user.assigned_groups.length > 0) {
                    console.log(
                        `🔄 Clearing ${user.assigned_groups.length} groups from user ${user.id}`,
                    );
                    await DynamoDBOperations.updateItem(
                        this.tableName,
                        {PK: user.PK, SK: user.SK},
                        'SET assigned_groups = :empty',
                        {':empty': []},
                    );
                    clearedCount++;
                    console.log(`✅ Cleared groups from user ${user.id}`);
                }
            }

            console.log(`✅ Successfully cleared all user-group assignments`);
            return {
                success: true,
                deletedAssignments: assignmentItems.length,
                clearedUsers: clearedCount,
                totalUsers: allUsers.length,
                message: `Deleted ${assignmentItems.length} assignment records and cleared assignments from ${clearedCount} users`,
            };
        } catch (error) {
            console.error('Error in debugClearAllUserGroupAssignments:', error);
            throw error;
        }
    }

    async listGroups(
        accountId?: string,
        accountName?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<Group[]> {
        try {
            console.log('📋 Scanning DynamoDB for groups with full context', {
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            });

            // Determine if we need to filter by account (only accountId required)
            const isAccountSpecific = !!accountId;

            let items: any[];
            if (isAccountSpecific) {
                // Query for account-specific groups using PK pattern: ACCOUNT#<ACCOUNT_id>
                const accountPK = `ACCOUNT#${accountId}`;
                console.log('📋 ================================');
                console.log('📋 Querying for account-specific groups');
                console.log('📋 Input Parameters:', {
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                });
                console.log('📋 Constructed PK:', accountPK);
                console.log('📋 SK prefix:', 'GROUP#');
                console.log('📋 ================================');

                items = await DynamoDBOperations.queryItems(
                    this.tableName,
                    'PK = :pk AND begins_with(SK, :sk)',
                    {
                        ':pk': accountPK,
                        ':sk': 'GROUP#',
                    },
                );

                console.log(
                    `📋 ⚡ Query returned ${items.length} items from DynamoDB`,
                );
                if (items.length > 0) {
                    console.log('📋 ✅ First item structure:', {
                        PK: items[0].PK,
                        SK: items[0].SK,
                        id: items[0].id,
                        group_name: items[0].group_name,
                        account_id: items[0].account_id,
                        account_name: items[0].account_name,
                    });
                } else {
                    console.log(
                        '📋 ❌ No items found - checking if data exists...',
                    );
                    // Do a broader scan to see what's actually in the table
                    const allItems = await DynamoDBOperations.scanItems(
                        this.tableName,
                        'entity_type = :type',
                        {':type': 'GROUP'},
                    );
                    console.log(
                        `📋 📊 Total groups in entire table: ${allItems.length}`,
                    );
                    if (allItems.length > 0) {
                        console.log(
                            '📋 Sample PKs in table:',
                            allItems.slice(0, 5).map((i) => ({
                                PK: i.PK,
                                SK: i.SK,
                                account_name: i.account_name,
                                account_id: i.account_id,
                            })),
                        );
                    }
                }
            } else {
                // Query for Systiva groups using new pattern first
                console.log('📋 Querying for Systiva groups');
                const newSystivaPK = 'ACCOUNT#SYSTIVA';
                items = await DynamoDBOperations.queryItems(
                    this.tableName,
                    'PK = :pk AND begins_with(SK, :sk)',
                    {':pk': newSystivaPK, ':sk': 'GROUP#'},
                );
                // Fallback to old pattern
                if (!items || items.length === 0) {
                    items = await DynamoDBOperations.queryItems(
                        this.tableName,
                        'PK = :pk AND begins_with(SK, :sk)',
                        {':pk': 'SYSTIVA#systiva#GROUPS', ':sk': 'GROUP#'},
                    );
                }
            }

            console.log(`📋 Found ${items.length} groups before filtering`);
            console.log('📋 Sample items:', items.slice(0, 2));

            // Filter by enterprise if specified
            let filteredItems = items;
            if (enterpriseId && enterpriseName) {
                console.log(
                    `📋 🔍 Filtering by enterprise: ${enterpriseName} (${enterpriseId})`,
                );
                filteredItems = items.filter((item) => {
                    const matchesEnterprise =
                        item.enterprise_id === enterpriseId;
                    if (!matchesEnterprise) {
                        console.log(
                            `📋 ❌ Filtered out group ${item.id} (enterprise_id: ${item.enterprise_id} !== ${enterpriseId})`,
                        );
                    }
                    return matchesEnterprise;
                });
                console.log(
                    `📋 ✅ After enterprise filter: ${filteredItems.length} groups`,
                );
            }

            const groups = filteredItems
                .map((item) => ({
                    id: item.id || item.PK?.split('#').pop(),
                    name: item.group_name || item.name,
                    description: item.description,
                    entity: item.entity || '',
                    product: item.product || '',
                    service: item.service || '',
                    assignedRoles: item.assigned_roles || [],
                    enterpriseId: item.enterprise_id,
                    enterpriseName: item.enterprise_name,
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
            selectedEnterpriseId?: string;
            selectedEnterpriseName?: string;
        },
    ): Promise<Group | null> {
        try {
            const now = new Date().toISOString();

            // Determine PK based on account context - PK pattern: ACCOUNT#<ACCOUNT_id>
            const isAccountSpecific =
                updates.selectedAccountId && updates.selectedAccountName;
            const pkPrefix = isAccountSpecific
                ? `ACCOUNT#${updates.selectedAccountId}`
                : 'ACCOUNT#SYSTIVA';

            console.log(
                `🔄 updateGroup: Updating group ${groupId} in partition ${pkPrefix}`,
            );
            console.log(`🔄 Update data:`, updates);

            // Get existing group with account context to find it in correct partition
            const existingGroup = await this.getGroup(
                groupId,
                updates.selectedAccountId,
                updates.selectedAccountName,
                updates.selectedEnterpriseId,
                updates.selectedEnterpriseName,
            );
            if (!existingGroup) {
                console.log(
                    `❌ Group ${groupId} not found in partition ${pkPrefix}`,
                );
                return null;
            }

            console.log(`✅ Found existing group:`, existingGroup);

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
            if (updates.product !== undefined) {
                updateFields.push('product = :product');
                expressionAttributeValues[':product'] = updates.product;
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

            // Update enterprise fields if provided
            if (updates.selectedEnterpriseId !== undefined) {
                updateFields.push('enterprise_id = :enterpriseId');
                expressionAttributeValues[':enterpriseId'] =
                    updates.selectedEnterpriseId;
            }
            if (updates.selectedEnterpriseName !== undefined) {
                updateFields.push('enterprise_name = :enterpriseName');
                expressionAttributeValues[':enterpriseName'] =
                    updates.selectedEnterpriseName;
            }

            // Always ensure entity_type is set (for legacy records that might be missing it)
            updateFields.push('entity_type = :entityType');
            expressionAttributeValues[':entityType'] = 'GROUP';

            updateFields.push('updated_date = :updated');
            updateFields.push('updatedAt = :updated');

            const updateExpression = `SET ${updateFields.join(', ')}`;

            const result = await withDynamoDB(async (client) => {
                const {UpdateCommand} = await import('@aws-sdk/lib-dynamodb');
                const response = await client.send(
                    new UpdateCommand({
                        TableName: this.tableName,
                        Key: {
                            PK: pkPrefix,
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
                product: result.product || '',
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

    async deleteGroup(
        groupId: string,
        accountId?: string,
        accountName?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<void> {
        try {
            console.log(`🗑️  Deleting group ${groupId} with context:`, {
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            });

            // Determine PK based on account context (only accountId required)
            const isAccountSpecific = !!accountId;
            // PK pattern: ACCOUNT#<ACCOUNT_id>
            const pkPrefix = isAccountSpecific
                ? `ACCOUNT#${accountId}`
                : 'ACCOUNT#SYSTIVA';
            const legacyPkPrefix = isAccountSpecific
                ? `${
                      accountName?.toUpperCase() || accountId
                  }#${accountId}#GROUPS`
                : 'SYSTIVA#systiva#GROUPS';

            console.log(
                `🗑️  Deleting from partition: ${pkPrefix} (also trying: ${legacyPkPrefix})`,
            );

            // Get group to find assigned roles for cleanup
            const group = await this.getGroup(
                groupId,
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            );
            if (!group) {
                console.log(
                    `⚠️  Group ${groupId} not found in ${pkPrefix} or ${legacyPkPrefix}`,
                );
                return; // Group doesn't exist, nothing to delete
            }

            // Delete all group-role lookup records
            if (group.assignedRoles) {
                for (const roleId of group.assignedRoles) {
                    await this.deleteGroupRoleLookup(groupId, roleId);
                }
            }

            // Delete all user-group lookups for this group
            await this.deleteAllUserGroupLookupsForGroup(groupId);

            // Delete the group from both partitions (new and legacy)
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: pkPrefix,
                SK: `GROUP#${groupId}`,
            }).catch(() => {});
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: legacyPkPrefix,
                SK: `GROUP#${groupId}`,
            }).catch(() => {});

            console.log(
                `✅ Successfully deleted group ${groupId} from ${pkPrefix} and ${legacyPkPrefix}`,
            );
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
            selectedAccountName?: string; // Optional - not required
            selectedEnterpriseId?: string;
            selectedEnterpriseName?: string; // Optional - not required
        },
    ): Promise<Role> {
        try {
            const roleId = uuidv4();
            const now = new Date().toISOString();

            console.log('📋 createRole called with roleData:', {
                name: roleData.name,
                selectedAccountId: roleData.selectedAccountId,
                selectedEnterpriseId: roleData.selectedEnterpriseId,
            });

            // Determine if this is for a specific account or Systiva (only accountId required)
            const isAccountSpecific = !!roleData.selectedAccountId;

            console.log('📋 isAccountSpecific check:', {
                isAccountSpecific,
                hasAccountId: !!roleData.selectedAccountId,
                hasEnterpriseId: !!roleData.selectedEnterpriseId,
            });

            // Use PK pattern: ACCOUNT#<ACCOUNT_id>
            const accountPK = isAccountSpecific
                ? `ACCOUNT#${roleData.selectedAccountId}`
                : `ACCOUNT#SYSTIVA`;

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
                enterprise_id: roleData.selectedEnterpriseId || '',
                enterprise_name: roleData.selectedEnterpriseName || '',
                role_name: role.name,
                description: role.description,
                entity: roleData.entity || '',
                product: roleData.product || '',
                service: roleData.service || '',
                scope_config: role.scopeConfig,
                created_date: now,
                updated_date: now,
                entity_type: 'ROLE',
            };

            console.log('📋 DynamoDB item to be created:', item);

            await DynamoDBOperations.putItem(this.tableName, item);

            console.log(
                `✅ Role created successfully with PK: ${accountPK}, Enterprise: ${roleData.selectedEnterpriseName}`,
            );

            return role;
        } catch (error) {
            console.error('Error creating role:', error);
            throw error;
        }
    }

    async getRole(
        roleId: string,
        accountId?: string,
        accountName?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<Role | null> {
        try {
            // Query listRoles with account/enterprise context and filter by ID
            const allRoles = await this.listRoles(
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            );
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

    async listRoles(
        accountId?: string,
        accountName?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<Role[]> {
        try {
            console.log('📋 Scanning DynamoDB for roles with full context', {
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            });

            // Determine if we need to filter by account (only accountId required)
            const isAccountSpecific = !!accountId;

            let items: any[];
            if (isAccountSpecific) {
                // Query for account-specific roles using PK pattern: ACCOUNT#<ACCOUNT_id>
                const accountPK = `ACCOUNT#${accountId}`;
                console.log('📋 ================================');
                console.log('📋 Querying for account-specific roles');
                console.log('📋 Input Parameters:', {
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                });
                console.log('📋 Constructed PK:', accountPK);
                console.log('📋 SK prefix:', 'ROLE#');
                console.log('📋 ================================');

                items = await DynamoDBOperations.queryItems(
                    this.tableName,
                    'PK = :pk AND begins_with(SK, :sk)',
                    {
                        ':pk': accountPK,
                        ':sk': 'ROLE#',
                    },
                );

                console.log(
                    `📋 ⚡ Query returned ${items.length} items from DynamoDB`,
                );
            } else {
                // Query for Systiva roles using new pattern first
                console.log('📋 Querying for Systiva roles');
                const newSystivaPK = 'ACCOUNT#SYSTIVA';
                items = await DynamoDBOperations.queryItems(
                    this.tableName,
                    'PK = :pk AND begins_with(SK, :sk)',
                    {':pk': newSystivaPK, ':sk': 'ROLE#'},
                );
                // Fallback to old pattern
                if (!items || items.length === 0) {
                    items = await DynamoDBOperations.queryItems(
                        this.tableName,
                        'PK = :pk AND begins_with(SK, :sk)',
                        {':pk': 'SYSTIVA#systiva#ROLES', ':sk': 'ROLE#'},
                    );
                }
            }

            console.log(`📋 Found ${items.length} roles before filtering`);

            // Filter by enterprise if specified
            let filteredItems = items;
            if (enterpriseId && enterpriseName) {
                console.log(
                    `📋 🔍 Filtering by enterprise: ${enterpriseName} (${enterpriseId})`,
                );
                filteredItems = items.filter((item) => {
                    const matchesEnterprise =
                        item.enterprise_id === enterpriseId;
                    if (!matchesEnterprise) {
                        console.log(
                            `📋 ❌ Filtered out role ${item.id} (enterprise_id: ${item.enterprise_id} !== ${enterpriseId})`,
                        );
                    }
                    return matchesEnterprise;
                });
                console.log(
                    `📋 ✅ After enterprise filter: ${filteredItems.length} roles`,
                );
            }

            const roles = filteredItems
                .map((item) => ({
                    id: item.id || item.PK?.split('#').pop(),
                    roleName: item.role_name || item.name,
                    name: item.role_name || item.name, // Keep for backwards compatibility
                    description: item.description,
                    entity: item.entity || '',
                    product: item.product || '',
                    service: item.service || '',
                    scopeConfig: item.scope_config,
                    enterpriseId: item.enterprise_id,
                    enterpriseName: item.enterprise_name,
                    createdAt: item.created_date || item.createdAt,
                    updatedAt: item.updated_date || item.updatedAt,
                }))
                .sort((a, b) => a.roleName.localeCompare(b.roleName));

            console.log(`📋 Returning ${roles.length} transformed roles`);
            return roles;
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
            // PK pattern: ACCOUNT#<ACCOUNT_id>
            const accountPK = `ACCOUNT#${accountId}`;

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
                entity: item.entity || '',
                product: item.product || '',
                service: item.service || '',
                scopeConfig: item.scope_config,
                enterpriseId: item.enterprise_id,
                enterpriseName: item.enterprise_name,
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
        updates: Partial<Role> & {
            selectedAccountId?: string;
            selectedAccountName?: string;
            selectedEnterpriseId?: string;
            selectedEnterpriseName?: string;
        },
    ): Promise<Role | null> {
        try {
            const now = new Date().toISOString();

            console.log(`🔄 updateRole: Updating role ${roleId}`);
            console.log(`🔄 Update data:`, updates);

            // Determine PK based on account context - PK pattern: ACCOUNT#<ACCOUNT_id>
            const isAccountSpecific =
                updates.selectedAccountId && updates.selectedAccountName;
            const pkPrefix = isAccountSpecific
                ? `ACCOUNT#${updates.selectedAccountId}`
                : 'ACCOUNT#SYSTIVA';

            console.log(`🔄 Using PK: ${pkPrefix}`);

            // Get existing role with account context to find it in correct partition
            const existingRole = await this.getRole(
                roleId,
                updates.selectedAccountId,
                updates.selectedAccountName,
                updates.selectedEnterpriseId,
                updates.selectedEnterpriseName,
            );
            if (!existingRole) {
                console.log(
                    `❌ Role ${roleId} not found in partition ${pkPrefix}`,
                );
                return null;
            }

            console.log(`✅ Found existing role:`, existingRole);

            // Find the PK by querying the database with correct partition
            const allRolesRaw = await withDynamoDB(async (client) => {
                const {QueryCommand} = await import('@aws-sdk/lib-dynamodb');

                const response = await client.send(
                    new QueryCommand({
                        TableName: this.tableName,
                        KeyConditionExpression:
                            'PK = :pk AND begins_with(SK, :skPrefix)',
                        ExpressionAttributeValues: {
                            ':pk': pkPrefix,
                            ':skPrefix': 'ROLE#',
                        },
                    }),
                );

                return response.Items || [];
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
            if (updates.entity !== undefined) {
                updateFields.push('entity = :entity');
                expressionAttributeValues[':entity'] = updates.entity;
            }
            if (updates.product !== undefined) {
                updateFields.push('product = :product');
                expressionAttributeValues[':product'] = updates.product;
            }
            if (updates.service !== undefined) {
                updateFields.push('#service = :service');
                expressionAttributeNames['#service'] = 'service';
                expressionAttributeValues[':service'] = updates.service;
            }
            if (updates.scopeConfig !== undefined) {
                updateFields.push('scope_config = :scopeConfig');
                expressionAttributeValues[':scopeConfig'] = updates.scopeConfig;
            }
            if (updates.selectedEnterpriseId !== undefined) {
                updateFields.push('enterprise_id = :enterpriseId');
                expressionAttributeValues[':enterpriseId'] =
                    updates.selectedEnterpriseId;
            }
            if (updates.selectedEnterpriseName !== undefined) {
                updateFields.push('enterprise_name = :enterpriseName');
                expressionAttributeValues[':enterpriseName'] =
                    updates.selectedEnterpriseName;
            }

            // Always ensure entity_type is set (for legacy records that might be missing it)
            updateFields.push('entity_type = :entityType');
            expressionAttributeValues[':entityType'] = 'ROLE';

            updateFields.push('updated_date = :updated');
            updateFields.push('updatedAt = :updated');

            const updateExpression = `SET ${updateFields.join(', ')}`;

            console.log('🔄 Update expression:', updateExpression);

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

            console.log('✅ Role updated successfully:', result);

            return {
                id: result.id || roleId,
                name: result.role_name || result.name,
                roleName: result.role_name || result.name,
                description: result.description,
                entity: result.entity,
                product: result.product,
                service: result.service,
                scopeConfig: result.scope_config,
                enterpriseId: result.enterprise_id,
                enterpriseName: result.enterprise_name,
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('Error updating role:', error);
            throw error;
        }
    }

    async deleteRole(
        roleId: string,
        accountId?: string,
        accountName?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<void> {
        try {
            console.log(`🗑️  deleteRole called for ${roleId} with context:`, {
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            });

            // Delete all group-role lookups for this role
            await this.deleteAllGroupRoleLookupsForRole(roleId);

            // Determine the correct PK based on account context (only accountId required)
            const isAccountSpecific = !!accountId;
            // PK pattern: ACCOUNT#<ACCOUNT_id>
            const pkPrefix = isAccountSpecific
                ? `ACCOUNT#${accountId}`
                : 'ACCOUNT#SYSTIVA';
            const legacyPkPrefix = isAccountSpecific
                ? `${
                      accountName?.toUpperCase() || accountId
                  }#${accountId}#ROLES`
                : 'SYSTIVA#systiva#ROLES';

            // Find the correct PK for this role - try both patterns
            const allRolesRaw = await withDynamoDB(async (client) => {
                const {QueryCommand} = await import('@aws-sdk/lib-dynamodb');

                // Query with new pattern first: ACCOUNT#<ACCOUNT_id>
                let response = await client.send(
                    new QueryCommand({
                        TableName: this.tableName,
                        KeyConditionExpression:
                            'PK = :pk AND begins_with(SK, :skPrefix)',
                        ExpressionAttributeValues: {
                            ':pk': pkPrefix,
                            ':skPrefix': 'ROLE#',
                        },
                    }),
                );

                // If no results, try legacy pattern
                if (!response.Items || response.Items.length === 0) {
                    response = await client.send(
                        new QueryCommand({
                            TableName: this.tableName,
                            KeyConditionExpression:
                                'PK = :pk AND begins_with(SK, :skPrefix)',
                            ExpressionAttributeValues: {
                                ':pk': legacyPkPrefix,
                                ':skPrefix': 'ROLE#',
                            },
                        }),
                    );
                }

                return response.Items || [];
            });

            const roleRecord = allRolesRaw.find((r) => r.id === roleId);
            if (roleRecord) {
                console.log(
                    `✅ Found role to delete with PK: ${roleRecord.PK}, SK: ${roleRecord.SK}`,
                );
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
        // New pattern: USER#<accountId>#<userId>#GROUPS, GROUP#<groupId>
        // For system users (no account), use USER#SYSTIVA#<userId>#GROUPS
        const lookupItem = {
            PK: `USER#SYSTIVA#${userId}#GROUPS`,
            SK: `GROUP#${groupId}`,
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
        accountName?: string, // Optional - stored for reference
    ): Promise<void> {
        const now = new Date().toISOString();

        // User's groups relationship: PK: USER#${accountId}#${userId}#GROUPS, SK: GROUP#${groupId}
        const userGroupsItem = {
            PK: `USER#${accountId}#${userId}#GROUPS`,
            SK: `GROUP#${groupId}`,
            user_id: userId,
            group_id: groupId,
            account_id: accountId,
            account_name: accountName || '',
            assigned_at: now,
            entity_type: 'GROUP_MEMBERSHIP',
        };
        await DynamoDBOperations.putItem(this.tableName, userGroupsItem);

        // Group's users relationship: PK: GROUP#<ACCOUNT_id>#<group_id>#USERS, SK: USER#<userID>
        const groupUsersItem = {
            PK: `GROUP#${accountId}#${groupId}#USERS`,
            SK: `USER#${userId}`,
            user_id: userId,
            group_id: groupId,
            account_id: accountId,
            account_name: accountName || '',
            assigned_at: now,
            entity_type: 'USER_IN_GROUP',
        };
        await DynamoDBOperations.putItem(this.tableName, groupUsersItem);
    }

    private async deleteUserGroupLookup(
        userId: string,
        groupId: string,
    ): Promise<void> {
        // Delete with new pattern
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `USER#SYSTIVA#${userId}#GROUPS`,
            SK: `GROUP#${groupId}`,
        }).catch(() => {});
        // Also try old pattern for backward compatibility
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `SYSTIVA#${userId}`,
            SK: `GROUP_ASSIGNMENT#${groupId}`,
        }).catch(() => {});
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

        // Delete group's users relationship
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `GROUP#${accountId}#${groupId}#USERS`,
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
        // New pattern: GROUP#<accountId>#<groupId>#ROLES, ROLE#<roleId>
        // For system groups (no account), use GROUP#SYSTIVA#<groupId>#ROLES
        const lookupItem = {
            PK: `GROUP#SYSTIVA#${groupId}#ROLES`,
            SK: `ROLE#${roleId}`,
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
        // Delete with new pattern
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `GROUP#SYSTIVA#${groupId}#ROLES`,
            SK: `ROLE#${roleId}`,
        }).catch(() => {});
        // Also try old pattern for backward compatibility
        await DynamoDBOperations.deleteItem(this.tableName, {
            PK: `SYSTIVA#${groupId}`,
            SK: `ROLE_ASSIGNMENT#${roleId}`,
        }).catch(() => {});
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

    async getUserGroups(
        userId: string,
        accountId?: string,
        accountName?: string, // Optional - not required
        enterpriseId?: string,
        enterpriseName?: string, // Optional - not required
    ): Promise<Group[]> {
        try {
            console.log('🔍 getUserGroups called:', {
                userId,
                accountId,
                enterpriseId,
            });

            // Get user from correct table based on account context (only accountId required)
            let user;
            if (accountId) {
                console.log('📋 Looking for user in account table:', accountId);
                const users = await this.listUsersByAccount(
                    accountId,
                    undefined, // accountName not required
                    enterpriseId,
                    undefined, // enterpriseName not required
                );
                user = users.find((u) => u.id === userId);
                console.log(
                    `📋 User found in account table:`,
                    user ? 'YES' : 'NO',
                );
            } else {
                console.log('📋 Looking for user in Systiva table');
                user = await this.getUser(userId);
            }

            if (!user || !user.assignedGroups) {
                console.log('⚠️  User not found or has no assigned groups');
                return [];
            }

            console.log(
                `📋 User has ${user.assignedGroups.length} assigned group(s):`,
                user.assignedGroups,
            );

            const groups: Group[] = [];
            for (const groupId of user.assignedGroups) {
                console.log(`🔍 Looking up group: ${groupId}`);

                // Try to find group with full context (account + enterprise)
                let group = await this.getGroup(
                    groupId,
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                );

                // If not found with account context, try Systiva table
                if (!group) {
                    group = await this.getGroup(groupId);
                }

                if (group) {
                    console.log(`  ✅ Found group: ${group.name}`);
                    groups.push(group);
                } else {
                    console.log(`  ⚠️  Group ${groupId} not found in database`);
                }
            }

            console.log(`📋 Returning ${groups.length} group(s)`);
            return groups;
        } catch (error) {
            console.error('Error getting user groups:', error);
            throw error;
        }
    }

    async getGroupRoles(
        groupId: string,
        accountId?: string,
        accountName?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<Role[]> {
        try {
            console.log(
                `📋 getGroupRoles called for ${groupId} with context:`,
                {
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                },
            );

            const group = await this.getGroup(
                groupId,
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            );
            if (!group || !group.assignedRoles) {
                console.log(`⚠️ Group not found or has no assigned roles`);
                return [];
            }

            console.log(
                `✅ Found group with ${group.assignedRoles.length} assigned role(s)`,
            );

            const roles: Role[] = [];
            for (const roleId of group.assignedRoles) {
                const role = await this.getRole(
                    roleId,
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                );
                if (role) {
                    roles.push(role);
                } else {
                    console.warn(`⚠️ Role ${roleId} not found in context`);
                }
            }

            console.log(
                `✅ Returning ${roles.length} role(s) for group ${groupId}`,
            );
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

    /**
     * Validate if a group belongs to the correct scope (account-specific vs Systiva)
     * This prevents assigning Systiva groups in account context
     */
    async validateGroupScope(
        groupId: string,
        accountId?: string,
        accountName?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<{
        isValid: boolean;
        group: Group | null;
        warning?: string;
        scopeType?: 'account' | 'systiva' | 'not_found';
    }> {
        try {
            console.log(`🔍 Validating group scope for ${groupId}:`, {
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            });

            // If account context is provided, prioritize account-specific groups
            if (accountId) {
                // First, try to find group in account-specific partition
                const accountGroup = await this.getGroup(
                    groupId,
                    accountId,
                    undefined, // accountName not required
                    enterpriseId,
                    undefined, // enterpriseName not required
                );

                if (accountGroup) {
                    console.log(
                        `✅ Group found in account scope: ${accountGroup.name}`,
                    );

                    // Validate enterprise match if specified
                    // Note: getGroup already filters by enterprise, but double-check here
                    if (
                        enterpriseId &&
                        accountGroup.enterpriseId &&
                        accountGroup.enterpriseId !== enterpriseId
                    ) {
                        return {
                            isValid: false,
                            group: accountGroup,
                            warning: `Group belongs to different enterprise: ${accountGroup.enterpriseName} (${accountGroup.enterpriseId}), expected ${enterpriseName} (${enterpriseId})`,
                            scopeType: 'account',
                        };
                    }

                    return {
                        isValid: true,
                        group: accountGroup,
                        scopeType: 'account',
                    };
                }

                // Group not found in account scope - check if it's a Systiva group
                console.log(
                    `⚠️  Group not found in account scope, checking Systiva...`,
                );
                const systivaGroup = await this.getGroup(groupId);

                if (systivaGroup) {
                    console.log(
                        `❌ Group found in SYSTIVA scope: ${systivaGroup.name}`,
                    );
                    return {
                        isValid: false,
                        group: systivaGroup,
                        warning: `Attempting to assign Systiva-level group "${systivaGroup.name}" in account context. Use account-specific groups instead to maintain data isolation.`,
                        scopeType: 'systiva',
                    };
                }

                // Group not found anywhere
                return {
                    isValid: false,
                    group: null,
                    warning: `Group ${groupId} not found in database`,
                    scopeType: 'not_found',
                };
            } else {
                // No account context - only Systiva groups are valid
                console.log(
                    `📋 No account context - validating as Systiva group`,
                );
                const systivaGroup = await this.getGroup(groupId);

                if (systivaGroup) {
                    return {
                        isValid: true,
                        group: systivaGroup,
                        scopeType: 'systiva',
                    };
                }

                return {
                    isValid: false,
                    group: null,
                    warning: `Group ${groupId} not found in Systiva scope`,
                    scopeType: 'not_found',
                };
            }
        } catch (error) {
            console.error('Error validating group scope:', error);
            return {
                isValid: false,
                group: null,
                warning: `Error validating group: ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`,
                scopeType: 'not_found',
            };
        }
    }

    /**
     * Find an account-specific group by name
     * Used to replace Systiva groups with account-specific alternatives
     */
    async findAccountSpecificGroupByName(
        groupName: string,
        accountId: string,
        accountName: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<Group | null> {
        try {
            console.log(
                `🔍 Looking for account-specific group named "${groupName}"`,
                {
                    accountId,
                    accountName,
                    enterpriseId,
                    enterpriseName,
                },
            );

            const groups = await this.listGroups(
                accountId,
                accountName,
                enterpriseId,
                enterpriseName,
            );

            const matchingGroup = groups.find(
                (g) =>
                    g.name === groupName ||
                    g.name.toLowerCase() === groupName.toLowerCase(),
            );

            if (matchingGroup) {
                console.log(
                    `✅ Found account-specific alternative: ${matchingGroup.name} (${matchingGroup.id})`,
                );
            } else {
                console.log(
                    `❌ No account-specific group found with name "${groupName}"`,
                );
            }

            return matchingGroup || null;
        } catch (error) {
            console.error(
                'Error finding account-specific group by name:',
                error,
            );
            return null;
        }
    }
}
