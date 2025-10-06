import {DynamoDBOperations} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';

export interface AccountLicense {
    id: string;
    accountId: string;
    accountName: string;
    enterpriseId: string;
    enterpriseName: string;
    productId: string;
    productName: string;
    serviceId: string;
    serviceName: string;
    licenseStart: string;
    licenseEnd: string;
    createdAt?: string;
    updatedAt?: string;
}

export class AccountLicensesDynamoDBService {
    private readonly tableName: string;

    constructor() {
        // Use sys_accounts table for storing license information
        this.tableName =
            process.env.DYNAMODB_SYS_ACCOUNTS_TABLE || 'sys_accounts';
    }

    /**
     * Sync enterprise-product-service data to account
     * This creates license entries in sys_accounts table based on linkage data
     */
    async syncToAccount(params: {
        accountId: string;
        accountName: string;
        enterpriseId: string;
        enterpriseName: string;
        productId: string;
        productName: string;
        serviceId: string;
        serviceName: string;
        licenseStart?: string;
        licenseEnd?: string;
    }): Promise<AccountLicense> {
        try {
            const licenseId = uuidv4();
            const now = new Date().toISOString();

            // Default license period: 1 year from now
            const licenseStart = params.licenseStart || now;
            const licenseEnd =
                params.licenseEnd ||
                new Date(
                    new Date(licenseStart).setFullYear(
                        new Date(licenseStart).getFullYear() + 1,
                    ),
                ).toISOString();

            const item = {
                PK: `SYSTIVA#${params.accountId}#ACCOUNT`,
                SK: `LICENSE#${licenseId}`,
                id: licenseId,
                account_id: params.accountId,
                account_name: params.accountName,
                enterprise_id: params.enterpriseId,
                enterprise_name: params.enterpriseName,
                product_id: params.productId,
                product_name: params.productName,
                service_id: params.serviceId,
                service_name: params.serviceName,
                license_start: licenseStart,
                license_end: licenseEnd,
                created_date: now,
                createdAt: now,
                updated_date: now,
                updatedAt: now,
                entity_type: 'account_license',
            };

            await DynamoDBOperations.putItem(this.tableName, item);

            return {
                id: licenseId,
                accountId: params.accountId,
                accountName: params.accountName,
                enterpriseId: params.enterpriseId,
                enterpriseName: params.enterpriseName,
                productId: params.productId,
                productName: params.productName,
                serviceId: params.serviceId,
                serviceName: params.serviceName,
                licenseStart,
                licenseEnd,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error('Error syncing enterprise data to account:', error);
            throw error;
        }
    }

    /**
     * Sync full enterprise-product-services linkage to account
     * Creates license entries for each service in the linkage
     */
    async syncLinkageToAccount(params: {
        accountId: string;
        accountName: string;
        enterpriseId: string;
        enterpriseName: string;
        productId: string;
        productName: string;
        services: Array<{id: string; name: string}>;
        licenseStart?: string;
        licenseEnd?: string;
    }): Promise<AccountLicense[]> {
        try {
            const licenses: AccountLicense[] = [];

            for (const service of params.services) {
                const license = await this.syncToAccount({
                    accountId: params.accountId,
                    accountName: params.accountName,
                    enterpriseId: params.enterpriseId,
                    enterpriseName: params.enterpriseName,
                    productId: params.productId,
                    productName: params.productName,
                    serviceId: service.id,
                    serviceName: service.name,
                    licenseStart: params.licenseStart,
                    licenseEnd: params.licenseEnd,
                });
                licenses.push(license);
            }

            return licenses;
        } catch (error) {
            console.error('Error syncing linkage to account:', error);
            throw error;
        }
    }

    /**
     * Get all licenses for a specific account
     */
    async getByAccount(accountId: string): Promise<AccountLicense[]> {
        try {
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': `SYSTIVA#${accountId}#ACCOUNT`,
                    ':sk': 'LICENSE#',
                },
            );

            return items.map((item) => ({
                id: item.id,
                accountId: item.account_id,
                accountName: item.account_name,
                enterpriseId: item.enterprise_id,
                enterpriseName: item.enterprise_name,
                productId: item.product_id,
                productName: item.product_name,
                serviceId: item.service_id,
                serviceName: item.service_name,
                licenseStart: item.license_start,
                licenseEnd: item.license_end,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            }));
        } catch (error) {
            console.error('Error getting licenses by account:', error);
            throw error;
        }
    }

    /**
     * Get a specific license
     */
    async get(
        accountId: string,
        licenseId: string,
    ): Promise<AccountLicense | null> {
        try {
            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `SYSTIVA#${accountId}#ACCOUNT`,
                SK: `LICENSE#${licenseId}`,
            });

            if (!item) {
                return null;
            }

            return {
                id: item.id,
                accountId: item.account_id,
                accountName: item.account_name,
                enterpriseId: item.enterprise_id,
                enterpriseName: item.enterprise_name,
                productId: item.product_id,
                productName: item.product_name,
                serviceId: item.service_id,
                serviceName: item.service_name,
                licenseStart: item.license_start,
                licenseEnd: item.license_end,
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error('Error getting license:', error);
            throw error;
        }
    }

    /**
     * Remove a license
     */
    async remove(accountId: string, licenseId: string): Promise<void> {
        try {
            await DynamoDBOperations.deleteItem(this.tableName, {
                PK: `SYSTIVA#${accountId}#ACCOUNT`,
                SK: `LICENSE#${licenseId}`,
            });
        } catch (error) {
            console.error('Error removing license:', error);
            throw error;
        }
    }

    /**
     * Update license period
     */
    async updateLicensePeriod(
        accountId: string,
        licenseId: string,
        licenseStart: string,
        licenseEnd: string,
    ): Promise<AccountLicense | null> {
        try {
            const now = new Date().toISOString();

            const updateExpression =
                'SET license_start = :start, license_end = :end, updated_date = :updated, updatedAt = :updated';
            const expressionAttributeValues = {
                ':start': licenseStart,
                ':end': licenseEnd,
                ':updated': now,
            };

            const result = await DynamoDBOperations.updateItem(
                this.tableName,
                {
                    PK: `SYSTIVA#${accountId}#ACCOUNT`,
                    SK: `LICENSE#${licenseId}`,
                },
                updateExpression,
                expressionAttributeValues,
            );

            if (!result) {
                return null;
            }

            return {
                id: result.id,
                accountId: result.account_id,
                accountName: result.account_name,
                enterpriseId: result.enterprise_id,
                enterpriseName: result.enterprise_name,
                productId: result.product_id,
                productName: result.product_name,
                serviceId: result.service_id,
                serviceName: result.service_name,
                licenseStart: result.license_start,
                licenseEnd: result.license_end,
                createdAt: result.created_date || result.createdAt,
                updatedAt: result.updated_date || result.updatedAt,
            };
        } catch (error) {
            console.error('Error updating license period:', error);
            throw error;
        }
    }

    /**
     * Debug method to check table contents
     */
    async debugTableContents(): Promise<any> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {
                    ':type': 'account_license',
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
