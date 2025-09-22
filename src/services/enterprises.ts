import {withPg} from '../db';

export interface Enterprise {
    id: number;
    name: string;
}

export class EnterprisesService {
    private readonly schema: string;

    constructor(dir: string) {
        this.schema = process.env.PGSCHEMA || 'systiva'; // Use systiva schema for existing tables
    }

    async list(): Promise<Enterprise[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    enterprise_id as id,
                    enterprise_name as name
                from ${this.schema}.fnd_enterprise
                order by enterprise_name`,
            );
            return res.rows as Enterprise[];
        });
        return rows;
    }

    async create(body: Omit<Enterprise, 'id'>): Promise<Enterprise> {
        const created = await withPg(async (c) => {
            const res = await c.query(
                `insert into ${this.schema}.fnd_enterprise(
                    enterprise_name
                ) values($1)
                returning enterprise_id as id, enterprise_name as name`,
                [body.name],
            );
            return res.rows[0] as Enterprise;
        });
        return created;
    }

    async update(
        id: number,
        body: Omit<Enterprise, 'id'>,
    ): Promise<Enterprise | null> {
        console.log(`Updating enterprise with ID: ${id}`);

        const updated = await withPg(async (c) => {
            const res = await c.query(
                `update ${this.schema}.fnd_enterprise set
                    enterprise_name = $2
                where enterprise_id = $1
                returning enterprise_id as id, enterprise_name as name`,
                [id, body.name],
            );
            return (res.rows[0] as Enterprise) || null;
        });
        return updated;
    }

    async remove(id: number): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_enterprise where enterprise_id = $1`,
                [id],
            );
        });
    }

    async get(id: number): Promise<Enterprise | null> {
        const row = await withPg(async (c) => {
            const res = await c.query(
                `select
                    enterprise_id as id,
                    enterprise_name as name
                from ${this.schema}.fnd_enterprise
                where enterprise_id = $1`,
                [id],
            );
            return (res.rows[0] as Enterprise) || null;
        });
        return row;
    }
}
