import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const STORAGE_DIR = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.join(process.cwd(), 'data');

export const STORAGE_MODE = (process.env.STORAGE_MODE || 'filesystem') as
    | 'filesystem'
    | 'postgres';

export const PG = {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'postgres',
};
