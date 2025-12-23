import * as crypto from 'crypto';
import {DynamoDBOperations} from '../dynamodb';

// Helper to generate UUID using Node.js crypto
const uuidv4 = (): string => crypto.randomUUID();

// Declare process for TypeScript
declare const process: {
    env: {
        ACCOUNT_REGISTRY_TABLE_NAME?: string;
        DYNAMODB_SYSTIVA_TABLE?: string;
        WORKSPACE?: string;
        NODE_ENV?: string;
        [key: string]: string | undefined;
    };
};

export interface Account {
    id: string;
    accountName: string;
    masterAccount?: string;
    cloudType?: string;
    address?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    status?: 'Active' | 'Inactive' | '';
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    country?: string;
    pincode?: string;
    technicalUsername?: string;
    technicalUserId?: string;
    technicalUsers?: any[];
    enterpriseName?: string;
    enterpriseId?: string;
    platform?: string;
    addresses?: any[];
    services?: any[];
    licenses?: any[];
    createdAt?: string;
    updatedAt?: string;
}

export interface TechnicalUser {
    id: string;
    accountId: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    role?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface Contact {
    id: string;
    name: string;
    email: string;
    phone: string;
    department: string;
    designation: string;
    company: string;
}

export interface License {
    id: string;
    accountId: string;
    enterprise?: string;
    product?: string;
    service?: string;
    licenseStart?: string;
    licenseEnd?: string;
    users?: string | number;
    renewalNotice?: boolean;
    noticePeriod?: number;
    contactDetails?: Contact;
    createdAt?: string;
    updatedAt?: string;
}

export class AccountsDynamoDBService {
    private readonly tableName: string;
    private readonly accountRegistryTable: string;

    constructor() {
        // Primary table: DYNAMODB_SYSTIVA_TABLE (systiva-admin-dev)
        // This is the main database for ppp-be accounts
        this.tableName =
            process.env.DYNAMODB_SYSTIVA_TABLE ||
            `systiva-admin-${
                process.env.WORKSPACE || process.env.NODE_ENV || 'dev'
            }`;

        // Account registry table for fetching accounts (may be same table)
        this.accountRegistryTable =
            process.env.ACCOUNT_REGISTRY_TABLE_NAME || this.tableName;

        console.log('📋 AccountsDynamoDBService initialized with tables:', {
            tableName: this.tableName,
            accountRegistryTable: this.accountRegistryTable,
        });
    }

    async list(): Promise<Account[]> {
        try {
            console.log(
                '📋 Listing accounts from DynamoDB table:',
                this.accountRegistryTable,
            );

            // Query accounts from account registry table (same as admin-portal-be workflow 06)
            // This is the single source of truth for accounts
            const baseAccounts = await this.listFromAccountRegistry();
            console.log(
                `✅ Found ${baseAccounts.length} accounts from account registry`,
            );

            // For each account, fetch its licenses, technical users, and addresses
            const accountsWithRelations = await Promise.all(
                baseAccounts.map(async (account) => {
                    const accountId = account.id || account.accountId;

                    // Fetch licenses for this account (handle errors gracefully)
                    let licenses: any[] = account.licenses || [];
                    try {
                        const fetchedLicenses = await this.listLicenses(
                            accountId,
                        );
                        if (fetchedLicenses && fetchedLicenses.length > 0) {
                            licenses = fetchedLicenses;
                        }
                    } catch (error) {
                        console.warn(
                            `⚠️ Could not fetch licenses for account ${accountId}:`,
                            error,
                        );
                    }

                    // Fetch technical users for this account (handle errors gracefully)
                    let technicalUsers: any[] = account.technicalUsers || [];
                    let technicalUser: any = null;
                    try {
                        technicalUser = await this.getTechnicalUser(accountId);
                        if (technicalUser) {
                            technicalUsers = [technicalUser];
                        }
                    } catch (error) {
                        console.warn(
                            `⚠️ Could not fetch technical user for account ${accountId}:`,
                            error,
                        );
                    }

                    // Addresses are already included from listFromAccountRegistry()
                    const addresses: any[] = account.addresses || [];

                    console.log(`📊 Account ${account.accountName}:`, {
                        licensesCount: licenses.length,
                        technicalUsersCount: technicalUsers.length,
                        addressesCount: addresses.length,
                    });

                    return {
                        ...account,
                        licenses: licenses,
                        technicalUsers: technicalUsers,
                        technicalUsername:
                            account.technicalUsername ||
                            technicalUser?.username ||
                            technicalUser?.adminUsername ||
                            '',
                        technicalUserId:
                            account.technicalUserId || technicalUser?.id || '',
                        addresses: addresses,
                    };
                }),
            );

            // Sort by account name and return
            return accountsWithRelations.sort((a, b) =>
                (a.accountName || '').localeCompare(b.accountName || ''),
            );
        } catch (error) {
            console.error('❌ Error listing accounts:', error);
            throw error;
        }
    }

    /**
     * List accounts from admin-portal account registry table
     * This queries the table where accounts are stored via the onboarding workflow
     */
    async listFromAccountRegistry(): Promise<any[]> {
        try {
            console.log(
                '📋 Scanning account registry table:',
                this.accountRegistryTable,
            );

            // Scan the account registry table for all accounts
            // Filter for entityType = 'ACCOUNT' or PK begins_with 'ACCOUNT#'
            const items = await DynamoDBOperations.scanItems(
                this.accountRegistryTable,
                'entityType = :entityType',
                {
                    ':entityType': 'ACCOUNT',
                },
            );

            console.log(`✅ Found ${items.length} accounts in registry`);

            // Map admin-portal schema to our Account format
            return items.map((item: any) => {
                // Extract accountId from PK (format: ACCOUNT#12345678)
                const accountId =
                    item.accountId ||
                    (item.PK ? item.PK.replace('ACCOUNT#', '') : '');

                // Map subscriptionTier to cloudType display value
                let cloudType = item.cloudType || '';
                if (item.subscriptionTier) {
                    const tier = item.subscriptionTier.toLowerCase();
                    if (tier === 'private') {
                        cloudType = 'Private Cloud';
                    } else if (tier === 'public' || tier === 'platform') {
                        cloudType = 'Public Cloud';
                    } else {
                        cloudType = item.subscriptionTier;
                    }
                }

                return {
                    // Use accountId for id to match expected format
                    id: accountId,
                    accountId: accountId,
                    accountName: item.accountName || '',
                    masterAccount: item.masterAccount || item.accountName || '',
                    cloudType: cloudType,
                    subscriptionTier: item.subscriptionTier || '',
                    // Address fields
                    address: item.address || '',
                    country: item.addressDetails?.country || item.country || '',
                    addressLine1: item.addressDetails?.addressLine1 || '',
                    addressLine2: item.addressDetails?.addressLine2 || '',
                    city: item.addressDetails?.city || '',
                    state: item.addressDetails?.state || '',
                    addresses: item.addressDetails ? [item.addressDetails] : [],
                    // Technical user fields
                    technicalUsername:
                        item.technicalUser?.adminUsername ||
                        item.adminUsername ||
                        '',
                    technicalUserId: '',
                    technicalUsers: item.technicalUser
                        ? [item.technicalUser]
                        : [],
                    // Other fields
                    email: item.email || item.adminEmail || '',
                    firstName: item.firstName || '',
                    lastName: item.lastName || '',
                    status: item.provisioningState || item.status || 'Active',
                    provisioningState: item.provisioningState || '',
                    licenses: [],
                    createdAt:
                        item.registeredOn ||
                        item.createdAt ||
                        item.created_date,
                    updatedAt:
                        item.lastModified ||
                        item.updatedAt ||
                        item.updated_date,
                };
            });
        } catch (error) {
            console.error('❌ Error listing from account registry:', error);
            throw error;
        }
    }

    async get(accountId: string): Promise<Account | null> {
        try {
            console.log('🔍 Getting account:', accountId);

            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `SYSTIVA#ACCOUNTS`,
                SK: `ACCOUNT#${accountId}`,
            });

            if (!item) {
                console.log('❌ Account not found:', accountId);
                return null;
            }

            // Fetch licenses for this account (handle errors gracefully)
            let licenses: any[] = [];
            try {
                licenses = await this.listLicenses(accountId);
            } catch (error) {
                console.warn(
                    `⚠️ Could not fetch licenses for account ${accountId}:`,
                    error,
                );
                licenses = [];
            }

            // Fetch technical user for this account (handle errors gracefully)
            let technicalUser: any = null;
            try {
                technicalUser = await this.getTechnicalUser(accountId);
            } catch (error) {
                console.warn(
                    `⚠️ Could not fetch technical user for account ${accountId}:`,
                    error,
                );
                technicalUser = null;
            }

            return {
                id: item.id || accountId,
                accountName: item.account_name || item.accountName || '',
                masterAccount: item.master_account || item.masterAccount || '',
                cloudType: item.cloud_type || item.cloudType || '',
                address: item.address || '',
                country: item.country || '',
                addressLine1: item.address_line1 || item.addressLine1 || '',
                addresses: item.addresses || [],
                // Note: technicalUsers are fetched separately via user management API with technical_user=true filter
                technicalUsername:
                    item.technical_username || technicalUser?.username || '',
                technicalUserId:
                    item.technical_user_id || technicalUser?.id || '',
                licenses: licenses || [],
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('❌ Error getting account:', error);
            throw error;
        }
    }

    async create(accountData: Omit<Account, 'id'>): Promise<Account> {
        try {
            const accountId = uuidv4();
            const now = new Date().toISOString();

            console.log(
                '🆕 Creating new account with ID:',
                accountId,
                'Name:',
                accountData.accountName,
            );

            let technicalUserId: string | undefined = undefined;
            let technicalUsername: string | undefined = undefined;

            // 1. Create Technical User FIRST if provided
            if (accountData.technicalUsername) {
                console.log(
                    '👤 Technical user data provided, creating technical user first...',
                );
                try {
                    const techUser = await this.createTechnicalUser(accountId, {
                        username: accountData.technicalUsername,
                        firstName: (accountData as any).technicalFirstName,
                        lastName: (accountData as any).technicalLastName,
                        email: (accountData as any).technicalEmail,
                        phone: (accountData as any).technicalPhone,
                        role: (accountData as any).technicalRole,
                    });
                    technicalUserId = techUser.id;
                    technicalUsername = techUser.username;
                    console.log(
                        '✅ Technical user created with ID:',
                        technicalUserId,
                    );
                } catch (error) {
                    console.error('❌ Error creating technical user:', error);
                    // Continue without technical user if creation fails
                }
            } else {
                console.log(
                    'ℹ️ No technical user data provided, skipping technical user creation',
                );
            }

            // 2. Create Account Entity (with technical user ID if available)
            const accountItem = {
                PK: `SYSTIVA#ACCOUNTS`,
                SK: `ACCOUNT#${accountId}`,
                id: accountId,
                account_name: accountData.accountName,
                master_account: accountData.masterAccount || '',
                cloud_type: (accountData as any).cloudType || '',
                address: (accountData as any).address || '',
                country: accountData.country || '',
                address_line1: accountData.addressLine1 || '',
                addresses: (accountData as any).addresses || [],
                technical_user_id: technicalUserId || null,
                technical_username: technicalUsername || '',
                created_date: now,
                updated_date: now,
                entity_type: 'ACCOUNT',
            };

            console.log(
                '📝 Account entity to save:',
                JSON.stringify(accountItem, null, 2),
            );

            await DynamoDBOperations.putItem(this.tableName, accountItem);

            console.log('✅ Account entity created successfully');

            // 3. Create Licenses if provided
            const licenses =
                (accountData as any).licenses ||
                (accountData as any).services ||
                [];
            if (licenses.length > 0) {
                console.log(`📝 Creating ${licenses.length} license(s)...`);
                for (const licData of licenses) {
                    await this.createLicense(accountId, licData);
                }
            }

            // 4. Return the created account
            return {
                id: accountId,
                accountName: accountData.accountName,
                masterAccount: accountData.masterAccount,
                cloudType: (accountData as any).cloudType,
                address: (accountData as any).address,
                country: accountData.country,
                addressLine1: accountData.addressLine1,
                addresses: (accountData as any).addresses || [],
                technicalUsername: technicalUsername || '',
                technicalUserId: technicalUserId,
                licenses: licenses,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error('❌ Error creating account:', error);
            throw error;
        }
    }

    async update(
        accountId: string,
        updates: Partial<Account>,
    ): Promise<Account | null> {
        try {
            console.log('🔄 Updating account:', accountId);
            console.log(
                '🔄 Received updates:',
                JSON.stringify(updates, null, 2),
            );

            const now = new Date().toISOString();

            // Get existing account first
            const existingAccount = await this.get(accountId);
            if (!existingAccount) {
                console.log('❌ Account not found, cannot update:', accountId);
                return null;
            }

            const updateFields: string[] = [];
            const expressionAttributeValues: any = {
                ':updated': now,
            };
            const expressionAttributeNames: any = {};

            // Only update account-level fields (not licenses - those are separate entities)
            if (updates.accountName !== undefined) {
                updateFields.push('#account_name = :accountName');
                expressionAttributeValues[':accountName'] = updates.accountName;
                expressionAttributeNames['#account_name'] = 'account_name';
            }
            if (updates.masterAccount !== undefined) {
                updateFields.push('master_account = :masterAccount');
                expressionAttributeValues[':masterAccount'] =
                    updates.masterAccount;
            }
            if (updates.cloudType !== undefined) {
                updateFields.push('cloud_type = :cloudType');
                expressionAttributeValues[':cloudType'] = updates.cloudType;
            }
            if (updates.address !== undefined) {
                updateFields.push('address = :address');
                expressionAttributeValues[':address'] = updates.address;
            }
            if (updates.country !== undefined) {
                updateFields.push('country = :country');
                expressionAttributeValues[':country'] = updates.country;
            }
            if (updates.addressLine1 !== undefined) {
                updateFields.push('address_line1 = :addressLine1');
                expressionAttributeValues[':addressLine1'] =
                    updates.addressLine1;
            }
            if (updates.addresses !== undefined) {
                updateFields.push('addresses = :addresses');
                expressionAttributeValues[':addresses'] = updates.addresses;
            }

            // Note: Technical users are stored as separate user entities with technical_user=true flag
            // They are not stored as an array on the account object

            // Handle licenses separately - update/create/delete as separate entities
            if (
                (updates as any).licenses !== undefined ||
                (updates as any).services !== undefined
            ) {
                console.log('🔄 Updating licenses separately...');
                const newLicenses =
                    (updates as any).licenses ||
                    (updates as any).services ||
                    [];

                // Delete existing licenses and create new ones
                const existingLicenses = await this.listLicenses(accountId);
                for (const existingLic of existingLicenses) {
                    await this.deleteLicense(accountId, existingLic.id!);
                }

                // Create new licenses
                for (const licData of newLicenses) {
                    await this.createLicense(accountId, licData);
                }
            }

            if (updateFields.length === 0) {
                console.log(
                    '⚠️ No account fields to update (licenses handled separately)',
                );
                // Still fetch updated account with licenses
                return await this.get(accountId);
            }

            const updateExpression = `SET ${updateFields.join(
                ', ',
            )}, updated_date = :updated`;

            console.log('📝 DynamoDB UpdateCommand:', {
                TableName: this.tableName,
                Key: {PK: `SYSTIVA#ACCOUNTS`, SK: `ACCOUNT#${accountId}`},
                UpdateExpression: updateExpression,
            });

            await DynamoDBOperations.updateItem(
                this.tableName,
                {
                    PK: `SYSTIVA#ACCOUNTS`,
                    SK: `ACCOUNT#${accountId}`,
                },
                updateExpression,
                expressionAttributeValues,
                Object.keys(expressionAttributeNames).length > 0
                    ? expressionAttributeNames
                    : undefined,
            );

            console.log('✅ Account updated successfully');

            // Fetch and return the updated account with all relationships
            return await this.get(accountId);
        } catch (error) {
            console.error('❌ Error updating account:', error);
            throw error;
        }
    }

    async remove(accountId: string): Promise<void> {
        try {
            console.log('🗑️ Deleting account and related entities:', accountId);

            // 1. Delete all licenses for this account
            const licenses = await this.listLicenses(accountId);
            for (const license of licenses) {
                await this.deleteLicense(accountId, license.id!);
            }
            console.log(`✅ Deleted ${licenses.length} license(s)`);

            // 2. Delete technical user if exists
            const technicalUser = await this.getTechnicalUser(accountId);
            if (technicalUser) {
                await this.deleteTechnicalUser(accountId, technicalUser.id);
            }
            console.log('✅ Deleted technical user (if existed)');

            // 3. Delete the account entity
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `SYSTIVA#ACCOUNTS`,
                SK: `ACCOUNT#${accountId}`,
            });

            console.log('✅ Account deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting account:', error);
            throw error;
        }
    }

    // ==================== Technical User Methods ====================

    async createTechnicalUser(
        accountId: string,
        userData: Omit<TechnicalUser, 'id' | 'accountId'>,
    ): Promise<TechnicalUser> {
        try {
            const techUserId = uuidv4();
            const now = new Date().toISOString();

            console.log(
                '🆕 Creating technical user for account:',
                accountId,
                'User ID:',
                techUserId,
            );

            const item = {
                PK: `ACCOUNT#${accountId}#TECHNICAL_USERS`,
                SK: `TECHNICAL_USER#${techUserId}`,
                id: techUserId,
                account_id: accountId,
                username: userData.username || '',
                first_name: userData.firstName || '',
                last_name: userData.lastName || '',
                email: userData.email || '',
                phone: userData.phone || '',
                role: userData.role || '',
                created_date: now,
                updated_date: now,
                entity_type: 'TECHNICAL_USER',
            };

            await DynamoDBOperations.putItem(this.tableName, item);

            console.log('✅ Technical user created successfully');

            return {
                id: techUserId,
                accountId: accountId,
                username: userData.username,
                firstName: userData.firstName,
                lastName: userData.lastName,
                email: userData.email,
                phone: userData.phone,
                role: userData.role,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error('❌ Error creating technical user:', error);
            throw error;
        }
    }

    async getTechnicalUser(accountId: string): Promise<TechnicalUser | null> {
        try {
            // Query for technical user by account
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': `ACCOUNT#${accountId}#TECHNICAL_USERS`,
                    ':sk': 'TECHNICAL_USER#',
                },
            );

            if (!items || items.length === 0) {
                return null;
            }

            // Return the first technical user (should only be one per account)
            const item = items[0];
            return {
                id: item.id || item.SK?.replace('TECHNICAL_USER#', ''),
                accountId: item.account_id || accountId,
                username: item.username || '',
                firstName: item.first_name || item.firstName || '',
                lastName: item.last_name || item.lastName || '',
                email: item.email || '',
                phone: item.phone || '',
                role: item.role || '',
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('❌ Error getting technical user:', error);
            throw error;
        }
    }

    async updateTechnicalUser(
        accountId: string,
        techUserId: string,
        updates: Partial<TechnicalUser>,
    ): Promise<TechnicalUser | null> {
        try {
            console.log('🔄 Updating technical user:', techUserId);

            const now = new Date().toISOString();
            const updateFields: string[] = [];
            const expressionAttributeValues: any = {':updated': now};

            if (updates.username !== undefined) {
                updateFields.push('username = :username');
                expressionAttributeValues[':username'] = updates.username;
            }
            if (updates.firstName !== undefined) {
                updateFields.push('first_name = :firstName');
                expressionAttributeValues[':firstName'] = updates.firstName;
            }
            if (updates.lastName !== undefined) {
                updateFields.push('last_name = :lastName');
                expressionAttributeValues[':lastName'] = updates.lastName;
            }
            if (updates.email !== undefined) {
                updateFields.push('email = :email');
                expressionAttributeValues[':email'] = updates.email;
            }
            if (updates.phone !== undefined) {
                updateFields.push('phone = :phone');
                expressionAttributeValues[':phone'] = updates.phone;
            }
            if (updates.role !== undefined) {
                updateFields.push('role = :role');
                expressionAttributeValues[':role'] = updates.role;
            }

            if (updateFields.length === 0) {
                return await this.getTechnicalUser(accountId);
            }

            const updateExpression = `SET ${updateFields.join(
                ', ',
            )}, updated_date = :updated`;

            await DynamoDBOperations.updateItem(
                this.tableName,
                {
                    PK: `ACCOUNT#${accountId}#TECHNICAL_USERS`,
                    SK: `TECHNICAL_USER#${techUserId}`,
                },
                updateExpression,
                expressionAttributeValues,
            );

            console.log('✅ Technical user updated successfully');
            return await this.getTechnicalUser(accountId);
        } catch (error) {
            console.error('❌ Error updating technical user:', error);
            throw error;
        }
    }

    async deleteTechnicalUser(
        accountId: string,
        techUserId: string,
    ): Promise<void> {
        try {
            console.log('🗑️ Deleting technical user:', techUserId);

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `ACCOUNT#${accountId}#TECHNICAL_USERS`,
                SK: `TECHNICAL_USER#${techUserId}`,
            });

            console.log('✅ Technical user deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting technical user:', error);
            throw error;
        }
    }

    // ==================== License Methods ====================

    async createLicense(
        accountId: string,
        licenseData: Omit<License, 'id' | 'accountId'>,
    ): Promise<License> {
        try {
            const licenseId = uuidv4();
            const now = new Date().toISOString();

            console.log(
                '🆕 Creating license for account:',
                accountId,
                'License ID:',
                licenseId,
            );

            const item = {
                PK: `ACCOUNT#${accountId}#LICENSES`,
                SK: `LICENSE#${licenseId}`,
                id: licenseId,
                account_id: accountId,
                enterprise: licenseData.enterprise || '',
                product: licenseData.product || '',
                service: licenseData.service || '',
                license_start: licenseData.licenseStart || '',
                license_end: licenseData.licenseEnd || '',
                users: licenseData.users || '',
                renewal_notice: licenseData.renewalNotice || false,
                notice_period: licenseData.noticePeriod || 0,
                contact_details: licenseData.contactDetails || null,
                created_date: now,
                updated_date: now,
                entity_type: 'LICENSE',
            };

            await DynamoDBOperations.putItem(this.tableName, item);

            console.log('✅ License created successfully');

            return {
                id: licenseId,
                accountId: accountId,
                enterprise: licenseData.enterprise,
                product: licenseData.product,
                service: licenseData.service,
                licenseStart: licenseData.licenseStart,
                licenseEnd: licenseData.licenseEnd,
                users: licenseData.users,
                renewalNotice: licenseData.renewalNotice,
                noticePeriod: licenseData.noticePeriod,
                contactDetails: licenseData.contactDetails,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error('❌ Error creating license:', error);
            throw error;
        }
    }

    async listLicenses(accountId: string): Promise<License[]> {
        try {
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': `ACCOUNT#${accountId}#LICENSES`,
                    ':sk': 'LICENSE#',
                },
            );

            return items.map((item) => ({
                id: item.id || item.SK?.replace('LICENSE#', ''),
                accountId: item.account_id || accountId,
                enterprise: item.enterprise || '',
                product: item.product || '',
                service: item.service || '',
                licenseStart: item.license_start || item.licenseStart || '',
                licenseEnd: item.license_end || item.licenseEnd || '',
                users: item.users || '',
                renewalNotice:
                    item.renewal_notice || item.renewalNotice || false,
                noticePeriod: item.notice_period || item.noticePeriod || 0,
                contactDetails:
                    item.contact_details || item.contactDetails || null,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            }));
        } catch (error) {
            console.error('❌ Error listing licenses:', error);
            return [];
        }
    }

    async getLicense(
        accountId: string,
        licenseId: string,
    ): Promise<License | null> {
        try {
            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `ACCOUNT#${accountId}#LICENSES`,
                SK: `LICENSE#${licenseId}`,
            });

            if (!item) {
                return null;
            }

            return {
                id: item.id || licenseId,
                accountId: item.account_id || accountId,
                enterprise: item.enterprise || '',
                product: item.product || '',
                service: item.service || '',
                licenseStart: item.license_start || item.licenseStart || '',
                licenseEnd: item.license_end || item.licenseEnd || '',
                users: item.users || '',
                renewalNotice:
                    item.renewal_notice || item.renewalNotice || false,
                noticePeriod: item.notice_period || item.noticePeriod || 0,
                contactDetails:
                    item.contact_details || item.contactDetails || null,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('❌ Error getting license:', error);
            throw error;
        }
    }

    async updateLicense(
        accountId: string,
        licenseId: string,
        updates: Partial<License>,
    ): Promise<License | null> {
        try {
            console.log('🔄 Updating license:', licenseId);

            const now = new Date().toISOString();
            const updateFields: string[] = [];
            const expressionAttributeValues: any = {':updated': now};
            const expressionAttributeNames: any = {};

            if (updates.enterprise !== undefined) {
                updateFields.push('enterprise = :enterprise');
                expressionAttributeValues[':enterprise'] = updates.enterprise;
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
            if (updates.licenseStart !== undefined) {
                updateFields.push('license_start = :licenseStart');
                expressionAttributeValues[':licenseStart'] =
                    updates.licenseStart;
            }
            if (updates.licenseEnd !== undefined) {
                updateFields.push('license_end = :licenseEnd');
                expressionAttributeValues[':licenseEnd'] = updates.licenseEnd;
            }
            if (updates.users !== undefined) {
                // 'users' is a reserved keyword in DynamoDB, so use ExpressionAttributeNames
                updateFields.push('#users = :users');
                expressionAttributeNames['#users'] = 'users';
                expressionAttributeValues[':users'] = updates.users;
            }
            if (updates.renewalNotice !== undefined) {
                updateFields.push('renewal_notice = :renewalNotice');
                expressionAttributeValues[':renewalNotice'] =
                    updates.renewalNotice;
            }
            if (updates.noticePeriod !== undefined) {
                updateFields.push('notice_period = :noticePeriod');
                expressionAttributeValues[':noticePeriod'] =
                    updates.noticePeriod;
            }
            if (updates.contactDetails !== undefined) {
                updateFields.push('contact_details = :contactDetails');
                expressionAttributeValues[':contactDetails'] =
                    updates.contactDetails;
            }

            if (updateFields.length === 0) {
                return await this.getLicense(accountId, licenseId);
            }

            const updateExpression = `SET ${updateFields.join(
                ', ',
            )}, updated_date = :updated`;

            await DynamoDBOperations.updateItem(
                this.tableName,
                {
                    PK: `ACCOUNT#${accountId}#LICENSES`,
                    SK: `LICENSE#${licenseId}`,
                },
                updateExpression,
                expressionAttributeValues,
                expressionAttributeNames,
            );

            console.log('✅ License updated successfully');
            return await this.getLicense(accountId, licenseId);
        } catch (error) {
            console.error('❌ Error updating license:', error);
            throw error;
        }
    }

    async deleteLicense(accountId: string, licenseId: string): Promise<void> {
        try {
            console.log('🗑️ Deleting license:', licenseId);

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `ACCOUNT#${accountId}#LICENSES`,
                SK: `LICENSE#${licenseId}`,
            });

            console.log('✅ License deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting license:', error);
            throw error;
        }
    }
}
