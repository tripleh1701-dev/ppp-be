import {DynamoDBOperations, withDynamoDB} from '../dynamodb';
import {v4 as uuidv4} from 'uuid';

export interface EnterpriseProductService {
    id: string; // Changed to string for DynamoDB
    enterpriseId: string;
    productId: string;
    serviceIds: string[]; // Array of service IDs
    createdAt?: string;
    updatedAt?: string;
}

export class EnterpriseProductsServicesDynamoDBService {
    private readonly tableName: string;

    constructor(dir?: string) {
        // Table name from environment or default
        this.tableName =
            process.env.DYNAMODB_TABLE ||
            `systiva-admin-${
                process.env.WORKSPACE || process.env.NODE_ENV || 'dev'
            }`;
    }

    async list(): Promise<EnterpriseProductService[]> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {
                    ':type': 'enterprise_product_service',
                },
            );

            // Transform DynamoDB items to EnterpriseProductService interface
            return items.map((item) => ({
                id: item.id || item.PK?.replace('EPS#', ''),
                enterpriseId: item.enterprise_id,
                productId: item.product_id,
                serviceIds: item.service_ids || [],
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            }));
        } catch (error) {
            console.error('Error listing enterprise-product-services:', error);
            throw error;
        }
    }

    async create(body: {
        enterpriseId: string;
        productId: string;
        serviceIds: string[];
    }): Promise<EnterpriseProductService> {
        try {
            const linkageId = uuidv4();
            const now = new Date().toISOString();

            // Create the linkage record - new pattern: LINKAGE#<id>
            const linkageItem = {
                PK: `LINKAGE#${linkageId}`,
                SK: `LINKAGE#${linkageId}`,
                id: linkageId,
                enterprise_id: body.enterpriseId,
                product_id: body.productId,
                service_ids: body.serviceIds,
                created_date: now,
                createdAt: now,
                updated_date: now,
                updatedAt: now,
                entity_type: 'enterprise_product_service',
            };

            // Also create reverse lookup records for easier querying
            const enterpriseLookupItem = {
                PK: `ENTERPRISE#${body.enterpriseId}`,
                SK: `LINKAGE#${linkageId}`,
                linkage_id: linkageId,
                product_id: body.productId,
                service_ids: body.serviceIds,
                created_date: now,
                entity_type: 'enterprise_linkage',
            };

            const productLookupItem = {
                PK: `PRODUCT#${body.productId}`,
                SK: `LINKAGE#${linkageId}`,
                linkage_id: linkageId,
                enterprise_id: body.enterpriseId,
                service_ids: body.serviceIds,
                created_date: now,
                entity_type: 'product_linkage',
            };

            // Insert all items
            await Promise.all([
                DynamoDBOperations.putItem(this.tableName, linkageItem),
                DynamoDBOperations.putItem(
                    this.tableName,
                    enterpriseLookupItem,
                ),
                DynamoDBOperations.putItem(this.tableName, productLookupItem),
            ]);

            // Create service lookup items for each service
            for (const serviceId of body.serviceIds) {
                const serviceLookupItem = {
                    PK: `SERVICE#${serviceId}`,
                    SK: `LINKAGE#${linkageId}`,
                    linkage_id: linkageId,
                    enterprise_id: body.enterpriseId,
                    product_id: body.productId,
                    created_date: now,
                    entity_type: 'service_linkage',
                };
                await DynamoDBOperations.putItem(
                    this.tableName,
                    serviceLookupItem,
                );
            }

            return {
                id: linkageId,
                enterpriseId: body.enterpriseId,
                productId: body.productId,
                serviceIds: body.serviceIds,
                createdAt: now,
                updatedAt: now,
            };
        } catch (error) {
            console.error(
                'Error creating enterprise-product-service linkage:',
                error,
            );
            throw error;
        }
    }

    async get(id: string): Promise<EnterpriseProductService | null> {
        try {
            // Get using LINKAGE# format
            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `LINKAGE#${id}`,
                SK: `LINKAGE#${id}`,
            });

            if (!item) {
                return null;
            }

            return {
                id: item.id || id,
                enterpriseId: item.enterprise_id,
                productId: item.product_id,
                serviceIds: item.service_ids || [],
                createdAt: item.created_date || item.createdAt,
                updatedAt: item.updated_date || item.updatedAt,
            };
        } catch (error) {
            console.error(
                'Error getting enterprise-product-service linkage:',
                error,
            );
            throw error;
        }
    }

    // Get all linkages for a specific enterprise
    async getByEnterprise(
        enterpriseId: string,
    ): Promise<EnterpriseProductService[]> {
        try {
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': `ENTERPRISE#${enterpriseId}`,
                    ':sk': 'LINKAGE#',
                },
            );

            // Get detailed information for each linkage
            const linkages: EnterpriseProductService[] = [];
            for (const item of items) {
                if (item.linkage_id) {
                    const linkage = await this.get(item.linkage_id);
                    if (linkage) {
                        linkages.push(linkage);
                    }
                }
            }

            return linkages;
        } catch (error) {
            console.error('Error getting linkages by enterprise:', error);
            throw error;
        }
    }

    // Get all linkages for a specific product
    async getByProduct(productId: string): Promise<EnterpriseProductService[]> {
        try {
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': `PRODUCT#${productId}`,
                    ':sk': 'LINKAGE#',
                },
            );

            // Get detailed information for each linkage
            const linkages: EnterpriseProductService[] = [];
            for (const item of items) {
                if (item.linkage_id) {
                    const linkage = await this.get(item.linkage_id);
                    if (linkage) {
                        linkages.push(linkage);
                    }
                }
            }

            return linkages;
        } catch (error) {
            console.error('Error getting linkages by product:', error);
            throw error;
        }
    }

    // Get all linkages for a specific service
    async getByService(serviceId: string): Promise<EnterpriseProductService[]> {
        try {
            const items = await DynamoDBOperations.queryItems(
                this.tableName,
                'PK = :pk AND begins_with(SK, :sk)',
                {
                    ':pk': `SERVICE#${serviceId}`,
                    ':sk': 'LINKAGE#',
                },
            );

            // Get detailed information for each linkage
            const linkages: EnterpriseProductService[] = [];
            for (const item of items) {
                if (item.linkage_id) {
                    const linkage = await this.get(item.linkage_id);
                    if (linkage) {
                        linkages.push(linkage);
                    }
                }
            }

            return linkages;
        } catch (error) {
            console.error('Error getting linkages by service:', error);
            throw error;
        }
    }

    // Get detailed information with names for a specific enterprise
    async getDetailedByEnterprise(enterpriseId: string): Promise<any[]> {
        try {
            const linkages = await this.getByEnterprise(enterpriseId);
            const detailed = [];

            for (const linkage of linkages) {
                // Get enterprise, product, and service names using new format
                const getEntity = async (entityType: string, id: string) => {
                    return DynamoDBOperations.getItem(this.tableName, {
                        PK: `${entityType}#${id}`,
                        SK: `${entityType}#${id}`,
                    });
                };

                const [enterprise, product, ...services] = await Promise.all([
                    getEntity('ENTERPRISE', linkage.enterpriseId),
                    getEntity('PRODUCT', linkage.productId),
                    ...linkage.serviceIds.map((serviceId) =>
                        getEntity('SERVICE', serviceId),
                    ),
                ]);

                detailed.push({
                    id: linkage.id,
                    enterprise: {
                        id: linkage.enterpriseId,
                        name:
                            enterprise?.enterprise_name ||
                            enterprise?.name ||
                            'Unknown',
                    },
                    product: {
                        id: linkage.productId,
                        name:
                            product?.product_name || product?.name || 'Unknown',
                    },
                    services: services.map((svc, index) => ({
                        id: linkage.serviceIds[index],
                        name: svc?.service_name || svc?.name || 'Unknown',
                    })),
                    createdAt: linkage.createdAt,
                    updatedAt: linkage.updatedAt,
                });
            }

            return detailed;
        } catch (error) {
            console.error(
                'Error getting detailed linkages by enterprise:',
                error,
            );
            throw error;
        }
    }

    async remove(id: string): Promise<void> {
        try {
            // Get the linkage first to know what to clean up
            const linkage = await this.get(id);
            if (!linkage) {
                return;
            }

            // Delete all related records using new format
            const deletePromises = [
                // Main linkage record
                DynamoDBOperations.deleteItem(this.tableName, {
                    PK: `LINKAGE#${id}`,
                    SK: `LINKAGE#${id}`,
                }).catch(() => {}),
                // Enterprise lookup
                DynamoDBOperations.deleteItem(this.tableName, {
                    PK: `ENTERPRISE#${linkage.enterpriseId}`,
                    SK: `LINKAGE#${id}`,
                }).catch(() => {}),
                // Product lookup
                DynamoDBOperations.deleteItem(this.tableName, {
                    PK: `PRODUCT#${linkage.productId}`,
                    SK: `LINKAGE#${id}`,
                }).catch(() => {}),
            ];

            // Service lookups
            for (const serviceId of linkage.serviceIds) {
                deletePromises.push(
                    DynamoDBOperations.deleteItem(this.tableName, {
                        PK: `SERVICE#${serviceId}`,
                        SK: `LINKAGE#${id}`,
                    }).catch(() => {}),
                );
            }

            await Promise.all(deletePromises);
        } catch (error) {
            console.error(
                'Error removing enterprise-product-service linkage:',
                error,
            );
            throw error;
        }
    }

    // Create or update a linkage
    async createOrUpdate(body: {
        enterpriseId: string;
        productId: string;
        serviceIds: string[];
    }): Promise<EnterpriseProductService> {
        try {
            // Check if linkage already exists for this enterprise-product combination
            const existingLinkages = await this.getByEnterprise(
                body.enterpriseId,
            );
            const existing = existingLinkages.find(
                (l) => l.productId === body.productId,
            );

            if (existing) {
                // Update existing linkage
                const updated = await this.update(existing.id, body);
                if (!updated) {
                    throw new Error('Failed to update existing linkage');
                }
                return updated;
            } else {
                // Create new linkage
                return await this.create(body);
            }
        } catch (error) {
            console.error('Error in createOrUpdate:', error);
            throw error;
        }
    }

    async update(
        id: string,
        body: {
            enterpriseId?: string;
            productId?: string;
            serviceIds?: string[];
        },
    ): Promise<EnterpriseProductService | null> {
        try {
            // Get existing linkage to preserve ID and timestamps
            const existing = await this.get(id);
            if (!existing) {
                return null;
            }

            const now = new Date().toISOString();
            const newEnterpriseId = body.enterpriseId || existing.enterpriseId;
            const newProductId = body.productId || existing.productId;
            const newServiceIds = body.serviceIds || existing.serviceIds;

            // Check if enterprise or product changed - if so, we need to update lookup records
            const enterpriseChanged = newEnterpriseId !== existing.enterpriseId;
            const productChanged = newProductId !== existing.productId;
            const servicesChanged =
                JSON.stringify(newServiceIds.sort()) !==
                JSON.stringify(existing.serviceIds.sort());

            // Update the main linkage record in-place (preserving the same ID)
            const updateResult = await withDynamoDB(async (client) => {
                const {UpdateCommand} = await import('@aws-sdk/lib-dynamodb');
                const response = await client.send(
                    new UpdateCommand({
                        TableName: this.tableName,
                        Key: {
                            PK: `LINKAGE#${id}`,
                            SK: `LINKAGE#${id}`,
                        },
                        UpdateExpression:
                            'SET enterprise_id = :eid, product_id = :pid, service_ids = :sids, updated_date = :updated, updatedAt = :updated',
                        ExpressionAttributeValues: {
                            ':eid': newEnterpriseId,
                            ':pid': newProductId,
                            ':sids': newServiceIds,
                            ':updated': now,
                        },
                        ReturnValues: 'ALL_NEW',
                    }),
                );
                return response.Attributes;
            });

            // If enterprise changed, update enterprise lookup records
            if (enterpriseChanged) {
                // Delete old enterprise lookup
                await DynamoDBOperations.deleteItem(this.tableName, {
                    PK: `ENTERPRISE#${existing.enterpriseId}`,
                    SK: `LINKAGE#${id}`,
                }).catch(() => {});

                // Create new enterprise lookup
                await DynamoDBOperations.putItem(this.tableName, {
                    PK: `ENTERPRISE#${newEnterpriseId}`,
                    SK: `LINKAGE#${id}`,
                    linkage_id: id,
                    product_id: newProductId,
                    service_ids: newServiceIds,
                    created_date: existing.createdAt,
                    updated_date: now,
                    entity_type: 'enterprise_linkage',
                });
            } else {
                // Just update the existing enterprise lookup
                await withDynamoDB(async (client) => {
                    const {UpdateCommand} = await import(
                        '@aws-sdk/lib-dynamodb'
                    );
                    await client.send(
                        new UpdateCommand({
                            TableName: this.tableName,
                            Key: {
                                PK: `ENTERPRISE#${newEnterpriseId}`,
                                SK: `LINKAGE#${id}`,
                            },
                            UpdateExpression:
                                'SET product_id = :pid, service_ids = :sids, updated_date = :updated',
                            ExpressionAttributeValues: {
                                ':pid': newProductId,
                                ':sids': newServiceIds,
                                ':updated': now,
                            },
                        }),
                    );
                }).catch(() => {});
            }

            // If product changed, update product lookup records
            if (productChanged) {
                // Delete old product lookup
                await DynamoDBOperations.deleteItem(this.tableName, {
                    PK: `PRODUCT#${existing.productId}`,
                    SK: `LINKAGE#${id}`,
                }).catch(() => {});

                // Create new product lookup
                await DynamoDBOperations.putItem(this.tableName, {
                    PK: `PRODUCT#${newProductId}`,
                    SK: `LINKAGE#${id}`,
                    linkage_id: id,
                    enterprise_id: newEnterpriseId,
                    service_ids: newServiceIds,
                    created_date: existing.createdAt,
                    updated_date: now,
                    entity_type: 'product_linkage',
                });
            } else {
                // Just update the existing product lookup
                await withDynamoDB(async (client) => {
                    const {UpdateCommand} = await import(
                        '@aws-sdk/lib-dynamodb'
                    );
                    await client.send(
                        new UpdateCommand({
                            TableName: this.tableName,
                            Key: {
                                PK: `PRODUCT#${newProductId}`,
                                SK: `LINKAGE#${id}`,
                            },
                            UpdateExpression:
                                'SET enterprise_id = :eid, service_ids = :sids, updated_date = :updated',
                            ExpressionAttributeValues: {
                                ':eid': newEnterpriseId,
                                ':sids': newServiceIds,
                                ':updated': now,
                            },
                        }),
                    );
                }).catch(() => {});
            }

            // If services changed, update service lookup records
            if (servicesChanged) {
                // Delete old service lookups
                for (const serviceId of existing.serviceIds) {
                    await DynamoDBOperations.deleteItem(this.tableName, {
                        PK: `SERVICE#${serviceId}`,
                        SK: `LINKAGE#${id}`,
                    }).catch(() => {});
                }

                // Create new service lookups
                for (const serviceId of newServiceIds) {
                    await DynamoDBOperations.putItem(this.tableName, {
                        PK: `SERVICE#${serviceId}`,
                        SK: `LINKAGE#${id}`,
                        linkage_id: id,
                        enterprise_id: newEnterpriseId,
                        product_id: newProductId,
                        created_date: existing.createdAt,
                        updated_date: now,
                        entity_type: 'service_linkage',
                    });
                }
            }

            console.log(
                `✅ Updated linkage ${id} in-place (ID preserved). Enterprise: ${newEnterpriseId}, Product: ${newProductId}`,
            );

            return {
                id: id, // SAME ID - preserved!
                enterpriseId: newEnterpriseId,
                productId: newProductId,
                serviceIds: newServiceIds,
                createdAt: existing.createdAt,
                updatedAt: now,
            };
        } catch (error) {
            console.error(
                'Error updating enterprise-product-service linkage:',
                error,
            );
            throw error;
        }
    }

    // Debug method to check table contents
    async debugTableContents(): Promise<any> {
        try {
            const items = await DynamoDBOperations.scanItems(
                this.tableName,
                'entity_type = :type',
                {
                    ':type': 'enterprise_product_service',
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
