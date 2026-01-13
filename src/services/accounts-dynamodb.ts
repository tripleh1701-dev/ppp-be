import {v4 as uuidv4} from 'uuid';
import {DynamoDBOperations} from '../dynamodb';

export interface Account {
    id: string;
    accountId?: string;
    accountName: string;
    masterAccount?: string;
    cloudType?: 'public' | 'private' | string;
    subscriptionTier?: string;
    awsAccountId?: string; // AWS account ID where this account's DynamoDB is provisioned
    address?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    status?: 'Active' | 'Inactive' | '' | string;
    provisioningState?: string;
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
    // Audit columns
    CREATED_BY?: string | number | null;
    CREATION_DATE?: string | null;
    LAST_UPDATED_BY?: string | number | null;
    LAST_UPDATE_DATE?: string | null;
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
        console.log('========================================');
        console.log('🚀 AccountsDynamoDBService CONSTRUCTOR');
        console.log('🚀 Raw env vars:', {
            ACCOUNT_REGISTRY_TABLE_NAME:
                process.env.ACCOUNT_REGISTRY_TABLE_NAME,
            DYNAMODB_TABLE: process.env.DYNAMODB_TABLE,
            WORKSPACE: process.env.WORKSPACE,
            NODE_ENV: process.env.NODE_ENV,
            STORAGE_MODE: process.env.STORAGE_MODE,
        });

        // Account registry table - where accounts are stored (from admin-portal)
        this.accountRegistryTable =
            process.env.ACCOUNT_REGISTRY_TABLE_NAME ||
            `admin-portal-${
                process.env.WORKSPACE || process.env.NODE_ENV || 'dev'
            }-account-registry`;

        // Systiva table for other operations
        this.tableName =
            process.env.DYNAMODB_TABLE || this.accountRegistryTable;

        console.log('📋 AccountsDynamoDBService initialized with tables:', {
            accountRegistryTable: this.accountRegistryTable,
            tableName: this.tableName,
        });
        console.log('========================================');
    }

    async list(): Promise<Account[]> {
        try {
            console.log(
                '📋 Listing accounts from DynamoDB table:',
                this.accountRegistryTable,
            );

            // Query accounts from account registry table
            const accounts = await this.listFromAccountRegistry();

            // Null safety
            if (!accounts || !Array.isArray(accounts)) {
                console.warn('⚠️ No accounts returned');
                return [];
            }

            console.log(`✅ Found ${accounts.length} accounts`);

            // Fetch licenses for each account (if not already on the item)
            const accountsWithLicenses = await Promise.all(
                accounts.map(async (account) => {
                    try {
                        // Skip if account already has licenses array populated
                        if (account.licenses && account.licenses.length > 0) {
                            console.log(
                                `📋 Account ${account.accountName} already has ${account.licenses.length} licenses`,
                            );
                            return account;
                        }

                        // Fetch licenses separately for this account
                        const licenses = await this.listLicenses(
                            account.id || account.accountId,
                        );
                        console.log(
                            `📋 Fetched ${licenses.length} licenses for account ${account.accountName}`,
                        );
                        return {
                            ...account,
                            licenses: licenses,
                        };
                    } catch (error) {
                        console.warn(
                            `⚠️ Could not fetch licenses for account ${account.accountName}:`,
                            error,
                        );
                        return account;
                    }
                }),
            );

            // Sort by account name and return
            return accountsWithLicenses.sort((a, b) =>
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
            console.log('========================================');
            console.log('📋 listFromAccountRegistry() STARTED');
            console.log('📋 Table name:', this.accountRegistryTable);
            console.log('📋 Environment:', {
                ACCOUNT_REGISTRY_TABLE_NAME:
                    process.env.ACCOUNT_REGISTRY_TABLE_NAME,
                DYNAMODB_TABLE: process.env.DYNAMODB_TABLE,
                WORKSPACE: process.env.WORKSPACE,
                NODE_ENV: process.env.NODE_ENV,
                STORAGE_MODE: process.env.STORAGE_MODE,
            });
            console.log('========================================');

            // Scan the account registry table for all accounts
            console.log('📋 Calling DynamoDBOperations.scanItems...');
            const allItems = await DynamoDBOperations.scanItems(
                this.accountRegistryTable,
            );

            console.log('📋 scanItems returned:', typeof allItems);

            // Null safety - ensure we have an array
            if (!allItems || !Array.isArray(allItems)) {
                console.warn(
                    '⚠️ Scan returned no items or invalid data:',
                    allItems,
                );
                return [];
            }

            console.log(`📋 Raw scan returned ${allItems.length} items`);

            // Log first item for debugging (if exists)
            if (allItems.length > 0) {
                console.log(
                    '📋 First item sample:',
                    JSON.stringify(allItems[0], null, 2),
                );
            }

            // Filter for accounts only - exclude AUDIT records and items without accountName
            const filteredItems = allItems.filter((item: any) => {
                if (!item) return false;

                // Exclude AUDIT records (PK or SK contains #AUDIT)
                const pk = String(item.PK || '');
                const sk = String(item.SK || '');
                if (pk.includes('#AUDIT') || sk.includes('#AUDIT')) {
                    return false;
                }

                // Must have accountName (non-empty string)
                if (
                    !item.accountName ||
                    String(item.accountName).trim() === ''
                ) {
                    return false;
                }

                // Check entityType field OR PK format OR has accountId
                if (item.entityType === 'ACCOUNT') return true;
                if (pk.startsWith('ACCOUNT#') && !pk.includes('#AUDIT'))
                    return true;
                if (item.accountId) return true;

                return false;
            });

            console.log(
                `📋 After filtering: ${filteredItems.length} items (from ${allItems.length} total)`,
            );

            // Deduplicate by accountId - keep the most complete record (latest updatedAt)
            const accountMap = new Map<string, any>();
            for (const item of filteredItems) {
                const accountId =
                    item.accountId ||
                    (item.PK
                        ? String(item.PK).replace('ACCOUNT#', '').split('#')[0]
                        : '');

                if (!accountId) continue;

                const existing = accountMap.get(accountId);
                if (!existing) {
                    accountMap.set(accountId, item);
                } else {
                    // Keep the one with more complete data or newer timestamp
                    const existingTime = new Date(
                        existing.lastModified || existing.updatedAt || 0,
                    ).getTime();
                    const currentTime = new Date(
                        item.lastModified || item.updatedAt || 0,
                    ).getTime();

                    // Prefer item with provisioningState or newer timestamp
                    if (item.provisioningState && !existing.provisioningState) {
                        accountMap.set(accountId, item);
                    } else if (currentTime > existingTime) {
                        accountMap.set(accountId, item);
                    }
                }
            }

            const items = Array.from(accountMap.values());
            console.log(
                `✅ Found ${items.length} unique accounts (deduplicated from ${filteredItems.length})`,
            );

            // Map admin-portal schema to our Account format
            return items.map((item: any) => {
                try {
                    // Extract accountId from PK (format: ACCOUNT#12345678)
                    const accountId =
                        item.accountId ||
                        (item.PK
                            ? String(item.PK).replace('ACCOUNT#', '')
                            : '');

                    // Map subscriptionTier to cloudType display value
                    let cloudType = item.cloudType || '';
                    if (
                        item.subscriptionTier &&
                        typeof item.subscriptionTier === 'string'
                    ) {
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
                        masterAccount:
                            item.masterAccount || item.accountName || '',
                        cloudType: cloudType,
                        subscriptionTier: item.subscriptionTier || '',
                        // Address fields
                        address: item.address || '',
                        country:
                            item.addressDetails?.country || item.country || '',
                        addressLine1: item.addressDetails?.addressLine1 || '',
                        addressLine2: item.addressDetails?.addressLine2 || '',
                        city: item.addressDetails?.city || '',
                        state: item.addressDetails?.state || '',
                        addresses: item.addressDetails
                            ? [item.addressDetails]
                            : [],
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
                        status:
                            item.provisioningState || item.status || 'Active',
                        provisioningState: item.provisioningState || '',
                        // Licenses will be populated after mapping
                        licenses: item.licenses || [],
                        createdAt:
                            item.registeredOn ||
                            item.createdAt ||
                            item.created_date,
                        updatedAt:
                            item.lastModified ||
                            item.updatedAt ||
                            item.updated_date,
                        // Audit columns
                        CREATED_BY: item.CREATED_BY || null,
                        CREATION_DATE: item.CREATION_DATE || null,
                        LAST_UPDATED_BY: item.LAST_UPDATED_BY || null,
                        LAST_UPDATE_DATE: item.LAST_UPDATE_DATE || null,
                    };
                } catch (mapError) {
                    console.error(
                        '❌ Error mapping account item:',
                        mapError,
                        item,
                    );
                    // Return a minimal valid account object
                    return {
                        id: item.accountId || item.PK || '',
                        accountId: item.accountId || '',
                        accountName: item.accountName || 'Unknown',
                        cloudType: '',
                        addresses: [],
                        technicalUsers: [],
                        licenses: [],
                    };
                }
            });
        } catch (error: any) {
            console.error('========================================');
            console.error('❌ ERROR in listFromAccountRegistry');
            console.error('❌ Error message:', error?.message);
            console.error('❌ Error name:', error?.name);
            console.error('❌ Error stack:', error?.stack);
            console.error('❌ Table name was:', this.accountRegistryTable);
            console.error('========================================');
            throw error;
        }
    }

    async get(accountId: string): Promise<Account | null> {
        try {
            console.log('🔍 Getting account:', accountId);

            // Get using ACCOUNT# format
            let item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `ACCOUNT#${accountId}`,
                SK: `ACCOUNT#${accountId}`,
            });

            // Fallback: scan and find by accountId field (for records without standard PK/SK)
            if (!item) {
                console.log('🔍 Trying scan fallback for account...');
                const allItems = await DynamoDBOperations.scanItems(
                    this.tableName,
                );
                item = allItems?.find(
                    (i: any) =>
                        i.accountId === accountId &&
                        (i.entityType === 'ACCOUNT' || i.accountName),
                );
            }

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

            // Build technicalUsers array from stored data or single technicalUser
            let technicalUsers = item.technicalUsers || [];
            if (
                technicalUsers.length === 0 &&
                (item.technicalUser || technicalUser)
            ) {
                technicalUsers = [item.technicalUser || technicalUser].filter(
                    Boolean,
                );
            }

            return {
                id: item.id || item.accountId || accountId,
                accountId: item.accountId || item.id || accountId,
                accountName: item.account_name || item.accountName || '',
                masterAccount: item.master_account || item.masterAccount || '',
                cloudType: item.cloud_type || item.cloudType || '',
                subscriptionTier:
                    item.subscriptionTier || item.subscription_tier || '',
                awsAccountId:
                    item.aws_account_id || item.awsAccountId || item.accountAccountId || '',
                address: item.address || '',
                country: item.country || '',
                city: item.city || '',
                state: item.state || '',
                pincode: item.pincode || '',
                addressLine1: item.address_line1 || item.addressLine1 || '',
                addressLine2: item.address_line2 || item.addressLine2 || '',
                addresses: item.addresses || [],
                // Contact fields
                email: item.email || '',
                firstName: item.firstName || item.first_name || '',
                lastName: item.lastName || item.last_name || '',
                phone: item.phone || '',
                status: item.status || 'Active',
                provisioningState:
                    item.provisioningState || item.provisioning_state || '',
                // Technical user fields
                technicalUsers: technicalUsers,
                technicalUsername:
                    item.technical_username ||
                    item.technicalUsername ||
                    technicalUser?.username ||
                    technicalUsers[0]?.adminUsername ||
                    '',
                technicalUserId:
                    item.technical_user_id || technicalUser?.id || '',
                licenses: licenses || [],
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
                // Audit columns
                CREATED_BY: item.CREATED_BY || null,
                CREATION_DATE: item.CREATION_DATE || null,
                LAST_UPDATED_BY: item.LAST_UPDATED_BY || null,
                LAST_UPDATE_DATE: item.LAST_UPDATE_DATE || null,
            };
        } catch (error) {
            console.error('❌ Error getting account:', error);
            throw error;
        }
    }

    async create(accountData: Omit<Account, 'id'>): Promise<Account> {
        try {
            // Generate short numeric ID (YYMMDD + 2-digit random) for consistency
            const now = new Date();
            const dateStr = now.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD
            const randomSuffix = Math.floor(Math.random() * 99)
                .toString()
                .padStart(2, '0');
            const accountId = `${dateStr}${randomSuffix}`;
            const nowIso = now.toISOString();

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
            // Use admin-portal format for compatibility: PK = ACCOUNT#{id}
            const accountItem = {
                PK: `ACCOUNT#${accountId}`,
                SK: `ACCOUNT#${accountId}`,
                accountId: accountId,
                id: accountId,
                accountName: accountData.accountName,
                masterAccount:
                    accountData.masterAccount || accountData.accountName,
                subscriptionTier:
                    (accountData as any).subscriptionTier ||
                    ((accountData as any).cloudType === 'Private Cloud'
                        ? 'private'
                        : 'public'),
                cloudType: (accountData as any).cloudType || '',
                address: (accountData as any).address || '',
                country: accountData.country || '',
                city: (accountData as any).city || '',
                state: (accountData as any).state || '',
                pincode: (accountData as any).pincode || '',
                phone: (accountData as any).phone || '',
                addressLine1: accountData.addressLine1 || '',
                addressLine2: accountData.addressLine2 || '',
                // Store both single and array formats for compatibility
                addressDetails: (accountData as any).addresses?.[0] || null,
                technicalUser: (accountData as any).technicalUsers?.[0] || null,
                // Store full arrays for complete data
                addresses: (accountData as any).addresses || [],
                technicalUsers: (accountData as any).technicalUsers || [],
                adminUsername: technicalUsername || '',
                technicalUsername: technicalUsername || '',
                email: (accountData as any).email || '',
                firstName: (accountData as any).firstName || '',
                lastName: (accountData as any).lastName || '',
                status: (accountData as any).status || 'Active',
                provisioningState: 'active',
                entityType: 'ACCOUNT',
                registeredOn: nowIso,
                createdAt: nowIso,
                lastModified: nowIso,
                updatedAt: nowIso,
            };

            console.log(
                '📝 Account entity to save to table:',
                this.accountRegistryTable,
            );
            console.log(
                '📝 Account data:',
                JSON.stringify(accountItem, null, 2),
            );

            // Save to accountRegistryTable (same table GET reads from)
            await DynamoDBOperations.putItem(
                this.accountRegistryTable,
                accountItem,
            );

            console.log(
                '✅ Account entity created successfully in',
                this.accountRegistryTable,
            );

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
                createdAt: nowIso,
                updatedAt: nowIso,
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

            // Find the actual record to get its PK/SK (for legacy format support)
            const allItems = await DynamoDBOperations.scanItems(
                this.accountRegistryTable,
            );
            const existingItem = allItems?.find(
                (i: any) =>
                    (i.accountId === accountId || i.id === accountId) &&
                    (i.entityType === 'ACCOUNT' || i.accountName),
            );

            if (!existingItem) {
                console.log('❌ Account not found, cannot update:', accountId);
                return null;
            }

            // Get the actual PK and SK from the existing item
            const actualPK = existingItem.PK || `ACCOUNT#${accountId}`;
            const actualSK = existingItem.SK || `ACCOUNT#${accountId}`;
            console.log('📋 Found existing account with key:', {
                PK: actualPK,
                SK: actualSK,
            });

            const updateFields: string[] = [];
            const expressionAttributeValues: any = {
                ':updated': now,
            };
            const expressionAttributeNames: any = {};

            // Only update account-level fields (not licenses - those are separate entities)
            // Update BOTH camelCase and snake_case versions for compatibility with different record formats
            if (updates.accountName !== undefined) {
                updateFields.push('accountName = :accountName');
                updateFields.push('#account_name = :accountName');
                expressionAttributeValues[':accountName'] = updates.accountName;
                expressionAttributeNames['#account_name'] = 'account_name';
            }
            if (updates.masterAccount !== undefined) {
                updateFields.push('masterAccount = :masterAccount');
                updateFields.push('master_account = :masterAccount');
                expressionAttributeValues[':masterAccount'] =
                    updates.masterAccount;
            }
            if (updates.cloudType !== undefined) {
                updateFields.push('cloudType = :cloudType');
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
            // Handle subscriptionTier
            if ((updates as any).subscriptionTier !== undefined) {
                updateFields.push('subscriptionTier = :subscriptionTier');
                updateFields.push('subscription_tier = :subscriptionTier');
                expressionAttributeValues[':subscriptionTier'] = (
                    updates as any
                ).subscriptionTier;
            }
            // Handle email
            if ((updates as any).email !== undefined) {
                updateFields.push('email = :email');
                expressionAttributeValues[':email'] = (updates as any).email;
            }
            // Handle firstName
            if ((updates as any).firstName !== undefined) {
                updateFields.push('firstName = :firstName');
                updateFields.push('first_name = :firstName');
                expressionAttributeValues[':firstName'] = (
                    updates as any
                ).firstName;
            }
            // Handle lastName
            if ((updates as any).lastName !== undefined) {
                updateFields.push('lastName = :lastName');
                updateFields.push('last_name = :lastName');
                expressionAttributeValues[':lastName'] = (
                    updates as any
                ).lastName;
            }
            // Handle city
            if ((updates as any).city !== undefined) {
                updateFields.push('city = :city');
                expressionAttributeValues[':city'] = (updates as any).city;
            }
            // Handle state
            if ((updates as any).state !== undefined) {
                updateFields.push('#state = :state');
                expressionAttributeNames['#state'] = 'state';
                expressionAttributeValues[':state'] = (updates as any).state;
            }
            // Handle phone
            if ((updates as any).phone !== undefined) {
                updateFields.push('phone = :phone');
                expressionAttributeValues[':phone'] = (updates as any).phone;
            }
            // Handle status
            if ((updates as any).status !== undefined) {
                updateFields.push('#status = :status');
                expressionAttributeNames['#status'] = 'status';
                expressionAttributeValues[':status'] = (updates as any).status;
            }
            // Handle pincode
            if ((updates as any).pincode !== undefined) {
                updateFields.push('pincode = :pincode');
                expressionAttributeValues[':pincode'] = (
                    updates as any
                ).pincode;
            }

            // Handle technicalUsers array
            if ((updates as any).technicalUsers !== undefined) {
                updateFields.push('technicalUsers = :technicalUsers');
                expressionAttributeValues[':technicalUsers'] = (
                    updates as any
                ).technicalUsers;
                // Also update the first technical user for backward compatibility
                if ((updates as any).technicalUsers?.length > 0) {
                    updateFields.push('technicalUser = :technicalUser');
                    expressionAttributeValues[':technicalUser'] = (
                        updates as any
                    ).technicalUsers[0];
                    updateFields.push('technicalUsername = :technicalUsername');
                    expressionAttributeValues[':technicalUsername'] =
                        (updates as any).technicalUsers[0]?.adminUsername || '';
                }
            }

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

            // Update all timestamp formats for compatibility
            const updateExpression = `SET ${updateFields.join(
                ', ',
            )}, updated_date = :updated, updatedAt = :updated, lastModified = :updated`;

            console.log('📝 DynamoDB UpdateCommand:', {
                TableName: this.accountRegistryTable,
                Key: {PK: actualPK, SK: actualSK},
                UpdateExpression: updateExpression,
            });

            // Use accountRegistryTable with the actual key from the existing record
            await DynamoDBOperations.updateItem(
                this.accountRegistryTable,
                {
                    PK: actualPK,
                    SK: actualSK,
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
            console.log('🗑️ Using tables:', {
                tableName: this.tableName,
                accountRegistryTable: this.accountRegistryTable,
            });

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

            // 3. Find the actual account in DynamoDB by scanning for it
            // This handles all PK formats since accounts can be stored with different PKs
            const allItems = await DynamoDBOperations.scanItems(
                this.accountRegistryTable,
            );
            const accountItems = (allItems || []).filter(
                (item: any) =>
                    item &&
                    (item.accountId === accountId || item.id === accountId),
            );

            console.log(
                `🔍 Found ${accountItems.length} items matching accountId: ${accountId}`,
            );

            // 4. Delete each matching item using its actual PK/SK
            for (const item of accountItems) {
                if (item.PK && item.SK) {
                    console.log(
                        `🗑️ Deleting item with PK: ${item.PK}, SK: ${item.SK}`,
                    );
                    await DynamoDBOperations.deleteItem(
                        this.accountRegistryTable,
                        {
                            PK: item.PK,
                            SK: item.SK,
                        },
                    ).catch((e) =>
                        console.log('Note: delete error:', e.message),
                    );
                }
            }

            // 5. Also try standard ACCOUNT# format as fallback
            const key = {
                PK: `ACCOUNT#${accountId}`,
                SK: `ACCOUNT#${accountId}`,
            };

            await DynamoDBOperations.deleteItem(
                this.accountRegistryTable,
                key,
            ).catch(() => {}); // Ignore errors

            if (this.tableName !== this.accountRegistryTable) {
                await DynamoDBOperations.deleteItem(this.tableName, key).catch(
                    () => {},
                ); // Ignore errors
            }

            console.log('✅ Account deleted successfully from all tables');
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
