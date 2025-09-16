import {withPg} from '../db';

export interface Account {
    id: number;
    accountName: string;
    masterAccountId?: string;
    masterAccountName?: string;
    contactName?: string;
    contactTitle?: string;
    contactEmail?: string;
    contactPhone?: string;
    licenseId?: string;
}

export class AccountsService {
    private readonly schema: string;

    constructor(dir: string) {
        this.schema = process.env.PGSCHEMA || 'systiva'; // Use systiva schema for existing tables
    }

    async list(): Promise<Account[]> {
        const result = await withPg(async (c) => {
            const res = await c.query(
                `select
                    account_id as id,
                    account_name as "accountName",
                    master_account_id as "masterAccountId",
                    master_account_name as "masterAccountName",
                    contact_name as "contactName",
                    contact_title as "contactTitle",
                    contact_email as "contactEmail",
                    contact_phone as "contactPhone",
                    license_id as "licenseId"
                from ${this.schema}.fnd_accounts
                order by account_name`,
            );
            return res.rows as Account[];
        });
        return result;
    }

    async create(body: Omit<Account, 'id'>): Promise<Account> {
        const created = await withPg(async (c) => {
            const res = await c.query(
                `insert into ${this.schema}.fnd_accounts(
                    account_name, master_account_id, master_account_name, contact_name, contact_title, contact_email, contact_phone, license_id
                ) values($1, $2, $3, $4, $5, $6, $7, $8)
                returning account_id as id, account_name as "accountName", master_account_id as "masterAccountId", master_account_name as "masterAccountName", contact_name as "contactName", contact_title as "contactTitle", contact_email as "contactEmail", contact_phone as "contactPhone", license_id as "licenseId"`,
                [
                    body.accountName,
                    body.masterAccountId || null,
                    body.masterAccountName || null,
                    body.contactName || null,
                    body.contactTitle || null,
                    body.contactEmail || null,
                    body.contactPhone || null,
                    body.licenseId || null,
                ],
            );
            return res.rows[0] as Account;
        });
        return created;
    }

    async update(
        id: number,
        body: Omit<Account, 'id'>,
    ): Promise<Account | undefined> {
        const updated = await withPg(async (c) => {
            const res = await c.query(
                `update ${this.schema}.fnd_accounts set
                    account_name = $2,
                    master_account_id = $3,
                    master_account_name = $4,
                    contact_name = $5,
                    contact_title = $6,
                    contact_email = $7,
                    contact_phone = $8,
                    license_id = $9
                where account_id = $1
                returning account_id as id, account_name as "accountName", master_account_id as "masterAccountId", master_account_name as "masterAccountName", contact_name as "contactName", contact_title as "contactTitle", contact_email as "contactEmail", contact_phone as "contactPhone", license_id as "licenseId"`,
                [
                    id,
                    body.accountName,
                    body.masterAccountId || null,
                    body.masterAccountName || null,
                    body.contactName || null,
                    body.contactTitle || null,
                    body.contactEmail || null,
                    body.contactPhone || null,
                    body.licenseId || null,
                ],
            );
            return (res.rows[0] as Account) || undefined;
        });
        return updated;
    }

    async remove(id: number): Promise<void> {
        await withPg(async (c) => {
            await c.query(
                `delete from ${this.schema}.fnd_accounts where account_id = $1`,
                [id],
            );
        });
    }

    async get(id: number): Promise<Account | null> {
        const row = await withPg(async (c) => {
            const res = await c.query(
                `select
                    account_id as id,
                    account_name as "accountName",
                    master_account_id as "masterAccountId",
                    master_account_name as "masterAccountName",
                    contact_name as "contactName",
                    contact_title as "contactTitle",
                    contact_email as "contactEmail",
                    contact_phone as "contactPhone",
                    license_id as "licenseId"
                from ${this.schema}.fnd_accounts
                where account_id = $1`,
                [id],
            );
            return (res.rows[0] as Account) || null;
        });
        return row;
    }
}
