import {withPg} from '../db';

export interface BUSetting {
    id: number;
    clientId: string;
    enterpriseId: string;
    entities: string[];
    createdBy?: string;
    creationDate?: string;
    lastUpdatedBy?: string;
    lastUpdateDate?: string;
}

export class BusinessUnitsService {
    private readonly schema: string;

    constructor(dir: string) {
        this.schema = process.env.PGSCHEMA || 'systiva'; // Use systiva schema for existing tables
    }

    async list(): Promise<BUSetting[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    bu_id as id,
                    client_id as "clientId",
                    enterprise_id as "enterpriseId",
                    entities,
                    created_by as "createdBy",
                    creation_date as "creationDate",
                    last_updated_by as "lastUpdatedBy",
                    last_update_date as "lastUpdateDate"
                from ${this.schema}.fnd_business_unit_settings
                order by creation_date desc`,
            );
            return res.rows as BUSetting[];
        });
        return rows;
    }

    async create(body: Omit<BUSetting, 'id' | 'creationDate' | 'lastUpdateDate'>): Promise<BUSetting> {
        const created = await withPg(async (c) => {
            const res = await c.query(
                `insert into ${this.schema}.fnd_business_unit_settings(
                    client_id, enterprise_id, entities, created_by, last_updated_by
                ) values($1, $2, $3, $4, $5)
                returning bu_id as id, client_id as "clientId", enterprise_id as "enterpriseId", entities, created_by as "createdBy", creation_date as "creationDate", last_updated_by as "lastUpdatedBy", last_update_date as "lastUpdateDate"`,
                [
                    body.clientId,
                    body.enterpriseId,
                    body.entities,
                    body.createdBy || null,
                    body.lastUpdatedBy || null,
                ],
            );
            return res.rows[0] as BUSetting;
        });
        return created;
    }

    async update(id: number, body: Partial<Omit<BUSetting, 'id' | 'creationDate'>>): Promise<BUSetting | undefined> {
        const updated = await withPg(async (c) => {
            const setClauses: string[] = [];
            const values: any[] = [id];
            let paramIndex = 2;

            if (body.clientId !== undefined) {
                setClauses.push(`client_id = $${paramIndex++}`);
                values.push(body.clientId);
            }
            if (body.enterpriseId !== undefined) {
                setClauses.push(`enterprise_id = $${paramIndex++}`);
                values.push(body.enterpriseId);
            }
            if (body.entities !== undefined) {
                setClauses.push(`entities = $${paramIndex++}`);
                values.push(body.entities);
            }
            if (body.lastUpdatedBy !== undefined) {
                setClauses.push(`last_updated_by = $${paramIndex++}`);
                values.push(body.lastUpdatedBy);
            }

            setClauses.push(`last_update_date = now()`);

            const sql = `update ${this.schema}.fnd_business_unit_settings set ${setClauses.join(', ')} where bu_id = $1 returning *`;
            
            const res = await c.query(sql, values);
            return (res.rows[0] as BUSetting) || undefined;
        });
        return updated;
    }

    async remove(id: number): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_business_unit_settings where bu_id = $1`,
                [id],
            );
        });
    }

    async listEntities(
        clientId?: string,
        enterpriseId?: string,
    ): Promise<string[]> {
        const rows = await withPg(async (c) => {
            const where: string[] = [];
            const params: any[] = [];
            if (clientId) {
                params.push(clientId);
                where.push(`client_id = $${params.length}`);
            }
            if (enterpriseId) {
                params.push(enterpriseId);
                where.push(`enterprise_id = $${params.length}`);
            }
            const whereSql =
                where.length > 0 ? `where ${where.join(' and ')}` : '';
            const sql = `select distinct entity
                         from ${this.schema}.fnd_business_unit_settings, unnest(entities::text[]) as entity
                         ${whereSql}
                         order by 1`;
            const res = await c.query(sql, params);
            return res.rows as {entity: string}[];
        });
        return rows.map((r) => r.entity);
    }
}
