import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
import {withPg} from '../db';

export interface Environment {
    id: string;
    environmentName: string;
    details: string;
    deploymentType: 'Integration' | 'Extension';
    testConnectivity: 'Success' | 'Failed' | 'Pending' | 'Not Tested';
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
    url?: string;
    credentialName?: string;
    tags?: string[];
    environmentType?: 'Preproduction' | 'Production';
    accountId?: string;
    accountName?: string;
    enterpriseId?: string;
    createdAt?: string;
    updatedAt?: string;
}

export class EnvironmentsService {
    private store: FsStore<Environment>;
    private readonly schema: string;

    constructor(dir: string) {
        this.store = new FsStore<Environment>(dir, 'environments.json');
        this.schema = process.env.PGSCHEMA || 'devops';
    }

    private async ensureTable(): Promise<void> {
        await withPg(async (c) => {
            await c.query(`
                create table if not exists ${this.schema}.environments (
                    id text primary key,
                    environment_name text not null,
                    details text,
                    deployment_type text not null,
                    test_connectivity text not null,
                    status text not null,
                    url text,
                    credential_name text,
                    tags jsonb,
                    environment_type text,
                    account_id text,
                    enterprise_id text,
                    created_at timestamp default now(),
                    updated_at timestamp default now()
                )
            `);
        });
    }

    async getAll(): Promise<Environment[]> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const result = await withPg(async (c) => {
                const res = await c.query(
                    `select
                        id,
                        environment_name as "environmentName",
                        details,
                        deployment_type as "deploymentType",
                        test_connectivity as "testConnectivity",
                        status,
                        url,
                        credential_name as "credentialName",
                        tags,
                        environment_type as "environmentType",
                        account_id as "accountId",
                        enterprise_id as "enterpriseId",
                        created_at as "createdAt",
                        updated_at as "updatedAt"
                     from ${this.schema}.environments
                     order by created_at desc`,
                );
                return res.rows;
            });
            return result;
        }
        return this.store.readAll();
    }

    async getById(id: string): Promise<Environment | null> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const result = await withPg(async (c) => {
                const res = await c.query(
                    `select
                        id,
                        environment_name as "environmentName",
                        details,
                        deployment_type as "deploymentType",
                        test_connectivity as "testConnectivity",
                        status,
                        url,
                        credential_name as "credentialName",
                        tags,
                        environment_type as "environmentType",
                        account_id as "accountId",
                        enterprise_id as "enterpriseId",
                        created_at as "createdAt",
                        updated_at as "updatedAt"
                     from ${this.schema}.environments
                     where id = $1`,
                    [id],
                );
                return res.rows[0] || null;
            });
            return result;
        }
        const all = this.store.readAll();
        return all.find((env) => env.id === id) || null;
    }

    async create(
        environment: Omit<Environment, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<Environment> {
        const newEnvironment: Environment = {
            ...environment,
            id: `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            await withPg(async (c) => {
                await c.query(
                    `insert into ${this.schema}.environments (
                        id, environment_name, details, deployment_type, test_connectivity,
                        status, url, credential_name, tags, environment_type, account_id, enterprise_id
                    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        newEnvironment.id,
                        newEnvironment.environmentName,
                        newEnvironment.details,
                        newEnvironment.deploymentType,
                        newEnvironment.testConnectivity,
                        newEnvironment.status,
                        newEnvironment.url,
                        newEnvironment.credentialName,
                        JSON.stringify(newEnvironment.tags || []),
                        newEnvironment.environmentType,
                        newEnvironment.accountId || null,
                        newEnvironment.enterpriseId || null,
                    ],
                );
            });
            return newEnvironment;
        }

        const all = this.store.readAll();
        all.push(newEnvironment);
        this.store.writeAll(all);
        return newEnvironment;
    }

    async update(
        id: string,
        updates: Partial<Environment>,
    ): Promise<Environment | null> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const result = await withPg(async (c) => {
                const setClauses: string[] = [];
                const values: any[] = [];
                let paramIndex = 1;

                if (updates.environmentName !== undefined) {
                    setClauses.push(`environment_name = $${paramIndex++}`);
                    values.push(updates.environmentName);
                }
                if (updates.details !== undefined) {
                    setClauses.push(`details = $${paramIndex++}`);
                    values.push(updates.details);
                }
                if (updates.deploymentType !== undefined) {
                    setClauses.push(`deployment_type = $${paramIndex++}`);
                    values.push(updates.deploymentType);
                }
                if (updates.testConnectivity !== undefined) {
                    setClauses.push(`test_connectivity = $${paramIndex++}`);
                    values.push(updates.testConnectivity);
                }
                if (updates.status !== undefined) {
                    setClauses.push(`status = $${paramIndex++}`);
                    values.push(updates.status);
                }
                if (updates.url !== undefined) {
                    setClauses.push(`url = $${paramIndex++}`);
                    values.push(updates.url);
                }
                if (updates.credentialName !== undefined) {
                    setClauses.push(`credential_name = $${paramIndex++}`);
                    values.push(updates.credentialName);
                }
                if (updates.tags !== undefined) {
                    setClauses.push(`tags = $${paramIndex++}`);
                    values.push(JSON.stringify(updates.tags));
                }
                if (updates.environmentType !== undefined) {
                    setClauses.push(`environment_type = $${paramIndex++}`);
                    values.push(updates.environmentType);
                }
                if (updates.accountId !== undefined) {
                    setClauses.push(`account_id = $${paramIndex++}`);
                    values.push(updates.accountId);
                }
                if (updates.enterpriseId !== undefined) {
                    setClauses.push(`enterprise_id = $${paramIndex++}`);
                    values.push(updates.enterpriseId);
                }

                setClauses.push(`updated_at = now()`);
                values.push(id);

                const res = await c.query(
                    `update ${this.schema}.environments
                     set ${setClauses.join(', ')}
                     where id = $${paramIndex}
                     returning
                        id,
                        environment_name as "environmentName",
                        details,
                        deployment_type as "deploymentType",
                        test_connectivity as "testConnectivity",
                        status,
                        url,
                        credential_name as "credentialName",
                        tags,
                        environment_type as "environmentType",
                        account_id as "accountId",
                        enterprise_id as "enterpriseId",
                        created_at as "createdAt",
                        updated_at as "updatedAt"`,
                    values,
                );
                return res.rows[0] || null;
            });
            return result;
        }

        const all = this.store.readAll();
        const index = all.findIndex((env) => env.id === id);
        if (index === -1) return null;

        all[index] = {
            ...all[index],
            ...updates,
            updatedAt: new Date().toISOString(),
        };
        this.store.writeAll(all);
        return all[index];
    }

    async delete(id: string): Promise<boolean> {
        if (STORAGE_MODE === 'postgres') {
            await this.ensureTable();
            const result = await withPg(async (c) => {
                const res = await c.query(
                    `delete from ${this.schema}.environments where id = $1`,
                    [id],
                );
                return res.rowCount > 0;
            });
            return result;
        }

        const all = this.store.readAll();
        const filtered = all.filter((env) => env.id !== id);
        if (filtered.length === all.length) return false;
        this.store.writeAll(filtered);
        return true;
    }
}
