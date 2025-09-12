import {v4 as uuid} from 'uuid';
import {FsStore} from './fsStore';
import {STORAGE_MODE} from '../config';
import {withPg} from '../db';
import {AttributeRecord} from './userGroups';

export interface RoleAttributeAssignment {
    id: string;
    roleId: string;
    attributeId: string;
    enabled: boolean;
    assignedAt: string;
    updatedAt: string;
}

export class AttributesService {
    private store: FsStore<AttributeRecord>;
    private assignmentStore: FsStore<RoleAttributeAssignment>;
    private readonly schema: string;

    constructor(dir: string) {
        this.store = new FsStore<AttributeRecord>(dir, 'attributes.json');
        this.assignmentStore = new FsStore<RoleAttributeAssignment>(
            dir,
            'roleAttributeAssignments.json',
        );
        this.schema = process.env.PGSCHEMA || 'systiva'; // Use systiva schema for fnd_ tables
    }

    async list(): Promise<AttributeRecord[]> {
        if (STORAGE_MODE === 'postgres') {
            // Return default attributes since we don't have a separate attributes table
            return this.getDefaultAttributes();
        }

        return this.store.readAll();
    }

    private getDefaultAttributes(): AttributeRecord[] {
        return [
            {
                id: 'read_access',
                name: 'Read Access',
                description: 'Permission to view data',
                enabled: true,
            },
            {
                id: 'write_access',
                name: 'Write Access',
                description: 'Permission to create and edit data',
                enabled: false,
            },
            {
                id: 'delete_access',
                name: 'Delete Access',
                description: 'Permission to delete data',
                enabled: false,
            },
            {
                id: 'admin_access',
                name: 'Admin Access',
                description: 'Full administrative privileges',
                enabled: false,
            },
            {
                id: 'export_data',
                name: 'Export Data',
                description: 'Permission to export data',
                enabled: false,
            },
            {
                id: 'import_data',
                name: 'Import Data',
                description: 'Permission to import data',
                enabled: false,
            },
            {
                id: 'user_management',
                name: 'User Management',
                description: 'Permission to manage users',
                enabled: false,
            },
            {
                id: 'system_configuration',
                name: 'System Configuration',
                description: 'Permission to configure system settings',
                enabled: false,
            },
        ];
    }

    async get(id: string): Promise<AttributeRecord | undefined> {
        if (STORAGE_MODE === 'postgres') {
            const attributes = this.getDefaultAttributes();
            return attributes.find((attr) => attr.id === id);
        }

        return this.store.readAll().find((attr) => attr.id === id);
    }

    async create(body: Omit<AttributeRecord, 'id'>): Promise<AttributeRecord> {
        const id = uuid();
        const attribute: AttributeRecord = {
            id,
            name: body.name,
            description: body.description,
            enabled: body.enabled,
        };

        if (STORAGE_MODE === 'postgres') {
            const created = await withPg(async (c) => {
                await c.query(
                    `insert into ${this.schema}.attributes(
                        attribute_id, name, description, enabled
                    ) values($1, $2, $3, $4)`,
                    [
                        id,
                        attribute.name,
                        attribute.description || null,
                        attribute.enabled,
                    ],
                );
                return attribute;
            });
            return created;
        }

        const next = [...this.store.readAll(), attribute];
        this.store.writeAll(next);
        return attribute;
    }

    async update(
        id: string,
        body: Partial<Omit<AttributeRecord, 'id'>>,
    ): Promise<AttributeRecord | undefined> {
        if (STORAGE_MODE === 'postgres') {
            const updated = await withPg(async (c) => {
                const setClauses: string[] = [];
                const values: any[] = [id];
                let paramIndex = 2;

                if (body.name !== undefined) {
                    setClauses.push(`name = $${paramIndex++}`);
                    values.push(body.name);
                }
                if (body.description !== undefined) {
                    setClauses.push(`description = $${paramIndex++}`);
                    values.push(body.description);
                }
                if (body.enabled !== undefined) {
                    setClauses.push(`enabled = $${paramIndex++}`);
                    values.push(body.enabled);
                }

                if (setClauses.length === 0) return undefined;

                const sql = `update ${this.schema}.attributes
                           set ${setClauses.join(', ')}
                           where attribute_id = $1
                           returning attribute_id as id, name, description, enabled`;

                const res = await c.query(sql, values);
                return res.rows[0] as AttributeRecord | undefined;
            });
            return updated;
        }

        const all = this.store.readAll();
        const index = all.findIndex((attr) => attr.id === id);
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
                // Also remove attribute assignments
                await c.query(
                    `delete from ${this.schema}.role_attribute_assignments where attribute_id = $1`,
                    [id],
                );
                await c.query(
                    `delete from ${this.schema}.attributes where attribute_id = $1`,
                    [id],
                );
            });
            return;
        }

        // File storage fallback
        const nextAttributes = this.store
            .readAll()
            .filter((attr) => attr.id !== id);
        this.store.writeAll(nextAttributes);

        const nextAssignments = this.assignmentStore
            .readAll()
            .filter((assignment) => assignment.attributeId !== id);
        this.assignmentStore.writeAll(nextAssignments);
    }

    // Role-Attribute Assignment Methods
    async getAttributesForRole(roleId: string): Promise<AttributeRecord[]> {
        if (STORAGE_MODE === 'postgres') {
            // Return default attributes since we don't have role-attribute assignments in fnd_ tables
            return this.getDefaultAttributes();
        }

        // File storage fallback
        const allAttributes = this.store.readAll();
        const assignments = this.assignmentStore
            .readAll()
            .filter((a) => a.roleId === roleId);

        return allAttributes.map((attr) => {
            const assignment = assignments.find(
                (a) => a.attributeId === attr.id,
            );
            return {
                ...attr,
                enabled: assignment ? assignment.enabled : attr.enabled,
            };
        });
    }

    async updateRoleAttributes(
        roleId: string,
        attributes: AttributeRecord[],
    ): Promise<void> {
        const now = new Date().toISOString();

        if (STORAGE_MODE === 'postgres') {
            await withPg(async (c) => {
                // Begin transaction
                await c.query('BEGIN');

                try {
                    // Remove existing assignments for this role
                    await c.query(
                        `delete from ${this.schema}.role_attribute_assignments where role_id = $1`,
                        [roleId],
                    );

                    // Insert new assignments
                    for (const attr of attributes) {
                        const assignmentId = uuid();
                        await c.query(
                            `insert into ${this.schema}.role_attribute_assignments(
                                assignment_id, role_id, attribute_id, enabled, assigned_at, updated_at
                            ) values($1, $2, $3, $4, $5, $6)`,
                            [
                                assignmentId,
                                roleId,
                                attr.id,
                                attr.enabled,
                                now,
                                now,
                            ],
                        );
                    }

                    await c.query('COMMIT');
                } catch (error) {
                    await c.query('ROLLBACK');
                    throw error;
                }
            });
            return;
        }

        // File storage fallback
        const allAssignments = this.assignmentStore.readAll();
        const otherAssignments = allAssignments.filter(
            (a) => a.roleId !== roleId,
        );

        const newAssignments: RoleAttributeAssignment[] = attributes.map(
            (attr) => ({
                id: uuid(),
                roleId,
                attributeId: attr.id,
                enabled: attr.enabled,
                assignedAt: now,
                updatedAt: now,
            }),
        );

        this.assignmentStore.writeAll([...otherAssignments, ...newAssignments]);
    }

    async getAssignmentsForRole(
        roleId: string,
    ): Promise<RoleAttributeAssignment[]> {
        if (STORAGE_MODE === 'postgres') {
            const rows = await withPg(async (c) => {
                const res = await c.query(
                    `select
                        assignment_id as id,
                        role_id as "roleId",
                        attribute_id as "attributeId",
                        enabled,
                        assigned_at as "assignedAt",
                        updated_at as "updatedAt"
                    from ${this.schema}.role_attribute_assignments
                    where role_id = $1
                    order by assigned_at`,
                    [roleId],
                );

                return res.rows as RoleAttributeAssignment[];
            });
            return rows;
        }

        return this.assignmentStore
            .readAll()
            .filter((a) => a.roleId === roleId);
    }

    // Seed default attributes if none exist
    async seedDefaultAttributes(): Promise<void> {
        const existing = await this.list();
        if (existing.length > 0) return;

        const defaultAttributes: Omit<AttributeRecord, 'id'>[] = [
            {
                name: 'Read Access',
                description: 'Permission to view data',
                enabled: true,
            },
            {
                name: 'Write Access',
                description: 'Permission to create and edit data',
                enabled: false,
            },
            {
                name: 'Delete Access',
                description: 'Permission to delete data',
                enabled: false,
            },
            {
                name: 'Admin Access',
                description: 'Full administrative privileges',
                enabled: false,
            },
            {
                name: 'Export Data',
                description: 'Permission to export data',
                enabled: false,
            },
            {
                name: 'Import Data',
                description: 'Permission to import data',
                enabled: false,
            },
            {
                name: 'User Management',
                description: 'Permission to manage users',
                enabled: false,
            },
            {
                name: 'System Configuration',
                description: 'Permission to configure system settings',
                enabled: false,
            },
        ];

        for (const attr of defaultAttributes) {
            await this.create(attr);
        }
    }
}
