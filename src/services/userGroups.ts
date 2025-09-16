import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
import {withPg} from '../db';

export interface EntityRecord {
    id: string;
    name: string;
    description?: string;
}

export interface ServiceRecord {
    id: string;
    name: string;
    description?: string;
}

export interface RoleRecord {
    id: string;
    name: string;
    description?: string;
    permissions?: string[];
}

export interface AttributeRecord {
    id: string;
    name: string;
    enabled: boolean;
    description?: string;
}

export interface UserGroupRecord {
    id: string;
    name: string;
    description?: string;
    entities: EntityRecord[];
    services: ServiceRecord[];
    roles: RoleRecord[];
    accountId?: string;
    enterpriseId?: string;
    createdAt: string;
    updatedAt: string;
}

// Legacy interface for backward compatibility
export interface GroupRecord {
    id: string;
    username: string;
    name: string;
    description?: string;
    enterprise?: string;
}

export class UserGroupsService {
    private store: FsStore<GroupRecord>;
    private userGroupStore: FsStore<UserGroupRecord>;
    private readonly schema: string;

    constructor(dir: string) {
        this.store = new FsStore<GroupRecord>(dir, 'userGroups.json');
        this.userGroupStore = new FsStore<UserGroupRecord>(
            dir,
            'accessControlUserGroups.json',
        );
        this.schema = process.env.PGSCHEMA || 'systiva'; // Use systiva schema for fnd_ tables
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
                const {id: _omitId, ...rest} = body as any;
                return {id, username, ...rest} as GroupRecord;
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

    // Access Control User Groups Management Methods
    // Debug method to check table structure
    async debugTableStructure(): Promise<any> {
        if (STORAGE_MODE === 'postgres') {
            return await withPg(async (c) => {
                try {
                    // Check if tables exist and their structure
                    const tables = await c.query(
                        `
                        SELECT table_name
                        FROM information_schema.tables
                        WHERE table_schema = $1
                        AND table_name LIKE '%user_group%'
                    `,
                        [this.schema],
                    );

                    const result: any = {
                        schema: this.schema,
                        tables: tables.rows,
                    };

                    // Check each table's columns
                    for (const table of tables.rows) {
                        try {
                            const columns = await c.query(
                                `
                                SELECT column_name, data_type
                                FROM information_schema.columns
                                WHERE table_schema = $1 AND table_name = $2
                            `,
                                [this.schema, table.table_name],
                            );
                            result[table.table_name] = columns.rows;
                        } catch (err) {
                            result[table.table_name] = `Error: ${err}`;
                        }
                    }

                    return result;
                } catch (error) {
                    return {
                        error:
                            error instanceof Error
                                ? error.message
                                : 'Unknown error',
                    };
                }
            });
        }
        return {message: 'File storage mode, no database to check'};
    }

    async listUserGroups(
        accountId?: string,
        enterpriseId?: string,
    ): Promise<UserGroupRecord[]> {
        if (STORAGE_MODE === 'postgres') {
            const rows = await withPg(async (c) => {
                try {
                    const where: string[] = [];
                    const params: any[] = [];

                    if (accountId) {
                        params.push(accountId);
                        where.push(`ug.account_id = $${params.length}`);
                    }
                    if (enterpriseId) {
                        params.push(enterpriseId);
                        where.push(`ug.enterprise_id = $${params.length}`);
                    }

                    const whereSql =
                        where.length > 0 ? `where ${where.join(' and ')}` : '';

                    // Get user groups with their entities, services, and roles
                    const res = await c.query(
                        `select
                            ug.id,
                            ug.name,
                            ug.description,
                            ug.account_id as "accountId",
                            ug.enterprise_id as "enterpriseId",
                            ug.created_at as "createdAt",
                            ug.updated_at as "updatedAt",
                        coalesce(
                            json_agg(
                                distinct jsonb_build_object(
                                    'id', uge.entity_id
                                )
                            ) filter (where uge.entity_id is not null),
                            '[]'::json
                        ) as entities,
                        coalesce(
                            json_agg(
                                distinct jsonb_build_object(
                                    'id', ugs.service_id
                                )
                            ) filter (where ugs.service_id is not null),
                            '[]'::json
                        ) as services,
                        coalesce(
                            json_agg(
                                distinct jsonb_build_object(
                                    'id', systiva.role_id
                                )
                            ) filter (where systiva.role_id is not null),
                            '[]'::json
                        ) as roles
                    from ${this.schema}.fnd_user_groups ug
                    left join ${this.schema}.fnd_user_group_entities uge on ug.id = uge.user_group_id
                    left join ${this.schema}.fnd_user_group_services ugs on ug.id = ugs.user_group_id
                    left join ${this.schema}.fnd_user_group_roles systiva on ug.id = systiva.user_group_id
                    ${whereSql}
                    group by ug.id, ug.name, ug.description, ug.account_id, ug.enterprise_id, ug.created_at, ug.updated_at
                    order by ug.created_at desc`,
                        params,
                    );

                    return res.rows as UserGroupRecord[];
                } catch (error: any) {
                    console.error('Error in listUserGroups:', error.message);
                    console.error('Stack:', error.stack);
                    throw error;
                }
            });
            return rows;
        }

        // File storage fallback
        const all = this.userGroupStore.readAll();
        return all.filter((group) => {
            if (accountId && group.accountId !== accountId) return false;
            if (enterpriseId && group.enterpriseId !== enterpriseId)
                return false;
            return true;
        });
    }

    async getUserGroup(id: string): Promise<UserGroupRecord | undefined> {
        if (STORAGE_MODE === 'postgres') {
            const row = await withPg(async (c) => {
                try {
                    // First get the basic user group info
                    const res = await c.query(
                        `select
                        id,
                        name,
                        description,
                        account_id as "accountId",
                        enterprise_id as "enterpriseId",
                        created_at as "createdAt",
                        updated_at as "updatedAt"
                    from ${this.schema}.fnd_user_groups
                    where id = $1`,
                        [id],
                    );

                    if (res.rows.length === 0) return undefined;

                    const userGroup = res.rows[0];

                    // Get entities
                    const entitiesRes = await c.query(
                        `select entity_id as id from ${this.schema}.fnd_user_group_entities where user_group_id = $1`,
                        [id],
                    );
                    userGroup.entities = entitiesRes.rows;

                    // Get services
                    const servicesRes = await c.query(
                        `select service_id as id from ${this.schema}.fnd_user_group_services where user_group_id = $1`,
                        [id],
                    );
                    userGroup.services = servicesRes.rows;

                    // Get roles
                    const rolesRes = await c.query(
                        `select role_id as id from ${this.schema}.fnd_user_group_roles where user_group_id = $1`,
                        [id],
                    );
                    userGroup.roles = rolesRes.rows;

                    return userGroup as UserGroupRecord;
                } catch (error: any) {
                    console.error('Error in getUserGroup:', error.message);
                    console.error('Stack:', error.stack);
                    throw error;
                }
            });
            return row;
        }

        return this.userGroupStore.readAll().find((group) => group.id === id);
    }

    async createUserGroup(
        body: Omit<UserGroupRecord, 'id' | 'createdAt' | 'updatedAt'>,
    ): Promise<UserGroupRecord> {
        const id = uuid();
        const now = new Date().toISOString();

        const userGroup: UserGroupRecord = {
            id,
            name: body.name,
            description: body.description,
            entities: body.entities || [],
            services: body.services || [],
            roles: body.roles || [],
            accountId: body.accountId,
            enterpriseId: body.enterpriseId,
            createdAt: now,
            updatedAt: now,
        };

        if (STORAGE_MODE === 'postgres') {
            const created = await withPg(async (c) => {
                // Begin transaction
                await c.query('BEGIN');

                try {
                    // Insert main user group
                    await c.query(
                        `insert into ${this.schema}.fnd_user_groups(
                            name, description, account_id, enterprise_id, created_at, updated_at
                        ) values($1, $2, $3, $4, $5, $6)`,
                        [
                            userGroup.name,
                            userGroup.description || null,
                            userGroup.accountId || null,
                            userGroup.enterpriseId || null,
                            now,
                            now,
                        ],
                    );

                    // Insert entities
                    for (const entity of userGroup.entities) {
                        await c.query(
                            `insert into ${this.schema}.fnd_user_group_entities(
                                group_id, entity_id, entity_name, entity_description
                            ) values($1, $2, $3, $4)`,
                            [
                                id,
                                entity.id,
                                entity.name,
                                entity.description || null,
                            ],
                        );
                    }

                    // Insert services
                    for (const service of userGroup.services) {
                        await c.query(
                            `insert into ${this.schema}.fnd_user_group_services(
                                group_id, service_id, service_name, service_description
                            ) values($1, $2, $3, $4)`,
                            [
                                id,
                                service.id,
                                service.name,
                                service.description || null,
                            ],
                        );
                    }

                    // Insert roles
                    for (const role of userGroup.roles) {
                        await c.query(
                            `insert into ${this.schema}.fnd_user_group_roles(
                                group_id, role_id, role_name, role_description
                            ) values($1, $2, $3, $4)`,
                            [id, role.id, role.name, role.description || null],
                        );
                    }

                    await c.query('COMMIT');
                    return userGroup;
                } catch (error) {
                    await c.query('ROLLBACK');
                    throw error;
                }
            });
            return created;
        }

        // File storage fallback
        const next = [...this.userGroupStore.readAll(), userGroup];
        this.userGroupStore.writeAll(next);
        return userGroup;
    }

    async updateUserGroup(
        id: string,
        body: Partial<Omit<UserGroupRecord, 'id' | 'createdAt'>>,
    ): Promise<UserGroupRecord | undefined> {
        const now = new Date().toISOString();

        if (STORAGE_MODE === 'postgres') {
            const updated = await withPg(async (c) => {
                // Begin transaction
                await c.query('BEGIN');

                try {
                    // Update main user group
                    const setClauses: string[] = [];
                    const values: any[] = [id];
                    let paramIndex = 2;

                    if (body.name !== undefined) {
                        setClauses.push(`group_name = $${paramIndex++}`);
                        values.push(body.name);
                    }
                    if (body.description !== undefined) {
                        setClauses.push(`description = $${paramIndex++}`);
                        values.push(body.description);
                    }
                    if (body.accountId !== undefined) {
                        setClauses.push(`account_id = $${paramIndex++}`);
                        values.push(body.accountId);
                    }
                    if (body.enterpriseId !== undefined) {
                        setClauses.push(`enterprise_id = $${paramIndex++}`);
                        values.push(body.enterpriseId);
                    }

                    setClauses.push(`last_update_date = $${paramIndex++}`);
                    values.push(now);

                    if (setClauses.length > 1) {
                        // More than just the timestamp
                        await c.query(
                            `update ${
                                this.schema
                            }.fnd_user_groups set ${setClauses.join(
                                ', ',
                            )} where group_id = $1`,
                            values,
                        );
                    }

                    // Update entities if provided
                    if (body.entities !== undefined) {
                        await c.query(
                            `delete from ${this.schema}.fnd_user_group_entities where group_id = $1`,
                            [id],
                        );
                        for (const entity of body.entities) {
                            await c.query(
                                `insert into ${this.schema}.fnd_user_group_entities(
                                    group_id, entity_id, entity_name, entity_description
                                ) values($1, $2, $3, $4)`,
                                [
                                    id,
                                    entity.id,
                                    entity.name,
                                    entity.description || null,
                                ],
                            );
                        }
                    }

                    // Update services if provided
                    if (body.services !== undefined) {
                        await c.query(
                            `delete from ${this.schema}.fnd_user_group_services where group_id = $1`,
                            [id],
                        );
                        for (const service of body.services) {
                            await c.query(
                                `insert into ${this.schema}.fnd_user_group_services(
                                    group_id, service_id, service_name, service_description
                                ) values($1, $2, $3, $4)`,
                                [
                                    id,
                                    service.id,
                                    service.name,
                                    service.description || null,
                                ],
                            );
                        }
                    }

                    // Update roles if provided
                    if (body.roles !== undefined) {
                        await c.query(
                            `delete from ${this.schema}.fnd_user_group_roles where group_id = $1`,
                            [id],
                        );
                        for (const role of body.roles) {
                            await c.query(
                                `insert into ${this.schema}.fnd_user_group_roles(
                                    group_id, role_id, role_name, role_description
                                ) values($1, $2, $3, $4)`,
                                [
                                    id,
                                    role.id,
                                    role.name,
                                    role.description || null,
                                ],
                            );
                        }
                    }

                    await c.query('COMMIT');

                    // Return the updated user group
                    return await this.getUserGroup(id);
                } catch (error) {
                    await c.query('ROLLBACK');
                    throw error;
                }
            });
            return updated;
        }

        // File storage fallback
        const all = this.userGroupStore.readAll();
        const index = all.findIndex((group) => group.id === id);
        if (index === -1) return undefined;

        const updated = {
            ...all[index],
            ...body,
            updatedAt: now,
        };

        all[index] = updated;
        this.userGroupStore.writeAll(all);
        return updated;
    }

    async deleteUserGroup(id: string): Promise<void> {
        if (STORAGE_MODE === 'postgres') {
            await withPg(async (c) => {
                // Begin transaction
                await c.query('BEGIN');

                try {
                    // Delete related records first (foreign key constraints)
                    await c.query(
                        `delete from ${this.schema}.fnd_user_group_entities where group_id = $1`,
                        [id],
                    );
                    await c.query(
                        `delete from ${this.schema}.fnd_user_group_services where group_id = $1`,
                        [id],
                    );
                    await c.query(
                        `delete from ${this.schema}.fnd_user_group_roles where group_id = $1`,
                        [id],
                    );

                    // Delete main user group
                    await c.query(
                        `delete from ${this.schema}.fnd_user_groups where group_id = $1`,
                        [id],
                    );

                    await c.query('COMMIT');
                } catch (error) {
                    await c.query('ROLLBACK');
                    throw error;
                }
            });
            return;
        }

        // File storage fallback
        const next = this.userGroupStore
            .readAll()
            .filter((group) => group.id !== id);
        this.userGroupStore.writeAll(next);
    }

    async searchUserGroups(
        searchTerm: string,
        accountId?: string,
        enterpriseId?: string,
    ): Promise<UserGroupRecord[]> {
        const allGroups = await this.listUserGroups(accountId, enterpriseId);
        const query = searchTerm.toLowerCase();

        return allGroups.filter(
            (group) =>
                group.name.toLowerCase().includes(query) ||
                (group.description &&
                    group.description.toLowerCase().includes(query)),
        );
    }
}
