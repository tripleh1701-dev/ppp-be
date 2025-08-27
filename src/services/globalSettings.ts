import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
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
    private store: FsStore<GlobalSettingRecord>;
    private readonly schema: string;

    constructor(dir: string) {
        this.store = new FsStore<GlobalSettingRecord>(
            dir,
            'globalSettings.json',
        );
        this.schema = process.env.PGSCHEMA || 'devops';
    }

    async list(): Promise<GlobalSettingRecord[]> {
        if (STORAGE_MODE === 'postgres') {
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
                    from ${this.schema}.global_settings`,
                );
                return res.rows as GlobalSettingRecord[];
            });
            return rows;
        }
        return this.store.readAll();
    }

    async create(
        body: Omit<GlobalSettingRecord, 'id'>,
    ): Promise<GlobalSettingRecord> {
        if (STORAGE_MODE === 'postgres') {
            const created = await withPg(async (c) => {
                const id = uuid();
                await c.query(
                    `create table if not exists ${this.schema}.global_settings (
                        gs_id uuid primary key,
                        account_id bigint not null,
                        account_name text not null,
                        enterprise_id bigint not null,
                        enterprise_name text not null,
                        entities text[] not null default '{}',
                        categories jsonb not null default '{}'::jsonb,
                        created_by text,
                        creation_date timestamptz not null default now(),
                        last_updated_by text,
                        last_update_date timestamptz not null default now(),
                        constraint fk_gs_acc foreign key (account_id) references ${this.schema}.fnd_accounts(account_id) on delete restrict,
                        constraint fk_gs_ent foreign key (enterprise_id) references ${this.schema}.fnd_enterprise(enterprise_id) on delete restrict
                    )`,
                );
                // Resolve IDs if not provided
                let effectiveAccountId = body.accountId;
                if (!effectiveAccountId && body.accountName) {
                    const r = await c.query(
                        `select account_id from ${this.schema}.fnd_accounts where account_name=$1`,
                        [body.accountName],
                    );
                    effectiveAccountId = r.rows[0]?.account_id?.toString();
                }
                let effectiveEnterpriseId = body.enterpriseId;
                if (!effectiveEnterpriseId && body.enterpriseName) {
                    const r = await c.query(
                        `select enterprise_id from ${this.schema}.fnd_enterprise where enterprise_name=$1`,
                        [body.enterpriseName],
                    );
                    effectiveEnterpriseId =
                        r.rows[0]?.enterprise_id?.toString();
                }
                await c.query(
                    `insert into ${this.schema}.global_settings(
                        gs_id, account_id, account_name, enterprise_id, enterprise_name, entities, categories
                    ) values($1,$2,$3,$4,$5,$6,$7)`,
                    [
                        id,
                        effectiveAccountId,
                        body.accountName,
                        effectiveEnterpriseId,
                        body.enterpriseName,
                        body.entities,
                        body.categories as any,
                    ],
                );
                return {id, ...body} as GlobalSettingRecord;
            });
            return created;
        }
        const record: GlobalSettingRecord = {id: uuid(), ...body};
        const next = [...this.store.readAll(), record];
        this.store.writeAll(next);
        return record;
    }

    async get(id: string): Promise<GlobalSettingRecord | undefined> {
        if (STORAGE_MODE === 'postgres') {
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
                     from ${this.schema}.global_settings where gs_id=$1`,
                    [id],
                );
                return (res.rows[0] as GlobalSettingRecord) || undefined;
            });
            return row;
        }
        return this.store.readAll().find((g) => g.id === id);
    }

    async update(
        id: string,
        body: Omit<GlobalSettingRecord, 'id'>,
    ): Promise<GlobalSettingRecord | undefined> {
        if (STORAGE_MODE === 'postgres') {
            const updated = await withPg(async (c) => {
                const res = await c.query(
                    `update ${this.schema}.global_settings set
                        account_id=$2,
                        account_name=$3,
                        enterprise_id=$4,
                        enterprise_name=$5,
                        entities=$6,
                        categories=$7
                     where gs_id=$1
                     returning gs_id as id,
                        account_id as "accountId",
                        account_name as "accountName",
                        enterprise_id as "enterpriseId",
                        enterprise_name as "enterpriseName",
                        entities,
                        categories`,
                    [
                        id,
                        body.accountId,
                        body.accountName,
                        body.enterpriseId || null,
                        body.enterpriseName,
                        body.entities,
                        body.categories as any,
                    ],
                );
                return (res.rows[0] as GlobalSettingRecord) || undefined;
            });
            return updated;
        }
        const all = this.store.readAll();
        const idx = all.findIndex((g) => g.id === id);
        if (idx === -1) return undefined;
        all[idx] = {id, ...body} as GlobalSettingRecord;
        this.store.writeAll(all);
        return all[idx];
    }

    async remove(id: string) {
        if (STORAGE_MODE === 'postgres') {
            await withPg(async (c) => {
                await c.query(
                    `delete from ${this.schema}.global_settings where gs_id=$1`,
                    [id],
                );
            });
            return;
        }
        const next = this.store.readAll().filter((g) => g.id !== id);
        this.store.writeAll(next);
    }
}
