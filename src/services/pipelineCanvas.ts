import fs from 'fs/promises';
import path from 'path';

const dataFile = path.join(__dirname, '../../data/pipelineCanvas.json');

export interface PipelineCanvas {
    id: string;
    pipelineName: string;
    details: string;
    service: string; // Comma-separated services or single service
    entity: string;
    status: string;
    lastUpdated: string;
    createdAt: string;
    updatedAt: string;
    // Additional fields for DynamoDB
    accountId?: string;
    accountName?: string;
    enterpriseId?: string;
    enterpriseName?: string;
    yamlContent?: string;
    createdBy?: string; // User email or name
}

let cache: PipelineCanvas[] = [];
let loaded = false;

async function load() {
    if (loaded) return cache;
    try {
        const raw = await fs.readFile(dataFile, 'utf-8');
        cache = JSON.parse(raw);
        loaded = true;
    } catch {
        cache = [];
        loaded = true;
    }
    return cache;
}

async function save() {
    await fs.writeFile(dataFile, JSON.stringify(cache, null, 2), 'utf-8');
}

export async function list(): Promise<PipelineCanvas[]> {
    await load();
    return [...cache];
}

export async function get(id: string): Promise<PipelineCanvas | undefined> {
    await load();
    return cache.find((item) => item.id === id);
}

export async function create(
    data: Omit<PipelineCanvas, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<PipelineCanvas> {
    await load();
    const now = new Date().toISOString();
    const newItem: PipelineCanvas = {
        ...data,
        id: `pipeline-${Date.now()}-${Math.random()
            .toString(36)
            .substring(2, 9)}`,
        createdAt: now,
        updatedAt: now,
    };
    cache.push(newItem);
    await save();
    return newItem;
}

export async function update(
    id: string,
    data: Partial<Omit<PipelineCanvas, 'id' | 'createdAt'>>,
): Promise<PipelineCanvas | null> {
    await load();
    const index = cache.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const updated: PipelineCanvas = {
        ...cache[index],
        ...data,
        updatedAt: new Date().toISOString(),
    };
    cache[index] = updated;
    await save();
    return updated;
}

export async function remove(id: string): Promise<boolean> {
    await load();
    const index = cache.findIndex((item) => item.id === id);
    if (index === -1) return false;

    cache.splice(index, 1);
    await save();
    return true;
}
