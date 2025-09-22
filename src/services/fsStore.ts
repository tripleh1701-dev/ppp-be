// Minimal stub for backward compatibility
// This is a placeholder - services should migrate to database-only operations

export class FsStore<T> {
    constructor(dir: string, filename: string) {
        // Stub implementation
    }

    readAll(): T[] {
        return [];
    }

    writeAll(data: T[]): void {
        // Stub implementation - does nothing
    }

    get(id: string | number): T | undefined {
        return undefined;
    }

    create(item: T): T {
        return item;
    }

    update(id: string | number, item: Partial<T>): T | undefined {
        return undefined;
    }

    remove(id: string | number): boolean {
        return false;
    }
}
