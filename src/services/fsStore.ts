import fs from 'fs';
import path from 'path';

export class FsStore<T> {
    private filePath: string;

    constructor(dir: string, fileName: string) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
        this.filePath = path.join(dir, fileName);
        if (!fs.existsSync(this.filePath))
            fs.writeFileSync(this.filePath, '[]', 'utf-8');
    }

    readAll(): T[] {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        try {
            return JSON.parse(raw) as T[];
        } catch {
            return [];
        }
    }

    writeAll(data: T[]) {
        fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
}
