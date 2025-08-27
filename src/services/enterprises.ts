import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';

export interface Enterprise {
    id: string;
    name: string;
}

export class EnterprisesService {
    private store: FsStore<Enterprise>;
    constructor(dir: string) {
        this.store = new FsStore<Enterprise>(dir, 'enterprises.json');
    }

    list() {
        return this.store.readAll();
    }

    create(body: Omit<Enterprise, 'id'>) {
        const record: Enterprise = {id: uuid(), ...body};
        const next = [...this.store.readAll(), record];
        this.store.writeAll(next);
        return next[next.length - 1];
    }

    remove(id: string) {
        const next = this.store.readAll().filter((e) => e.id !== id);
        this.store.writeAll(next);
    }

    update(id: string, body: Omit<Enterprise, 'id'>) {
        const all = this.store.readAll();
        const idx = all.findIndex((e) => e.id === id);
        if (idx === -1) return null;
        all[idx] = {id, ...body};
        this.store.writeAll(all);
        return all[idx];
    }
}
