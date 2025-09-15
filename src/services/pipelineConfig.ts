import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
import {withPg} from '../db';

export type PipelineConfiguration = Record<string, any>;

export class PipelineConfigService {
    private store: FsStore<any>;
    private readonly schema: string;

    constructor(dir: string) {
        // Store as a single object inside an array, index 0
        this.store = new FsStore<any>(dir, 'pipelineConfig.json');
        this.schema = process.env.PGSCHEMA || 'devops';
    }

    private async ensureTable(): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `create table if not exists ${this.schema}.pipeline_config (
                    id text primary key,
                    config jsonb not null default '{}'::jsonb,
                    created_at timestamptz not null default now(),
                    updated_at timestamptz not null default now()
                )`,
            );
        });
    }

    async get(): Promise<PipelineConfiguration> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const config = await withPg(async (c) => {
                const res = await c.query(
                    `select config from ${this.schema}.pipeline_config where id=$1`,
                    ['singleton'],
                );
                return (
                    (res.rows[0]?.config as PipelineConfiguration) ||
                    ({} as PipelineConfiguration)
                );
            });
            return config;
        }
        const all = this.store.readAll();
        if (
            Array.isArray(all) &&
            all.length > 0 &&
            typeof all[0] === 'object'
        ) {
            return all[0] as PipelineConfiguration;
        }
        return {} as PipelineConfiguration;
    }

    async save(config: PipelineConfiguration): Promise<PipelineConfiguration> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            await withPg(async (c) => {
                await c.query(
                    `insert into ${this.schema}.pipeline_config(id, config)
                     values('singleton', $1)
                     on conflict (id) do update set config = excluded.config, updated_at = now()`,
                    [config as any],
                );
            });
            return config;
        }
        this.store.writeAll([config]);
        return config;
    }
}
