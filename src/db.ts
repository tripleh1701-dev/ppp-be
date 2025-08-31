import {Pool} from 'pg';

export type StorageMode = 'filesystem' | 'postgres';

// Read storage mode directly from environment each time
export function getStorageMode(): StorageMode {
    return (process.env.STORAGE_MODE as StorageMode) || 'filesystem';
}

let pool: Pool | null = null;

export function getPool(): Pool {
    const storageMode = getStorageMode();
    if (storageMode !== 'postgres') {
        throw new Error('PostgreSQL not enabled. Set STORAGE_MODE=postgres');
    }
    if (!pool) {
        console.log('Initializing PostgreSQL connection pool...');
        console.log('Connection config:', {
            host: process.env.PGHOST || '127.0.0.1',
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER || 'postgres',
            database: process.env.PGDATABASE || 'postgres',
            schema: process.env.PGSCHEMA || 'systiva'
        });
        
        pool = new Pool({
            host: process.env.PGHOST || '127.0.0.1',
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || '',
            database: process.env.PGDATABASE || 'postgres',
            max: Number(process.env.PGPOOL_MAX || 10),
            idleTimeoutMillis: Number(process.env.PGPOOL_IDLE || 30000),
        });

        // Test the connection
        pool.on('connect', (client: any) => {
            console.log('New client connected to PostgreSQL');
        });

        pool.on('error', (err: any, client: any) => {
            console.error('Unexpected error on idle client', err);
        });
    }
    return pool;
}

export async function withPg<T>(fn: (client: any) => Promise<T>): Promise<T> {
    const storageMode = getStorageMode();
    if (storageMode !== 'postgres') {
        throw new Error('PostgreSQL not enabled. Set STORAGE_MODE=postgres');
    }
    
    const p = getPool();
    const client = await p.connect();
    try {
        return await fn(client);
    } catch (error) {
        console.error('Database operation failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

export async function testConnection(): Promise<boolean> {
    const storageMode = getStorageMode();
    if (storageMode !== 'postgres') {
        console.log('PostgreSQL not enabled, skipping connection test');
        return false;
    }
    
    try {
        await withPg(async (client: any) => {
            await client.query('SELECT 1');
        });
        console.log('PostgreSQL connection test successful');
        return true;
    } catch (error) {
        console.error('PostgreSQL connection test failed:', error);
        return false;
    }
}
