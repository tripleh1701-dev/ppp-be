import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';

export interface UserRecord {
    id: string;
    username: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    email: string;
    status: 'ACTIVE' | 'INACTIVE';
    locked: boolean;
    startDate: string;
    endDate?: string | null;
    groupName: string;
    updatedAt: string;
}

export class UsersService {
    private store: FsStore<UserRecord>;

    constructor(dir: string) {
        this.store = new FsStore<UserRecord>(dir, 'users.json');
    }

    list() {
        return this.store.readAll();
    }

    getById(id: string): UserRecord | undefined {
        return this.store.readAll().find((u) => u.id === id);
    }

    getByEmail(email: string): UserRecord | undefined {
        return this.store.readAll().find((u) => u.email === email);
    }

    create(body: Omit<UserRecord, 'id' | 'updatedAt'>) {
        // filesystem only
        const user: UserRecord = {
            id: uuid(),
            updatedAt: new Date().toISOString(),
            ...body,
        };
        const next = [...this.store.readAll(), user];
        this.store.writeAll(next);
        return user;
    }

    update(id: string, body: Omit<UserRecord, 'id' | 'updatedAt'>) {
        // filesystem only
        const all = this.store.readAll();
        const idx = all.findIndex((a) => a.id === id);
        if (idx === -1) return undefined;
        all[idx] = {id, updatedAt: new Date().toISOString(), ...body};
        this.store.writeAll(all);
        return all[idx];
    }

    partialUpdate(id: string, patch: Partial<Omit<UserRecord, 'id'>>) {
        const all = this.store.readAll();
        const idx = all.findIndex((a) => a.id === id);
        if (idx === -1) return undefined;
        const current = all[idx];
        const updated: UserRecord = {
            ...current,
            ...patch,
            id,
            updatedAt: new Date().toISOString(),
        } as UserRecord;
        all[idx] = updated;
        this.store.writeAll(all);
        return updated;
    }

    remove(id: string) {
        const next = this.store.readAll().filter((e) => e.id !== id);
        this.store.writeAll(next);
    }
}
