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
        this.schema = 'acme'; // Use the correct schema name
    }

    async list(username: string): Promise<GroupRecord[]> {
        if (STORAGE_MODE === 'postgres') {
            const rows = await withPg(async (c) => {
                const res = await c.query(
                    `select
                        id,
                        name,
                        description,
                        enterprise_id::text as enterprise
                    from ${this.schema}.fnd_user_groups
                    where entity_id=$1`,
                    [username],
                );
                return res.rows.map((row) => ({
                    id: row.id.toString(),
                    username: username,
                    name: row.name,
                    description: row.description,
                    enterprise: row.enterprise,
                })) as GroupRecord[];
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
                const res = await c.query(
                    `insert into ${this.schema}.fnd_user_groups(
                        account_id, enterprise_id, name, description, entity_id, service_id, created_by
                    ) values($1,$2,$3,$4,$5,$6,$7)
                    RETURNING id, name, description, enterprise_id`,
                    [
                        1, // Default account_id - you may want to pass this as parameter
                        body.enterprise || 1, // enterprise_id
                        body.name,
                        body.description || null,
                        username, // entity_id (using username as entity identifier)
                        'active', // service_id - must be 'active' or 'inactive' per constraint
                        1, // Default created_by - you may want to pass this as parameter
                    ],
                );
                const row = res.rows[0];
                return {
                    id: row.id.toString(),
                    username: username,
                    name: row.name,
                    description: row.description,
                    enterprise: row.enterprise_id?.toString(),
                } as GroupRecord;
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
                    `delete from ${this.schema}.fnd_user_groups where id=$1`,
                    [parseInt(id)],
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
                    `delete from ${this.schema}.fnd_user_groups where entity_id=$1 and id=$2`,
                    [username, parseInt(groupId)],
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
