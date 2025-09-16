import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
import {withPg} from '../db';
import {RoleRecord, AttributeRecord} from './userGroups';

export interface RoleGroupAssignment {
    id: string;
    groupId: string;
    roleId: string;
    roleName: string;
    assignedAt: string;
}

export class RolesService {
    private store: FsStore<RoleRecord>;
    private assignmentStore: FsStore<RoleGroupAssignment>;
    private readonly schema: string;

    constructor(dir: string) {
        this.store = new FsStore<RoleRecord>(dir, 'roles.json');
        this.assignmentStore = new FsStore<RoleGroupAssignment>(
            dir,
            'roleGroupAssignments.json',
        );
        this.schema = process.env.PGSCHEMA || 'systiva'; // Use systiva schema for fnd_ tables
    }

    async list(): Promise<RoleRecord[]> {
        if (STORAGE_MODE === 'postgres') {
            const rows = await withPg(async (c) => {
                const res = await c.query(
                    `select distinct
                        role_id as id,
                        role_name as name,
                        role_description as description,
                        '[]'::json as permissions
                    from ${this.schema}.fnd_user_group_roles
                    order by role_name`,
                );

                return res.rows as RoleRecord[];
            });
            return rows;
        }

        return this.store.readAll();
    }

    async get(id: string): Promise<RoleRecord | undefined> {
        if (STORAGE_MODE === 'postgres') {
            const row = await withPg(async (c) => {
                const res = await c.query(
                    `select distinct
                        role_id as id,
                        role_name as name,
                        role_description as description,
                        '[]'::json as permissions
                    from ${this.schema}.fnd_user_group_roles
                    where role_id = $1
                    limit 1`,
                    [id],
                );

                if (res.rows.length === 0) return undefined;
                return res.rows[0] as RoleRecord;
            });
            return row;
        }

        return this.store.readAll().find((role) => role.id === id);
    }

    async create(body: Omit<RoleRecord, 'id'>): Promise<RoleRecord> {
        // Note: In the fnd_ table structure, roles are created when assigned to groups
        // This method is kept for API compatibility but doesn't create standalone roles
        const id = uuid();
        const role: RoleRecord = {
            id,
            name: body.name,
            description: body.description,
            permissions: body.permissions || [],
        };

        // File storage fallback only
        if (STORAGE_MODE !== 'postgres') {
            const next = [...this.store.readAll(), role];
            this.store.writeAll(next);
        }

        return role;
    }

    async update(
        id: string,
        body: Partial<Omit<RoleRecord, 'id'>>,
    ): Promise<RoleRecord | undefined> {
        if (STORAGE_MODE === 'postgres') {
            // Update role information in all group assignments
            const updated = await withPg(async (c) => {
                const setClauses: string[] = [];
                const values: any[] = [id];
                let paramIndex = 2;

                if (body.name !== undefined) {
                    setClauses.push(`role_name = $${paramIndex++}`);
                    values.push(body.name);
                }
                if (body.description !== undefined) {
                    setClauses.push(`role_description = $${paramIndex++}`);
                    values.push(body.description);
                }

                if (setClauses.length === 0) return undefined;

                const sql = `update ${this.schema}.fnd_user_group_roles
                           set ${setClauses.join(', ')}
                           where role_id = $1
                           returning role_id as id, role_name as name, role_description as description`;

                const res = await c.query(sql, values);
                if (res.rows.length === 0) return undefined;

                const row = res.rows[0];
                return {
                    ...row,
                    permissions: [],
                } as RoleRecord;
            });
            return updated;
        }

        const all = this.store.readAll();
        const index = all.findIndex((role) => role.id === id);
        if (index === -1) return undefined;

        const updated = {
            ...all[index],
            ...body,
        };

        all[index] = updated;
        this.store.writeAll(all);
        return updated;
    }

    async delete(id: string): Promise<void> {
        if (STORAGE_MODE === 'postgres') {
            await withPg(async (c) => {
                // Remove all group assignments for this role
                await c.query(
                    `delete from ${this.schema}.fnd_user_group_roles where role_id = $1`,
                    [id],
                );
            });
            return;
        }

        // File storage fallback
        const nextRoles = this.store.readAll().filter((role) => role.id !== id);
        this.store.writeAll(nextRoles);

        const nextAssignments = this.assignmentStore
            .readAll()
            .filter((assignment) => assignment.roleId !== id);
        this.assignmentStore.writeAll(nextAssignments);
    }

    // Role-Group Assignment Methods
    async getRolesForGroup(groupId: string): Promise<RoleRecord[]> {
        if (STORAGE_MODE === 'postgres') {
            const rows = await withPg(async (c) => {
                const res = await c.query(
                    `select
                        systiva.role_id as id,
                        systiva.role_name as name,
                        systiva.role_description as description,
                        '[]'::json as permissions
                    from ${this.schema}.fnd_user_group_roles systiva
                    where systiva.user_group_id = $1
                    order by systiva.role_name`,
                    [groupId],
                );

                return res.rows as RoleRecord[];
            });
            return rows;
        }

        // File storage fallback
        const assignments = this.assignmentStore
            .readAll()
            .filter((a) => a.groupId === groupId);
        const roles = this.store.readAll();

        return assignments
            .map((assignment) =>
                roles.find((role) => role.id === assignment.roleId),
            )
            .filter((role) => role !== undefined) as RoleRecord[];
    }

    async assignRoleToGroup(
        groupId: string,
        roleId: string,
        roleName: string,
    ): Promise<RoleGroupAssignment> {
        const id = uuid();
        const now = new Date().toISOString();

        const assignment: RoleGroupAssignment = {
            id,
            groupId,
            roleId,
            roleName,
            assignedAt: now,
        };

        if (STORAGE_MODE === 'postgres') {
            const created = await withPg(async (c) => {
                // Check if assignment already exists
                const existing = await c.query(
                    `select 1 from ${this.schema}.fnd_user_group_roles
                     where group_id = $1 and role_id = $2`,
                    [groupId, roleId],
                );

                if (existing.rows.length > 0) {
                    throw new Error('Role already assigned to group');
                }

                await c.query(
                    `insert into ${this.schema}.fnd_user_group_roles(
                        group_id, role_id, role_name, role_description
                    ) values($1, $2, $3, $4)`,
                    [groupId, roleId, roleName, null],
                );
                return assignment;
            });
            return created;
        }

        // File storage fallback
        const existing = this.assignmentStore
            .readAll()
            .find((a) => a.groupId === groupId && a.roleId === roleId);

        if (existing) {
            throw new Error('Role already assigned to group');
        }

        const next = [...this.assignmentStore.readAll(), assignment];
        this.assignmentStore.writeAll(next);
        return assignment;
    }

    async removeRoleFromGroup(groupId: string, roleId: string): Promise<void> {
        if (STORAGE_MODE === 'postgres') {
            await withPg(async (c) => {
                await c.query(
                    `delete from ${this.schema}.fnd_user_group_roles
                     where group_id = $1 and role_id = $2`,
                    [groupId, roleId],
                );
            });
            return;
        }

        // File storage fallback
        const next = this.assignmentStore
            .readAll()
            .filter((a) => !(a.groupId === groupId && a.roleId === roleId));
        this.assignmentStore.writeAll(next);
    }

    // Seed default roles if none exist
    async seedDefaultRoles(): Promise<void> {
        const existing = await this.list();
        if (existing.length > 0) return;

        const defaultRoles: Omit<RoleRecord, 'id'>[] = [
            {
                name: 'Super Admin',
                description: 'Full system access with all privileges',
                permissions: [
                    'read',
                    'write',
                    'delete',
                    'admin',
                    'user_management',
                    'system_config',
                ],
            },
            {
                name: 'System Admin',
                description: 'Administrative access to system configuration',
                permissions: ['read', 'write', 'system_config'],
            },
            {
                name: 'User Manager',
                description: 'Manage users and user groups',
                permissions: ['read', 'write', 'user_management'],
            },
            {
                name: 'Editor',
                description: 'Create and edit content',
                permissions: ['read', 'write'],
            },
            {
                name: 'Viewer',
                description: 'Read-only access to content',
                permissions: ['read'],
            },
        ];

        for (const role of defaultRoles) {
            await this.create(role);
        }
    }
}
