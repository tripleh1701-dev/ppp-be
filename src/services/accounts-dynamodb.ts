import {v4 as uuidv4} from 'uuid';
import {DynamoDBOperations} from '../dynamodb';

export interface Account {
    id: string;
    accountName: string;
    masterAccount?: string;
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
    enterpriseName?: string;
    enterpriseId?: string;
    platform?: string;
    services?: any[];
    licenses?: any[];
    createdAt?: string;
    updatedAt?: string;
}

export class AccountsDynamoDBService {
    private readonly tableName: string;

    constructor() {
        this.tableName = process.env.DYNAMODB_SYSTIVA_TABLE || 'systiva';
    }

    async list(): Promise<Account[]> {
        try {
            console.log(
                '📋 Listing accounts from DynamoDB table:',
                this.tableName,
            );

            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {
                    ':type': 'account',
                },
            );

            console.log(`✅ Found ${items.length} accounts`);

            return items
                .map((item) => ({
                    id: item.id || item.PK?.replace('SYSTIVA#', ''),
                    accountName: item.account_name || item.accountName || '',
                    masterAccount:
                        item.master_account || item.masterAccount || '',
                    country: item.country || '',
                    addressLine1: item.address_line1 || item.addressLine1 || '',
                    technicalUsername:
                        item.technical_username || item.technicalUsername || '',
                    licenses: item.licenses || item.services || [],
                    createdAt: item.created_date || item.createdAt,
                    updatedAt: item.updated_date || item.updatedAt,
                }))
                .sort((a, b) =>
                    (a.accountName || '').localeCompare(b.accountName || ''),
                );
        } catch (error) {
            console.error('❌ Error listing accounts:', error);
            throw error;
        }
    }

    async get(accountId: string): Promise<Account | null> {
        try {
            console.log('🔍 Getting account:', accountId);

            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `SYSTIVA#${accountId}`,
                SK: `ACCOUNT#${accountId}`,
            });

            if (!item) {
                console.log('❌ Account not found:', accountId);
                return null;
            }

            return {
                id: item.id || accountId,
                accountName: item.account_name || item.accountName || '',
                masterAccount: item.master_account || item.masterAccount || '',
                country: item.country || '',
                addressLine1: item.address_line1 || item.addressLine1 || '',
                technicalUsername:
                    item.technical_username || item.technicalUsername || '',
                licenses: item.licenses || item.services || [],
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

            // Store in snake_case for DynamoDB consistency
            const item = {
                PK: `SYSTIVA#${accountId}`,
                SK: `ACCOUNT#${accountId}`,
                id: accountId,
                account_name: accountData.accountName,
                master_account: accountData.masterAccount || '',
                country: accountData.country || '',
                address_line1: accountData.addressLine1 || '',
                technical_username: accountData.technicalUsername || '',
                licenses: (
                    (accountData as any).licenses ||
                    (accountData as any).services ||
                    []
                ).map((lic: any) => ({
                    enterprise: lic.enterprise || '',
                    product: lic.product || '',
                    service: lic.service || '',
                    license_start: lic.licenseStart || '',
                    license_end: lic.licenseEnd || '',
                    users: lic.users || 0,
                    renewal_notice: lic.renewalNotice || false,
                    notice_period: lic.noticePeriod || 0,
                    contacts: lic.contacts || [],
                })),
                created_date: now,
                updated_date: now,
                entity_type: 'account',
            };

            console.log(
                '📝 Account item to save:',
                JSON.stringify(item, null, 2),
            );

            await DynamoDBOperations.putItem(this.tableName, item);

            console.log('✅ Account created successfully');

            return {
                id: accountId,
                accountName: accountData.accountName,
                masterAccount: accountData.masterAccount,
                country: accountData.country,
                addressLine1: accountData.addressLine1,
                technicalUsername: accountData.technicalUsername,
                licenses:
                    (accountData as any).licenses ||
                    (accountData as any).services ||
                    [],
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

            // Only update fields in snake_case for consistency
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
            if (updates.country !== undefined) {
                updateFields.push('country = :country');
                expressionAttributeValues[':country'] = updates.country;
            }
            if (updates.addressLine1 !== undefined) {
                updateFields.push('address_line1 = :addressLine1');
                expressionAttributeValues[':addressLine1'] =
                    updates.addressLine1;
            }
            if (updates.technicalUsername !== undefined) {
                updateFields.push('technical_username = :technicalUsername');
                expressionAttributeValues[':technicalUsername'] =
                    updates.technicalUsername;
            }
            if (
                (updates as any).licenses !== undefined ||
                (updates as any).services !== undefined
            ) {
                // Map licenses/services to snake_case
                const mappedLicenses = (
                    (updates as any).licenses ||
                    (updates as any).services ||
                    []
                ).map((lic: any) => ({
                    enterprise: lic.enterprise || '',
                    product: lic.product || '',
                    service: lic.service || '',
                    license_start: lic.licenseStart || '',
                    license_end: lic.licenseEnd || '',
                    users: lic.users || 0,
                    renewal_notice: lic.renewalNotice || false,
                    notice_period: lic.noticePeriod || 0,
                    contacts: lic.contacts || [],
                }));
                updateFields.push('licenses = :licenses');
                expressionAttributeValues[':licenses'] = mappedLicenses;
            }

            if (updateFields.length === 0) {
                console.log('⚠️ No fields to update');
                return existingAccount;
            }

            const updateExpression = `SET ${updateFields.join(
                ', ',
            )}, updated_date = :updated`;

            console.log('📝 DynamoDB UpdateCommand:', {
                TableName: this.tableName,
                Key: {PK: `SYSTIVA#${accountId}`, SK: `ACCOUNT#${accountId}`},
                UpdateExpression: updateExpression,
                ExpressionAttributeValues: expressionAttributeValues,
                ExpressionAttributeNames:
                    Object.keys(expressionAttributeNames).length > 0
                        ? expressionAttributeNames
                        : undefined,
            });

            const result = await DynamoDBOperations.updateItem(
                this.tableName,
                {
                    PK: `SYSTIVA#${accountId}`,
                    SK: `ACCOUNT#${accountId}`,
                },
                updateExpression,
                expressionAttributeValues,
                Object.keys(expressionAttributeNames).length > 0
                    ? expressionAttributeNames
                    : undefined,
            );

            if (!result) {
                console.log('❌ No result returned from DynamoDB update');
                return null;
            }

            console.log('✅ Account updated successfully');

            return {
                id: result.id || accountId,
                accountName: result.account_name || result.accountName,
                masterAccount: result.master_account || result.masterAccount,
                country: result.country,
                addressLine1: result.address_line1 || result.addressLine1,
                technicalUsername:
                    result.technical_username || result.technicalUsername,
                licenses: result.licenses || result.services || [],
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('❌ Error updating account:', error);
            throw error;
        }
    }

    async remove(accountId: string): Promise<void> {
        try {
            console.log('🗑️ Deleting account:', accountId);

            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `SYSTIVA#${accountId}`,
                SK: `ACCOUNT#${accountId}`,
            });

            console.log('✅ Account deleted successfully');
        } catch (error) {
            console.error('❌ Error deleting account:', error);
            throw error;
        }
    }
}
