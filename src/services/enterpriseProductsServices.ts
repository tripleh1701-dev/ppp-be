import {withPg} from '../db';

export interface EnterpriseProductService {
    id: number;
    enterpriseId: number;
    productId: number;
    serviceId: number[]; // Array of service IDs
}

export class EnterpriseProductsServicesService {
    private readonly schema: string;

    constructor(dir: string) {
        this.schema = process.env.PGSCHEMA || 'systiva'; // Use systiva schema for existing tables
    }

    // Check if table exists and get its structure
    async checkTableStructure(): Promise<any> {
        try {
            const result = await withPg(async (c) => {
                // Check if table exists
                const tableExists = await c.query(
                    `SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_schema = $1
                        AND table_name = 'fnd_enterprise_products_services'
                    )`,
                    [this.schema],
                );

                if (!tableExists.rows[0].exists) {
                    return {
                        error: 'Table does not exist',
                        schema: this.schema,
                        table: 'fnd_enterprise_products_services',
                    };
                }

                // Get table structure
                const structure = await c.query(
                    `SELECT column_name, data_type, is_nullable, column_default
                     FROM information_schema.columns
                     WHERE table_schema = $1
                     AND table_name = 'fnd_enterprise_products_services'
                     ORDER BY ordinal_position`,
                    [this.schema],
                );

                return {
                    tableExists: true,
                    schema: this.schema,
                    table: 'fnd_enterprise_products_services',
                    structure: structure.rows,
                };
            });
            return result;
        } catch (error) {
            console.error('Error checking table structure:', error);
            return {error: (error as Error).message};
        }
    }

    async list(): Promise<EnterpriseProductService[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    id,
                    enterprise_id as "enterpriseId",
                    product_id as "productId",
                    service_id as "serviceId"
                from ${this.schema}.fnd_enterprise_products_services
                order by id`,
            );
            return res.rows as EnterpriseProductService[];
        });
        return rows;
    }

    async create(
        body: Omit<EnterpriseProductService, 'id'>,
    ): Promise<EnterpriseProductService> {
        try {
            const created = await withPg(async (c) => {
                // Ensure serviceId is always an array for PostgreSQL array column
                let serviceIdArray = body.serviceId;
                if (!Array.isArray(body.serviceId)) {
                    serviceIdArray = [body.serviceId];
                }

                const res = await c.query(
                    `insert into ${this.schema}.fnd_enterprise_products_services(
                        enterprise_id, product_id, service_id
                    ) values($1, $2, $3)
                    returning id, enterprise_id as "enterpriseId", product_id as "productId", service_id as "serviceId"`,
                    [body.enterpriseId, body.productId, serviceIdArray],
                );
                return res.rows[0] as EnterpriseProductService;
            });

            return created;
        } catch (error) {
            console.error(
                'Error creating enterprise-product-service linkage:',
                error,
            );
            throw error;
        }
    }

    async update(
        id: number,
        body: Partial<Omit<EnterpriseProductService, 'id'>>,
    ): Promise<EnterpriseProductService | null> {
        try {
            const updated = await withPg(async (c) => {
                const setClauses: string[] = [];
                const values: any[] = [id];
                let paramIndex = 2;

                if (body.enterpriseId !== undefined) {
                    setClauses.push(`enterprise_id = $${paramIndex++}`);
                    values.push(body.enterpriseId);
                }
                if (body.productId !== undefined) {
                    setClauses.push(`product_id = $${paramIndex++}`);
                    values.push(body.productId);
                }
                if (body.serviceId !== undefined) {
                    // Ensure serviceId is always an array for PostgreSQL array column
                    let serviceIdArray = body.serviceId;

                    if (!Array.isArray(body.serviceId)) {
                        serviceIdArray = [body.serviceId];
                    }

                    setClauses.push(`service_id = $${paramIndex++}`);
                    values.push(serviceIdArray);
                }

                if (setClauses.length === 0) {
                    return null;
                }

                const sql = `update ${
                    this.schema
                }.fnd_enterprise_products_services set ${setClauses.join(
                    ', ',
                )} where id = $1 returning id, enterprise_id as "enterpriseId", product_id as "productId", service_id as "serviceId"`;

                const res = await c.query(sql, values);
                return (res.rows[0] as EnterpriseProductService) || null;
            });

            return updated;
        } catch (error) {
            console.error(
                'Error in EnterpriseProductsServicesService.update():',
                error,
            );
            throw error;
        }
    }

    async remove(id: number): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_enterprise_products_services where id = $1`,
                [id],
            );
        });
    }

    async get(id: number): Promise<EnterpriseProductService | null> {
        const row = await withPg(async (c) => {
            const res = await c.query(
                `select
                    id,
                    enterprise_id as "enterpriseId",
                    product_id as "productId",
                    service_id as "serviceId"
                from ${this.schema}.fnd_enterprise_products_services
                where id = $1`,
                [id],
            );
            return (res.rows[0] as EnterpriseProductService) || null;
        });
        return row;
    }

    // Get all linkages for a specific enterprise
    async getByEnterprise(
        enterpriseId: number,
    ): Promise<EnterpriseProductService[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    id,
                    enterprise_id as "enterpriseId",
                    product_id as "productId",
                    service_id as "serviceId"
                from ${this.schema}.fnd_enterprise_products_services
                where enterprise_id = $1
                order by id`,
                [enterpriseId],
            );
            return res.rows as EnterpriseProductService[];
        });
        return rows;
    }

    // Get all linkages for a specific product
    async getByProduct(productId: number): Promise<EnterpriseProductService[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    id,
                    enterprise_id as "enterpriseId",
                    product_id as "productId",
                    service_id as "serviceId"
                from ${this.schema}.fnd_enterprise_products_services
                where product_id = $1
                order by id`,
                [productId],
            );
            return res.rows as EnterpriseProductService[];
        });
        return rows;
    }

    // Get all linkages for a specific service
    async getByService(serviceId: number): Promise<EnterpriseProductService[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    id,
                    enterprise_id as "enterpriseId",
                    product_id as "productId",
                    service_id as "serviceId"
                from ${this.schema}.fnd_enterprise_products_services
                where $1 = ANY(service_id)
                order by id`,
                [serviceId],
            );
            return res.rows as EnterpriseProductService[];
        });
        return rows;
    }

    // Get detailed information with names
    async getDetailedByEnterprise(enterpriseId: number): Promise<any[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    eps.id,
                    eps.enterprise_id as "enterpriseId",
                    e.enterprise_name as "enterpriseName",
                    eps.product_id as "productId",
                    p.product_name as "productName",
                    eps.service_id as "serviceId",
                    array_agg(s.service_name) as "serviceNames"
                from ${this.schema}.fnd_enterprise_products_services eps
                join ${this.schema}.fnd_enterprise e on eps.enterprise_id = e.enterprise_id
                join ${this.schema}.fnd_products p on eps.product_id = p.product_id
                left join ${this.schema}.fnd_services s on s.service_id = ANY(eps.service_id)
                where eps.enterprise_id = $1
                group by eps.id, eps.enterprise_id, e.enterprise_name, eps.product_id, p.product_name, eps.service_id
                order by eps.id`,
                [enterpriseId],
            );
            return res.rows;
        });
        return rows;
    }

    // Find existing enterprise-product combination
    async findByEnterpriseAndProduct(
        enterpriseId: number,
        productId: number,
    ): Promise<EnterpriseProductService | null> {
        const row = await withPg(async (c) => {
            const res = await c.query(
                `select
                    id,
                    enterprise_id as "enterpriseId",
                    product_id as "productId",
                    service_id as "serviceId"
                from ${this.schema}.fnd_enterprise_products_services
                where enterprise_id = $1 AND product_id = $2`,
                [enterpriseId, productId],
            );
            return (res.rows[0] as EnterpriseProductService) || null;
        });
        return row;
    }

    // Create or update enterprise-product-services combination
    async createOrUpdate(
        body: Omit<EnterpriseProductService, 'id'>,
    ): Promise<EnterpriseProductService> {
        console.log('createOrUpdate called with:', body);

        // Check if enterprise-product combination already exists
        const existing = await this.findByEnterpriseAndProduct(
            body.enterpriseId,
            body.productId,
        );
        console.log('Existing record found:', existing);

        if (existing) {
            // Ensure both existing and new serviceIds are arrays
            const existingServiceIds = Array.isArray(existing.serviceId)
                ? existing.serviceId
                : [existing.serviceId];
            const newServiceIds = Array.isArray(body.serviceId)
                ? body.serviceId
                : [body.serviceId];

            // Merge the service IDs
            const mergedServiceIds = Array.from(
                new Set([...existingServiceIds, ...newServiceIds]),
            );
            console.log('Merging services:', {
                existing: existing.serviceId,
                new: body.serviceId,
                merged: mergedServiceIds,
            });

            const updated = (await this.update(existing.id, {
                serviceId: mergedServiceIds,
            })) as EnterpriseProductService;
            console.log('Updated record:', updated);
            return updated;
        } else {
            // Create new record
            console.log('Creating new record');
            const created = await this.create(body);
            console.log('Created record:', created);
            return created;
        }
    }

    // Consolidate duplicate enterprise-product combinations
    async consolidateDuplicates(): Promise<void> {
        console.log('Starting consolidation of duplicate records...');

        // Find all enterprise-product combinations that have multiple records
        const duplicates = await withPg(async (c) => {
            const res = await c.query(
                `select
                    enterprise_id,
                    product_id,
                    array_agg(id) as ids,
                    array_agg(service_id) as service_arrays
                from ${this.schema}.fnd_enterprise_products_services
                group by enterprise_id, product_id
                having count(*) > 1`,
            );
            return res.rows;
        });

        console.log(`Found ${duplicates.length} duplicate combinations`);

        for (const duplicate of duplicates) {
            const {enterprise_id, product_id, ids, service_arrays} = duplicate;

            // Flatten and deduplicate all service IDs
            const allServiceIds = service_arrays
                .reduce((acc: number[], current: number[]) => {
                    if (Array.isArray(current)) {
                        return acc.concat(current);
                    } else if (current !== null && current !== undefined) {
                        return acc.concat([current]);
                    }
                    return acc;
                }, [])
                .filter((id: number) => id !== null && id !== undefined);
            const uniqueServiceIds = Array.from(new Set(allServiceIds));

            console.log(
                `Consolidating enterprise ${enterprise_id}, product ${product_id}:`,
                {
                    recordIds: ids,
                    allServices: allServiceIds,
                    uniqueServices: uniqueServiceIds,
                },
            );

            await withPg(async (c) => {
                // Begin transaction
                await c.query('BEGIN');

                try {
                    // Delete all existing records for this combination
                    await c.query(
                        `delete from ${this.schema}.fnd_enterprise_products_services
                         where enterprise_id = $1 and product_id = $2`,
                        [enterprise_id, product_id],
                    );

                    // Create a single consolidated record
                    await c.query(
                        `insert into ${this.schema}.fnd_enterprise_products_services(
                            enterprise_id, product_id, service_id
                        ) values($1, $2, $3)`,
                        [enterprise_id, product_id, uniqueServiceIds],
                    );

                    await c.query('COMMIT');
                    console.log(
                        `Consolidated enterprise ${enterprise_id}, product ${product_id}`,
                    );
                } catch (error) {
                    await c.query('ROLLBACK');
                    console.error(
                        `Failed to consolidate enterprise ${enterprise_id}, product ${product_id}:`,
                        error,
                    );
                    throw error;
                }
            });
        }

        console.log('Consolidation completed');
    }

    // Remove all linkages for a specific enterprise
    async removeByEnterprise(enterpriseId: number): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_enterprise_products_services where enterprise_id = $1`,
                [enterpriseId],
            );
        });
    }

    // Remove all linkages for a specific product
    async removeByProduct(productId: number): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_enterprise_products_services where product_id = $1`,
                [productId],
            );
        });
    }

    // Remove all linkages for a specific service
    async removeByService(serviceId: number): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_enterprise_products_services where service_id = $1`,
                [serviceId],
            );
        });
    }

    // Debug method to check table contents
    async debugTableContents(): Promise<any> {
        const result = await withPg(async (c) => {
            const res = await c.query(
                `select count(*) as total_count,
                        array_agg(id) as ids,
                        array_agg(enterprise_id) as enterprise_ids,
                        array_agg(product_id) as product_ids,
                        array_agg(service_id) as service_ids
                from ${this.schema}.fnd_enterprise_products_services`,
            );
            return res.rows[0];
        });
        return result;
    }
}
