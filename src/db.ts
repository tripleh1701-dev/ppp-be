import {Pool} from 'pg';

export type StorageMode = 'filesystem' | 'postgres';

export const storageMode: StorageMode =
    (process.env.STORAGE_MODE as StorageMode) || 'filesystem';

let pool: Pool | null = null;

export function getPool(): Pool {
    if (storageMode !== 'postgres') {
        throw new Error('PostgreSQL not enabled. Set STORAGE_MODE=postgres');
    }
    if (!pool) {
        pool = new Pool({
            host: process.env.PGHOST || '127.0.0.1',
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || '',
            database: process.env.PGDATABASE || 'postgres',
            max: Number(process.env.PGPOOL_MAX || 10),
            idleTimeoutMillis: Number(process.env.PGPOOL_IDLE || 30000),
        });
    }
    return pool;
}

export async function withPg<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const p = getPool();
    const client = await p.connect();
    try {
        return await fn(client);
    } finally {
        client.release();
    }
}
