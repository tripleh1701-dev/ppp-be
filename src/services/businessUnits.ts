import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
import {withPg} from '../db';

export interface BUSetting {
    id: string;
    accountId: string;
    accountName: string;
    enterpriseId: string;
    enterpriseName: string;
    entities: string[];
}

export class BusinessUnitsService {
    private store: FsStore<BUSetting>;
    private readonly schema: string;

    constructor(dir: string) {
        this.store = new FsStore<BUSetting>(dir, 'businessUnits.json');
        this.schema = process.env.PGSCHEMA || 'devops';
    }

    private async ensureTable(): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `create table if not exists ${this.schema}.business_unit_settings (
                    bu_id bigserial primary key,
                    account_id bigint not null,
                    account_name text not null,
                    enterprise_id bigint not null,
                    enterprise_name text not null,
                    entities text[] not null default '{}',
                    created_by text,
                    creation_date timestamptz not null default now(),
                    last_updated_by text,
                    last_update_date timestamptz not null default now(),
                    constraint fk_bu_acc foreign key (account_id) references ${this.schema}.fnd_accounts(account_id) on delete restrict,
                    constraint fk_bu_ent foreign key (enterprise_id) references ${this.schema}.fnd_enterprise(enterprise_id) on delete restrict
                )`,
            );
        });
    }

    async list(): Promise<BUSetting[]> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const rows = await withPg(async (c) => {
                const res = await c.query(
                    `select
                        bu_id as id,
                        account_id as "accountId",
                        account_name as "accountName",
                        enterprise_id as "enterpriseId",
                        enterprise_name as "enterpriseName",
                        entities
                    from ${this.schema}.business_unit_settings`,
                );
                return res.rows as BUSetting[];
            });
            return rows;
        }
        return this.store.readAll();
    }

    async create(body: Omit<BUSetting, 'id'>) {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const created = await withPg(async (c) => {
                const res = await c.query(
                    `insert into ${this.schema}.business_unit_settings(
                        account_id, account_name, enterprise_id, enterprise_name, entities
                    ) values($1,$2,$3,$4,$5)
                    returning bu_id as id, account_id as "accountId", account_name as "accountName", enterprise_id as "enterpriseId", enterprise_name as "enterpriseName", entities`,
                    [
                        body.accountId,
                        body.accountName,
                        body.enterpriseId,
                        body.enterpriseName,
                        body.entities,
                    ],
                );
                return res.rows[0] as BUSetting;
            });
            return created;
        }
        const next = [...this.store.readAll(), {id: uuid(), ...body}];
        this.store.writeAll(next);
        return next[next.length - 1];
    }

    async update(id: string, body: Omit<BUSetting, 'id'>) {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const updated = await withPg(async (c) => {
                const res = await c.query(
                    `update ${this.schema}.business_unit_settings set
                        account_id=$2,
                        account_name=$3,
                        enterprise_id=$4,
                        enterprise_name=$4,
                        entities=$5
                    where bu_id=$1
                    returning bu_id as id,
                        account_id as "accountId",
                        account_name as "accountName",
                        enterprise_id as "enterpriseId",
                        enterprise_name as "enterpriseName",
                        entities`,
                    [
                        id,
                        body.accountId,
                        body.accountName,
                        body.enterpriseId,
                        body.enterpriseName,
                        body.entities,
                    ],
                );
                return (res.rows[0] as BUSetting) || undefined;
            });
            return updated;
        }
        const all = this.store.readAll();
        const idx = all.findIndex((a) => a.id === id);
        if (idx === -1) return undefined;
        all[idx] = {id, ...body};
        this.store.writeAll(all);
        return all[idx];
    }

    async remove(id: string) {
        if (STORAGE_MODE === 'postgres') {
            await withPg(async (c) => {
                await c.query(
                    `delete from ${this.schema}.business_unit_settings where bu_id=$1`,
                    [id],
                );
            });
            return;
        }
        const next = this.store.readAll().filter((e) => e.id !== id);
        this.store.writeAll(next);
    }

    async listEntities(
        accountId?: string,
        enterpriseId?: string,
        enterpriseName?: string,
    ): Promise<string[]> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const rows = await withPg(async (c) => {
                const where: string[] = [];
                const params: any[] = [];
                if (accountId) {
                    params.push(accountId);
                    where.push(`account_id = $${params.length}`);
                }
                if (enterpriseId) {
                    params.push(enterpriseId);
                    where.push(`enterprise_id = $${params.length}`);
                }
                if (enterpriseName) {
                    params.push(enterpriseName);
                    where.push(`enterprise_name = $${params.length}`);
                }
                const whereSql =
                    where.length > 0 ? `where ${where.join(' and ')}` : '';
                const sql = `select distinct unnest(entities) as entity
                             from ${this.schema}.business_unit_settings
                             ${whereSql}
                             order by 1`;
                const res = await c.query(sql, params);
                return res.rows as {entity: string}[];
            });
            return rows.map((r) => r.entity);
        }
        const all = this.store.readAll();
        const set = new Set<string>();
        for (const bu of all) {
            if (accountId && bu.accountId !== accountId) continue;
            if (enterpriseId && bu.enterpriseId !== enterpriseId) continue;
            if (enterpriseName && bu.enterpriseName !== enterpriseName)
                continue;
            for (const e of bu.entities || []) set.add(e);
        }
        return Array.from(set).sort();
    }
}
