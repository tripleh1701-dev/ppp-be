import {v4 as uuid} from 'uuid';
import {withPg} from '../db';

export interface GlobalSettingRecord {
    id: string;
    accountId: string;
    accountName: string;
    enterpriseId?: string;
    enterpriseName: string;
    entities: string[];
    categories: {
        plan: string[];
        code: string[];
        build: string[];
        test: string[];
        release: string[];
        deploy: string[];
        others: string[];
    };
}

export class GlobalSettingsService {
    private readonly schema: string;

    constructor(dir: string) {
        this.schema = process.env.PGSCHEMA || 'systiva'; // Use systiva schema for existing tables
    }

    // Helper method to convert short ID to UUID format
    private normalizeId(id: string): string {
        // If it's already a valid UUID, return as is
        if (id.length === 36 && id.includes('-')) {
            return id;
        }
        
        // If it's a short ID, pad it to make it a valid UUID
        const paddedId = id.padEnd(32, '0');
        return `${paddedId.slice(0, 8)}-${paddedId.slice(8, 12)}-${paddedId.slice(12, 16)}-${paddedId.slice(16, 20)}-${paddedId.slice(20, 32)}`;
    }

    async list(): Promise<GlobalSettingRecord[]> {
        const rows = await withPg(async (c) => {
            const res = await c.query(
                `select
                    gs_id as id,
                    account_id as "accountId",
                    account_name as "accountName",
                    enterprise_id as "enterpriseId",
                    enterprise_name as "enterpriseName",
                    entities,
                    categories
                from ${this.schema}.fnd_global_settings
                order by account_name, enterprise_name`,
            );
            return res.rows as GlobalSettingRecord[];
        });
        return rows;
    }

    async create(
        body: Omit<GlobalSettingRecord, 'id'>,
    ): Promise<GlobalSettingRecord> {
        const id = uuid();
        const created = await withPg(async (c) => {
            await c.query(
                `insert into ${this.schema}.fnd_global_settings(
                    gs_id, account_id, account_name, enterprise_id, enterprise_name, entities, categories
                ) values($1, $2, $3, $4, $5, $6, $7)`,
                [
                    id,
                    body.accountId,
                    body.accountName,
                    body.enterpriseId,
                    body.enterpriseName,
                    body.entities,
                    body.categories,
                ],
            );
            
            const res = await c.query(
                `select
                    gs_id as id,
                    account_id as "accountId",
                    account_name as "accountName",
                    enterprise_id as "enterpriseId",
                    enterprise_name as "enterpriseName",
                    entities,
                    categories
                from ${this.schema}.fnd_global_settings
                where gs_id = $1`,
                [id],
            );
            return res.rows[0] as GlobalSettingRecord;
        });
        return created;
    }

    async get(id: string): Promise<GlobalSettingRecord | null> {
        const normalizedId = this.normalizeId(id);
        const row = await withPg(async (c) => {
            const res = await c.query(
                `select
                    gs_id as id,
                    account_id as "accountId",
                    account_name as "accountName",
                    enterprise_id as "enterpriseId",
                    enterprise_name as "enterpriseName",
                    entities,
                    categories
                from ${this.schema}.fnd_global_settings
                where gs_id = $1`,
                [normalizedId],
            );
            return res.rows[0] as GlobalSettingRecord || null;
        });
        return row;
    }

    async update(id: string, body: Partial<Omit<GlobalSettingRecord, 'id'>>): Promise<GlobalSettingRecord | null> {
        const normalizedId = this.normalizeId(id);
        const updated = await withPg(async (c) => {
            const setClauses: string[] = [];
            const values: any[] = [normalizedId];
            let paramIndex = 2;

            if (body.accountId !== undefined) {
                setClauses.push(`account_id = $${paramIndex++}`);
                values.push(body.accountId);
            }
            if (body.accountName !== undefined) {
                setClauses.push(`account_name = $${paramIndex++}`);
                values.push(body.accountName);
            }
            if (body.enterpriseId !== undefined) {
                setClauses.push(`enterprise_id = $${paramIndex++}`);
                values.push(body.enterpriseId);
            }
            if (body.enterpriseName !== undefined) {
                setClauses.push(`enterprise_name = $${paramIndex++}`);
                values.push(body.enterpriseName);
            }
            if (body.entities !== undefined) {
                setClauses.push(`entities = $${paramIndex++}`);
                values.push(body.entities);
            }
            if (body.categories !== undefined) {
                setClauses.push(`categories = $${paramIndex++}`);
                values.push(body.categories);
            }

            setClauses.push(`last_update_date = now()`);

            const sql = `update ${this.schema}.fnd_global_settings set ${setClauses.join(', ')} where gs_id = $1 returning *`;
            
            const res = await c.query(sql, values);
            return (res.rows[0] as GlobalSettingRecord) || null;
        });
        return updated;
    }

    async remove(id: string): Promise<void> {
        const normalizedId = this.normalizeId(id);
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_global_settings where gs_id = $1`,
                [normalizedId],
            );
        });
    }
}
