import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const STORAGE_DIR = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.join(process.cwd(), 'data');

export const STORAGE_MODE = (process.env.STORAGE_MODE || 'filesystem') as
    | 'filesystem'
    | 'postgres'
    | 'dynamodb';

export const PG = {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'postgres',
};

export const DYNAMODB = {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    endpoint: process.env.DYNAMODB_ENDPOINT, // For local DynamoDB
    enterpriseTable:
        process.env.DYNAMODB_ENTERPRISE_TABLE || 'EnterpriseConfig',
};
