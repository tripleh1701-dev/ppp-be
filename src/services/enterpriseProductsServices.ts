import {withPg} from '../db';

export interface EnterpriseProductService {
    id: number;
    enterpriseId: number;
    productId: number;
    serviceId: number;
}

export class EnterpriseProductsServicesService {
    private readonly schema: string;

    constructor(dir: string) {
        this.schema = process.env.PGSCHEMA || 'acme'; // Use acme schema for existing tables
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
        console.log(
            'EnterpriseProductsServicesService.create called with body:',
            body,
        );
        console.log('Schema being used:', this.schema);

        try {
            const created = await withPg(async (c) => {
                console.log('Executing insert query...');
                const res = await c.query(
                    `insert into ${this.schema}.fnd_enterprise_products_services(
                        enterprise_id, product_id, service_id
                    ) values($1, $2, $3)
                    returning id, enterprise_id as "enterpriseId", product_id as "productId", service_id as "serviceId"`,
                    [body.enterpriseId, body.productId, body.serviceId],
                );
                console.log('Insert result:', res.rows[0]);
                return res.rows[0] as EnterpriseProductService;
            });

            console.log('Created linkage:', created);
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
                setClauses.push(`service_id = $${paramIndex++}`);
                values.push(body.serviceId);
            }

            const sql = `update ${
                this.schema
            }.fnd_enterprise_products_services set ${setClauses.join(
                ', ',
            )} where id = $1 returning *`;

            const res = await c.query(sql, values);
            return (res.rows[0] as EnterpriseProductService) || null;
        });
        return updated;
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
                where service_id = $1
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
                    s.service_name as "serviceName"
                from ${this.schema}.fnd_enterprise_products_services eps
                join ${this.schema}.fnd_enterprise e on eps.enterprise_id = e.enterprise_id
                join ${this.schema}.fnd_products p on eps.product_id = p.product_id
                join ${this.schema}.fnd_services s on eps.service_id = s.service_id
                where eps.enterprise_id = $1
                order by eps.id`,
                [enterpriseId],
            );
            return res.rows;
        });
        return rows;
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
