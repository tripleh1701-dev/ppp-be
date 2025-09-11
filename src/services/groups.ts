import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';

export interface GroupMasterRecord {
    id: string;
    name: string;
    description?: string;
}

export class GroupsService {
    private store: FsStore<GroupMasterRecord>;

    constructor(dir: string) {
        this.store = new FsStore<GroupMasterRecord>(dir, 'groups.json');
    }

    list(search?: string): GroupMasterRecord[] {
        const all = this.store.readAll();
        if (!search) return all;
        const q = search.toLowerCase();
        return all.filter((g) => g.name.toLowerCase().includes(q));
    }

    get(id: string): GroupMasterRecord | undefined {
        return this.store.readAll().find((g) => g.id === id);
    }

    findByName(name: string): GroupMasterRecord | undefined {
        const q = name.toLowerCase();
        return this.store.readAll().find((g) => g.name.toLowerCase() === q);
    }

    create(body: {name: string; description?: string}): GroupMasterRecord {
        const created: GroupMasterRecord = {
            id: uuid(),
            name: body.name,
            description: body.description,
        };
        const next = [...this.store.readAll(), created];
        this.store.writeAll(next);
        return created;
    }
}
