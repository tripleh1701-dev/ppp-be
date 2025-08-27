import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
import {withPg} from '../db';

export interface TemplateDetails {
    enterprise: string;
    entity: string;
}

export interface TemplateRecord {
    id: string;
    name: string;
    description?: string;
    details: TemplateDetails;
    deploymentType: 'Integration' | 'Extension' | string;
    creationDate: string;
    status: 'Active' | 'Inactive' | 'Draft' | string;
    flowTemplateId?: string;
}

export class TemplatesService {
    private store: FsStore<TemplateRecord>;
    private readonly schema: string;

    constructor(dir: string) {
        this.store = new FsStore<TemplateRecord>(dir, 'templates.json');
        this.schema = process.env.PGSCHEMA || 'devops';
    }

    async list(): Promise<TemplateRecord[]> {
        if (STORAGE_MODE === 'postgres') {
            const rows = await withPg(async (c) => {
                const res = await c.query(
                    `select
                        template_id as id,
                        name,
                        description,
                        deployment_type as "deploymentType",
                        to_char(creation_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "creationDate",
                        status,
                        flow_template_id as "flowTemplateId",
                        enterprise_name as "details.enterprise",
                        entity as "details.entity"
                    from ${this.schema}.pipeline_template`,
                );
                // Map flat columns to nested details
                return (res.rows as any[]).map((r) => ({
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    deploymentType: r.deploymentType,
                    creationDate: r.creationDate,
                    status: r.status,
                    flowTemplateId: r.flowTemplateId,
                    details: {
                        enterprise: r['details.enterprise'],
                        entity: r['details.entity'],
                    },
                })) as TemplateRecord[];
            });
            return rows;
        }
        return this.store.readAll();
    }

    async create(
        body: Omit<TemplateRecord, 'id'> & {id?: string},
    ): Promise<TemplateRecord> {
        const id = body.id && body.id.trim() !== '' ? body.id : uuid();
        if (STORAGE_MODE === 'postgres') {
            const created = await withPg(async (c) => {
                await c.query(
                    `insert into ${this.schema}.pipeline_template(
                        template_id, name, description, enterprise_name, entity, deployment_type, status, flow_template_id
                    ) values($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [
                        id,
                        body.name,
                        body.description || null,
                        body.details?.enterprise || null,
                        body.details?.entity || null,
                        body.deploymentType,
                        body.status,
                        body.flowTemplateId || null,
                    ],
                );
                return {...body, id} as TemplateRecord;
            });
            return created;
        }
        const record: TemplateRecord = {...body, id};
        const next = [...this.store.readAll(), record];
        this.store.writeAll(next);
        return record;
    }

    async update(
        id: string,
        body: Omit<TemplateRecord, 'id'>,
    ): Promise<TemplateRecord | undefined> {
        if (STORAGE_MODE === 'postgres') {
            const updated = await withPg(async (c) => {
                const res = await c.query(
                    `update ${this.schema}.pipeline_template set
                        name=$2,
                        description=$3,
                        enterprise_name=$4,
                        entity=$5,
                        deployment_type=$6,
                        status=$7,
                        flow_template_id=$8
                    where template_id=$1
                    returning template_id as id,
                        name,
                        description,
                        enterprise_name as "details.enterprise",
                        entity as "details.entity",
                        deployment_type as "deploymentType",
                        to_char(creation_date, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "creationDate",
                        status,
                        flow_template_id as "flowTemplateId"`,
                    [
                        id,
                        body.name,
                        body.description || null,
                        body.details?.enterprise || null,
                        body.details?.entity || null,
                        body.deploymentType,
                        body.status,
                        body.flowTemplateId || null,
                    ],
                );
                const r = res.rows[0];
                if (!r) return undefined;
                return {
                    id: r.id,
                    name: r.name,
                    description: r.description,
                    deploymentType: r.deploymentType,
                    creationDate: r.creationDate,
                    status: r.status,
                    flowTemplateId: r.flowTemplateId,
                    details: {
                        enterprise: r['details.enterprise'],
                        entity: r['details.entity'],
                    },
                } as TemplateRecord;
            });
            return updated;
        }
        const all = this.store.readAll();
        const idx = all.findIndex((t) => t.id === id);
        if (idx === -1) return undefined;
        all[idx] = {id, ...body};
        this.store.writeAll(all);
        return all[idx];
    }

    async remove(id: string): Promise<void> {
        if (STORAGE_MODE === 'postgres') {
            await withPg(async (c) => {
                await c.query(
                    `delete from ${this.schema}.pipeline_template where template_id=$1`,
                    [id],
                );
            });
            return;
        }
        const next = this.store.readAll().filter((t) => t.id !== id);
        this.store.writeAll(next);
    }
}
