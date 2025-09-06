import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
import {withPg} from '../db';

export interface GroupRecord {
    id: string;
    username: string;
    name: string;
    description?: string;
    enterprise?: string;
}

export class UserGroupsService {
    private store: FsStore<GroupRecord>;
    private readonly schema: string;

    constructor(dir: string) {
        this.store = new FsStore<GroupRecord>(dir, 'userGroups.json');
        this.schema = process.env.PGSCHEMA || 'devops';
    }

    async list(username: string): Promise<GroupRecord[]> {
        if (STORAGE_MODE === 'postgres') {
            const rows = await withPg(async (c) => {
                const res = await c.query(
                    `select
                        group_id as id,
                        username,
                        name,
                        description,
                        enterprise_id::text as enterprise
                    from ${this.schema}.user_group
                    where username=$1`,
                    [username],
                );
                return res.rows as GroupRecord[];
            });
            return rows;
        }
        return this.store.readAll().filter((g) => g.username === username);
    }

    async create(
        username: string,
        body: Omit<GroupRecord, 'username'> & {id?: string},
    ) {
        if (STORAGE_MODE === 'postgres') {
            const created = await withPg(async (c) => {
                const id = body.id || uuid();
                await c.query(
                    `insert into ${this.schema}.user_group(
                        group_id, username, name, description, enterprise_id
                    ) values($1,$2,$3,$4,$5)`,
                    [
                        id,
                        username,
                        body.name,
                        body.description || null,
                        body.enterprise || null,
                    ],
                );
                const {id: _omitId, ...rest} = body as any; return {id, username, ...rest} as GroupRecord;
            });
            return created;
        }
        const id = body.id || uuid();
        const {id: _omitId, ...rest} = body as any;
        const record: GroupRecord = {id, username, ...rest};
        const next = [...this.store.readAll(), record];
        this.store.writeAll(next);
        return record;
    }

    async remove(id: string) {
        if (STORAGE_MODE === 'postgres') {
            await withPg(async (c) => {
                await c.query(
                    `delete from ${this.schema}.user_group where group_id=$1`,
                    [id],
                );
            });
            return;
        }
        const next = this.store.readAll().filter((g) => g.id !== id);
        this.store.writeAll(next);
    }

    async removeForUser(username: string, groupId: string) {
        if (STORAGE_MODE === 'postgres') {
            await withPg(async (c) => {
                await c.query(
                    `delete from ${this.schema}.user_group where username=$1 and group_id=$2`,
                    [username, groupId],
                );
            });
            return;
        }
        const next = this.store
            .readAll()
            .filter((g) => !(g.username === username && g.id === groupId));
        this.store.writeAll(next);
    }
}
