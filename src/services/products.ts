import {withPg} from '../db';

export interface Product {
    id: number;
    name: string;
}

export class ProductsService {
    private readonly schema: string;

    constructor(dir: string) {
        this.schema = process.env.PGSCHEMA || 'systiva'; // Use systiva schema for existing tables
    }

    async list(): Promise<Product[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    product_id as id,
                    product_name as name
                from ${this.schema}.fnd_products
                order by product_name`,
            );
            return res.rows as Product[];
        });
        return rows;
    }

    async create(body: Omit<Product, 'id'>): Promise<Product> {
        const created = await withPg(async (c) => {
            const res = await c.query(
                `insert into ${this.schema}.fnd_products(
                    product_name
                ) values($1)
                returning product_id as id, product_name as name`,
                [body.name],
            );
            return res.rows[0] as Product;
        });
        return created;
    }

    async update(id: number, body: Partial<Omit<Product, 'id'>>): Promise<Product | null> {
        const updated = await withPg(async (c) => {
            const setClauses: string[] = [];
            const values: any[] = [id];
            let paramIndex = 2;

            if (body.name !== undefined) {
                setClauses.push(`product_name = $${paramIndex++}`);
                values.push(body.name);
            }

            const sql = `update ${this.schema}.fnd_products set ${setClauses.join(', ')} where product_id = $1 returning *`;
            
            const res = await c.query(sql, values);
            return (res.rows[0] as Product) || null;
        });
        return updated;
    }

    async remove(id: number): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_products where product_id = $1`,
                [id],
            );
        });
    }

    async get(id: number): Promise<Product | null> {
        const row = await withPg(async (c) => {
            const res = await c.query(
                `select
                    product_id as id,
                    product_name as name
                from ${this.schema}.fnd_products
                where product_id = $1`,
                [id],
            );
            return res.rows[0] as Product || null;
        });
        return row;
    }
}
