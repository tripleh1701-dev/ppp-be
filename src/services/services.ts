import {withPg} from '../db';

export interface Service {
    id: number;
    name: string;
}

export class ServicesService {
    private readonly schema: string;

    constructor(dir: string) {
        this.schema = process.env.PGSCHEMA || 'acme'; // Use acme schema for existing tables
    }

    async list(): Promise<Service[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    service_id as id,
                    service_name as name
                from ${this.schema}.fnd_services
                order by service_name`,
            );
            return res.rows as Service[];
        });
        return rows;
    }

    async create(body: Omit<Service, 'id'>): Promise<Service> {
        console.log('ServicesService.create called with body:', body);

        console.log('Service data to insert:', body);

        const created = await withPg(async (c) => {
            const res = await c.query(
                `insert into ${this.schema}.fnd_services(
                    service_name
                ) values($1)
                returning service_id as id, service_name as name`,
                [body.name],
            );
            console.log('Insert result:', res.rows[0]);
            return res.rows[0] as Service;
        });

        console.log('Created service:', created);
        return created;
    }

    async update(
        id: number,
        body: Partial<Omit<Service, 'id'>>,
    ): Promise<Service | null> {
        const updated = await withPg(async (c) => {
            const setClauses: string[] = [];
            const values: any[] = [id];
            let paramIndex = 2;

            if (body.name !== undefined) {
                setClauses.push(`service_name = $${paramIndex++}`);
                values.push(body.name);
            }

            const sql = `update ${
                this.schema
            }.fnd_services set ${setClauses.join(
                ', ',
            )} where service_id = $1 returning *`;

            const res = await c.query(sql, values);
            return (res.rows[0] as Service) || null;
        });
        return updated;
    }

    async remove(id: number): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_services where service_id = $1`,
                [id],
            );
        });
    }

    async get(id: number): Promise<Service | null> {
        const row = await withPg(async (c) => {
            const res = await c.query(
                `select
                    service_id as id,
                    service_name as name
                from ${this.schema}.fnd_services
                where service_id = $1`,
                [id],
            );
            return (res.rows[0] as Service) || null;
        });
        return row;
    }

    async debugTableContents(): Promise<any> {
        const result = await withPg(async (c) => {
            const res = await c.query(
                `select count(*) as total_count,
                        array_agg(service_name) as names,
                        array_agg(service_id) as ids
                from ${this.schema}.fnd_services`,
            );
            return res.rows[0];
        });
        return result;
    }
}
