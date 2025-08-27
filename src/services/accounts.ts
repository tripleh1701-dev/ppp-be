import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';

export interface Account {
    id: string;
    accountName: string;
    email?: string;
}

export class AccountsService {
    private store: FsStore<Account>;

    constructor(dir: string) {
        this.store = new FsStore<Account>(dir, 'accounts.json');
    }

    list(): Account[] {
        return this.store.readAll();
    }

    create(body: Omit<Account, 'id'>): Account {
        const next = [...this.store.readAll(), {id: uuid(), ...body}];
        this.store.writeAll(next);
        return next[next.length - 1];
    }

    update(id: string, body: Omit<Account, 'id'>): Account | undefined {
        const all = this.store.readAll();
        const idx = all.findIndex((a) => a.id === id);
        if (idx === -1) return undefined;
        all[idx] = {id, ...body};
        this.store.writeAll(all);
        return all[idx];
    }

    remove(id: string) {
        const next = this.store.readAll().filter((a) => a.id !== id);
        this.store.writeAll(next);
    }
}
