import {withPg} from '../db';
import bcrypt from 'bcrypt';

export interface UserRecord {
    id: number | string;
    firstName: string;
    middleName?: string;
    lastName: string;
    emailAddress: string;
    status: 'ACTIVE' | 'INACTIVE';
    startDate: string;
    endDate?: string | null;
    password?: string;
    technicalUser: boolean;
    hasPasswordHash?: boolean;
    assignedUserGroups?: number[];
    createdAt: string;
    updatedAt: string;
}

export interface CreateUserRequest {
    firstName: string;
    middleName?: string;
    lastName: string;
    emailAddress: string;
    status: 'Active' | 'Inactive' | 'ACTIVE' | 'INACTIVE';
    startDate: string;
    endDate?: string;
    password: string;
    technicalUser: boolean;
    assignedUserGroups?: number[];
}

export interface UpdateUserRequest {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    emailAddress?: string;
    status?: 'Active' | 'Inactive' | 'ACTIVE' | 'INACTIVE';
    startDate?: string;
    endDate?: string;
    technicalUser?: boolean;
    assignedUserGroups?: number[];
}

export interface UserListQuery {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    technicalUser?: boolean;
    groupId?: number;
    startDate?: string;
    endDate?: string;
}

export interface UserListResponse {
    users: UserRecord[];
    pagination: {
        currentPage: number;
        totalPages: number;
        totalUsers: number;
        limit: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}

export interface UserStats {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    technicalUsers: number;
    regularUsers: number;
    usersCreatedThisMonth: number;
    usersByGroup: Record<string, number>;
}

export class UsersService {
    private readonly schema: string;

    constructor() {
        this.schema = process.env.PGSCHEMA || 'systiva';
    }

    private async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, 10);
    }

    private async verifyPassword(
        password: string,
        hash: string,
    ): Promise<boolean> {
        return bcrypt.compare(password, hash);
    }

    private normalizeStatus(status: string): 'ACTIVE' | 'INACTIVE' {
        const upperStatus = status.toUpperCase();
        if (upperStatus === 'ACTIVE' || upperStatus === 'INACTIVE') {
            return upperStatus as 'ACTIVE' | 'INACTIVE';
        }
        return 'ACTIVE';
    }

    async listUsers(query: UserListQuery = {}): Promise<UserListResponse> {
        const page = query.page || 1;
        const limit = Math.min(query.limit || 50, 100);
        const offset = (page - 1) * limit;

        return await withPg(async (c) => {
            const whereClauses: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (query.search) {
                whereClauses.push(`(
                    first_name ILIKE $${paramIndex} OR
                    last_name ILIKE $${paramIndex} OR
                    email_address ILIKE $${paramIndex}
                )`);
                values.push(`%${query.search}%`);
                paramIndex++;
            }

            if (query.status) {
                whereClauses.push(`status = $${paramIndex}`);
                values.push(query.status);
                paramIndex++;
            }

            if (query.technicalUser !== undefined) {
                whereClauses.push(`technical_user = $${paramIndex}`);
                values.push(query.technicalUser);
                paramIndex++;
            }

            if (query.startDate) {
                whereClauses.push(`start_date >= $${paramIndex}`);
                values.push(query.startDate);
                paramIndex++;
            }

            if (query.endDate) {
                whereClauses.push(`end_date <= $${paramIndex}`);
                values.push(query.endDate);
                paramIndex++;
            }

            const whereClause =
                whereClauses.length > 0
                    ? `WHERE ${whereClauses.join(' AND ')}`
                    : '';

            const countRes = await c.query(
                `SELECT COUNT(*) FROM ${this.schema}.fnd_users ${whereClause}`,
                values,
            );
            const totalUsers = parseInt(countRes.rows[0].count);

            const res = await c.query(
                `SELECT
                    id,
                    first_name as "firstName",
                    middle_name as "middleName",
                    last_name as "lastName",
                    email_address as "emailAddress",
                    status,
                    start_date as "startDate",
                    end_date as "endDate",
                    technical_user as "technicalUser",
                    CASE WHEN password_hash IS NOT NULL AND password_hash != '' THEN true ELSE false END as "hasPasswordHash",
                    created_at as "createdAt",
                    updated_at as "updatedAt"
                FROM ${this.schema}.fnd_users
                ${whereClause}
                ORDER BY created_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
                [...values, limit, offset],
            );

            return {
                users: res.rows,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalUsers / limit),
                    totalUsers,
                    limit,
                    hasNext: offset + limit < totalUsers,
                    hasPrev: page > 1,
                },
            };
        });
    }

    async getById(id: string | number): Promise<UserRecord | undefined> {
        return await withPg(async (c) => {
            const res = await c.query(
                `SELECT
                    id,
                    first_name as "firstName",
                    middle_name as "middleName",
                    last_name as "lastName",
                    email_address as "emailAddress",
                    status,
                    start_date as "startDate",
                    end_date as "endDate",
                    technical_user as "technicalUser",
                    CASE WHEN password_hash IS NOT NULL AND password_hash != '' THEN true ELSE false END as "hasPasswordHash",
                    assigned_user_group as "assignedUserGroups",
                    created_at as "createdAt",
                    updated_at as "updatedAt"
                FROM ${this.schema}.fnd_users
                WHERE id = $1`,
                [parseInt(id.toString())],
            );
            return res.rows[0] || undefined;
        });
    }

    async getByEmailAddress(email: string): Promise<UserRecord | undefined> {
        return await withPg(async (c) => {
            const res = await c.query(
                `SELECT
                    id,
                    first_name as "firstName",
                    middle_name as "middleName",
                    last_name as "lastName",
                    email_address as "emailAddress",
                    status,
                    start_date as "startDate",
                    end_date as "endDate",
                    technical_user as "technicalUser",
                    created_at as "createdAt",
                    updated_at as "updatedAt"
                FROM ${this.schema}.fnd_users
                WHERE email_address = $1`,
                [email],
            );
            return res.rows[0] || undefined;
        });
    }

    async createUser(body: CreateUserRequest): Promise<UserRecord> {
        const now = new Date().toISOString();
        const hashedPassword = await this.hashPassword(body.password);
        const normalizedStatus = this.normalizeStatus(body.status);

        return await withPg(async (c) => {
            const res = await c.query(
                `INSERT INTO ${this.schema}.fnd_users (
                    first_name, middle_name, last_name, email_address,
                    status, start_date, end_date, password_hash, technical_user,
                    created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING
                    id,
                    first_name as "firstName",
                    middle_name as "middleName",
                    last_name as "lastName",
                    email_address as "emailAddress",
                    status,
                    start_date as "startDate",
                    end_date as "endDate",
                    technical_user as "technicalUser",
                    CASE WHEN password_hash IS NOT NULL AND password_hash != '' THEN true ELSE false END as "hasPasswordHash",
                    created_at as "createdAt",
                    updated_at as "updatedAt"`,
                [
                    body.firstName,
                    body.middleName,
                    body.lastName,
                    body.emailAddress,
                    normalizedStatus,
                    body.startDate,
                    body.endDate,
                    hashedPassword,
                    body.technicalUser,
                    now,
                    now,
                ],
            );
            const createdUser = res.rows[0];
            createdUser.assignedUserGroups = body.assignedUserGroups || [];
            return createdUser;
        });
    }

    async updateUser(
        id: string | number,
        body: UpdateUserRequest,
    ): Promise<UserRecord | undefined> {
        return await withPg(async (c) => {
            const setClauses: string[] = [];
            const values: any[] = [parseInt(id.toString())];
            let paramIndex = 2;

            if (body.firstName !== undefined) {
                setClauses.push(`first_name = $${paramIndex++}`);
                values.push(body.firstName);
            }
            if (body.middleName !== undefined) {
                setClauses.push(`middle_name = $${paramIndex++}`);
                values.push(body.middleName);
            }
            if (body.lastName !== undefined) {
                setClauses.push(`last_name = $${paramIndex++}`);
                values.push(body.lastName);
            }
            if (body.emailAddress !== undefined) {
                setClauses.push(`email_address = $${paramIndex++}`);
                values.push(body.emailAddress);
            }
            if (body.status !== undefined) {
                setClauses.push(`status = $${paramIndex++}`);
                values.push(this.normalizeStatus(body.status));
            }
            if (body.startDate !== undefined) {
                setClauses.push(`start_date = $${paramIndex++}`);
                values.push(body.startDate);
            }
            if (body.endDate !== undefined) {
                setClauses.push(`end_date = $${paramIndex++}`);
                values.push(body.endDate);
            }
            if (body.technicalUser !== undefined) {
                setClauses.push(`technical_user = $${paramIndex++}`);
                values.push(body.technicalUser);
            }
            if (body.assignedUserGroups !== undefined) {
                setClauses.push(`assigned_user_group = $${paramIndex++}`);
                values.push(body.assignedUserGroups);
            }

            setClauses.push(`updated_at = $${paramIndex++}`);
            values.push(new Date().toISOString());

            if (setClauses.length === 1) return undefined;

            const sql = `
                UPDATE ${this.schema}.fnd_users
                SET ${setClauses.join(', ')}
                WHERE id = $1
                RETURNING
                    id,
                    first_name as "firstName",
                    middle_name as "middleName",
                    last_name as "lastName",
                    email_address as "emailAddress",
                    status,
                    start_date as "startDate",
                    end_date as "endDate",
                    technical_user as "technicalUser",
                    CASE WHEN password_hash IS NOT NULL AND password_hash != '' THEN true ELSE false END as "hasPasswordHash",
                    assigned_user_group as "assignedUserGroups",
                    created_at as "createdAt",
                    updated_at as "updatedAt"
            `;

            const res = await c.query(sql, values);
            return res.rows[0] || undefined;
        });
    }

    async deleteUser(id: string | number): Promise<boolean> {
        return await withPg(async (c) => {
            const res = await c.query(
                `DELETE FROM ${this.schema}.fnd_users WHERE id = $1`,
                [parseInt(id.toString())],
            );
            return res.rowCount && res.rowCount > 0;
        });
    }

    async updatePassword(
        id: string,
        currentPassword: string,
        newPassword: string,
    ): Promise<boolean> {
        return await withPg(async (c) => {
            const userRes = await c.query(
                `SELECT password_hash FROM ${this.schema}.fnd_users WHERE id = $1`,
                [id],
            );

            if (userRes.rows.length === 0) return false;

            const isValid = await this.verifyPassword(
                currentPassword,
                userRes.rows[0].password_hash,
            );
            if (!isValid) return false;

            const hashedPassword = await this.hashPassword(newPassword);
            const updateRes = await c.query(
                `UPDATE ${this.schema}.fnd_users SET password_hash = $1, updated_at = $2 WHERE id = $3`,
                [hashedPassword, new Date().toISOString(), id],
            );

            return updateRes.rowCount > 0;
        });
    }

    async resetPassword(id: string, newPassword: string): Promise<boolean> {
        return await withPg(async (c) => {
            const hashedPassword = await this.hashPassword(newPassword);
            const res = await c.query(
                `UPDATE ${this.schema}.fnd_users SET password_hash = $1, updated_at = $2 WHERE id = $3`,
                [hashedPassword, new Date().toISOString(), id],
            );
            return res.rowCount > 0;
        });
    }

    async isEmailAvailable(
        email: string,
        excludeUserId?: string,
    ): Promise<boolean> {
        return await withPg(async (c) => {
            const query = excludeUserId
                ? `SELECT id FROM ${this.schema}.fnd_users WHERE email_address = $1 AND id != $2`
                : `SELECT id FROM ${this.schema}.fnd_users WHERE email_address = $1`;

            const values = excludeUserId ? [email, excludeUserId] : [email];
            const res = await c.query(query, values);

            return res.rows.length === 0;
        });
    }

    async bulkCreate(
        userRequests: CreateUserRequest[],
    ): Promise<{created: UserRecord[]; errors: any[]}> {
        const created: UserRecord[] = [];
        const errors: any[] = [];

        for (let i = 0; i < userRequests.length; i++) {
            try {
                const user = await this.createUser(userRequests[i]);
                created.push(user);
            } catch (error) {
                errors.push({
                    index: i,
                    user: userRequests[i],
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                });
            }
        }

        return {created, errors};
    }

    async bulkUpdate(
        updates: {id: string; data: UpdateUserRequest}[],
    ): Promise<{updated: UserRecord[]; errors: any[]}> {
        const updated: UserRecord[] = [];
        const errors: any[] = [];

        for (let i = 0; i < updates.length; i++) {
            try {
                const user = await this.updateUser(
                    updates[i].id,
                    updates[i].data,
                );
                if (user) {
                    updated.push(user);
                } else {
                    errors.push({
                        index: i,
                        update: updates[i],
                        error: 'User not found',
                    });
                }
            } catch (error) {
                errors.push({
                    index: i,
                    update: updates[i],
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                });
            }
        }

        return {updated, errors};
    }

    async bulkDelete(
        userIds: string[],
    ): Promise<{deleted: string[]; errors: any[]}> {
        const deleted: string[] = [];
        const errors: any[] = [];

        for (let i = 0; i < userIds.length; i++) {
            try {
                const success = await this.deleteUser(userIds[i]);
                if (success) {
                    deleted.push(userIds[i]);
                } else {
                    errors.push({
                        index: i,
                        userId: userIds[i],
                        error: 'User not found',
                    });
                }
            } catch (error) {
                errors.push({
                    index: i,
                    userId: userIds[i],
                    error:
                        error instanceof Error
                            ? error.message
                            : 'Unknown error',
                });
            }
        }

        return {deleted, errors};
    }

    async getStats(): Promise<UserStats> {
        return await withPg(async (c) => {
            const totalRes = await c.query(
                `SELECT COUNT(*) FROM ${this.schema}.fnd_users`,
            );
            const activeRes = await c.query(
                `SELECT COUNT(*) FROM ${this.schema}.fnd_users WHERE status = 'ACTIVE'`,
            );
            const inactiveRes = await c.query(
                `SELECT COUNT(*) FROM ${this.schema}.fnd_users WHERE status = 'INACTIVE'`,
            );
            const technicalRes = await c.query(
                `SELECT COUNT(*) FROM ${this.schema}.fnd_users WHERE technical_user = true`,
            );

            const now = new Date();
            const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const thisMonthRes = await c.query(
                `SELECT COUNT(*) FROM ${this.schema}.fnd_users WHERE created_at >= $1`,
                [thisMonth.toISOString()],
            );

            return {
                totalUsers: parseInt(totalRes.rows[0].count),
                activeUsers: parseInt(activeRes.rows[0].count),
                inactiveUsers: parseInt(inactiveRes.rows[0].count),
                technicalUsers: parseInt(technicalRes.rows[0].count),
                regularUsers:
                    parseInt(totalRes.rows[0].count) -
                    parseInt(technicalRes.rows[0].count),
                usersCreatedThisMonth: parseInt(thisMonthRes.rows[0].count),
                usersByGroup: {}, // TODO: Implement when groups are properly linked
            };
        });
    }
}
