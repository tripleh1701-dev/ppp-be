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
            process.env.DYNAMODB_ENTERPRISE_TABLE || 'EnterpriseConfig';
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

            // Create the linkage record
            const linkageItem = {
                PK: `EPS#${linkageId}`,
                SK: 'METADATA',
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
                PK: `ENT#${body.enterpriseId}`,
                SK: `EPS#${linkageId}`,
                linkage_id: linkageId,
                product_id: body.productId,
                service_ids: body.serviceIds,
                created_date: now,
                entity_type: 'enterprise_linkage',
            };

            const productLookupItem = {
                PK: `PROD#${body.productId}`,
                SK: `EPS#${linkageId}`,
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
                    PK: `SVC#${serviceId}`,
                    SK: `EPS#${linkageId}`,
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
            const item = await DynamoDBOperations.getItem(this.tableName, {
                PK: `EPS#${id}`,
                SK: 'METADATA',
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
                    ':pk': `ENT#${enterpriseId}`,
                    ':sk': 'EPS#',
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
                    ':pk': `PROD#${productId}`,
                    ':sk': 'EPS#',
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
                    ':pk': `SVC#${serviceId}`,
                    ':sk': 'EPS#',
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
                // Get enterprise, product, and service names
                const [enterprise, product, ...services] = await Promise.all([
                    DynamoDBOperations.getItem(this.tableName, {
                        PK: `ENT#${linkage.enterpriseId}`,
                        SK: 'METADATA',
                    }),
                    DynamoDBOperations.getItem(this.tableName, {
                        PK: `PROD#${linkage.productId}`,
                        SK: 'METADATA',
                    }),
                    ...linkage.serviceIds.map((serviceId) =>
                        DynamoDBOperations.getItem(this.tableName, {
                            PK: `SVC#${serviceId}`,
                            SK: 'METADATA',
                        }),
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

            // Delete all related records
            const deletePromises = [
                // Main linkage record
                DynamoDBOperations.deleteItem(this.tableName, {
                    PK: `EPS#${id}`,
                    SK: 'METADATA',
                }),
                // Enterprise lookup
                DynamoDBOperations.deleteItem(this.tableName, {
                    PK: `ENT#${linkage.enterpriseId}`,
                    SK: `EPS#${id}`,
                }),
                // Product lookup
                DynamoDBOperations.deleteItem(this.tableName, {
                    PK: `PROD#${linkage.productId}`,
                    SK: `EPS#${id}`,
                }),
            ];

            // Service lookups
            for (const serviceId of linkage.serviceIds) {
                deletePromises.push(
                    DynamoDBOperations.deleteItem(this.tableName, {
                        PK: `SVC#${serviceId}`,
                        SK: `EPS#${id}`,
                    }),
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
            // For simplicity, we'll delete and recreate the linkage
            // In a production system, you might want to do a more granular update
            const existing = await this.get(id);
            if (!existing) {
                return null;
            }

            await this.remove(id);

            const updated = await this.create({
                enterpriseId: body.enterpriseId || existing.enterpriseId,
                productId: body.productId || existing.productId,
                serviceIds: body.serviceIds || existing.serviceIds,
            });

            return updated;
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
