import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
import {withPg} from '../db';

export interface PipelineYamlMap {
    [templateId: string]: string;
}

export class PipelineYamlService {
    private fileName = 'pipelineYAMLs.json';
    private rawStore: FsStore<any>;
    private readonly schema: string;

    constructor(dir: string) {
        this.rawStore = new FsStore<any>(dir, this.fileName);
        this.schema = process.env.PGSCHEMA || 'devops';
    }

    private async ensureTable(): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `create table if not exists ${this.schema}.pipeline_yaml (
                    template_id text primary key,
                    yaml text not null,
                    created_at timestamptz not null default now(),
                    updated_at timestamptz not null default now()
                )`,
            );
        });
    }

    private readMap(): PipelineYamlMap {
        try {
            const arr = this.rawStore.readAll();
            if (Array.isArray(arr)) {
                // migrate from array to map if needed
                return {};
            }
            return (arr as unknown as PipelineYamlMap) || {};
        } catch {
            return {};
        }
    }

    private writeMap(map: PipelineYamlMap) {
        // FsStore expects an array; we can bypass and write directly by using writeAll with a single-element array holding the map
        // But better: extend FsStore later. For now, store as an array with one object
        this.rawStore.writeAll(map as unknown as any[]);
    }

    async get(templateId: string): Promise<string | null> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const yaml = await withPg(async (c) => {
                const res = await c.query(
                    `select yaml from ${this.schema}.pipeline_yaml where template_id=$1`,
                    [templateId],
                );
                return (res.rows[0]?.yaml as string) || null;
            });
            return yaml;
        }
        const map = this.readMap();
        return map[templateId] || null;
    }

    async getAll(): Promise<PipelineYamlMap> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const map = await withPg(async (c) => {
                const res = await c.query(
                    `select template_id, yaml from ${this.schema}.pipeline_yaml`,
                );
                const out: PipelineYamlMap = {};
                for (const r of res.rows) out[r.template_id] = r.yaml;
                return out;
            });
            return map;
        }
        return this.readMap();
    }

    async save(templateId: string, yamlContent: string): Promise<void> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            await withPg(async (c) => {
                await c.query(
                    `insert into ${this.schema}.pipeline_yaml(template_id, yaml)
                     values($1,$2)
                     on conflict (template_id)
                     do update set yaml=excluded.yaml`,
                    [templateId, yamlContent],
                );
            });
            return;
        }
        const map = this.readMap();
        map[templateId] = yamlContent;
        this.writeMap(map);
    }

    async remove(templateId: string): Promise<void> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            await withPg(async (c) => {
                await c.query(
                    `delete from ${this.schema}.pipeline_yaml where template_id=$1`,
                    [templateId],
                );
            });
            return;
        }
        const map = this.readMap();
        delete map[templateId];
        this.writeMap(map);
    }
}
