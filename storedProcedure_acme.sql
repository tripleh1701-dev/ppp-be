--
-- PostgreSQL Stored Procedures for Access Control System
-- Schema: acme (hardcoded for reliability)
-- Matches existing application schema exactly
--

-- Function to create enterprises table
CREATE OR REPLACE FUNCTION acme.create_fnd_enterprise_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_enterprise (
        enterprise_id SERIAL PRIMARY KEY,
        enterprise_name VARCHAR(255) NOT NULL,
        created_by VARCHAR(100),
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_by VARCHAR(100),
        last_update_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_enterprise_name ON acme.fnd_enterprise(enterprise_name);

    RAISE NOTICE 'Table acme.fnd_enterprise created successfully';
END;
$$;

-- Function to create accounts table
CREATE OR REPLACE FUNCTION acme.create_fnd_accounts_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_accounts (
        account_id SERIAL PRIMARY KEY,
        account_name VARCHAR(255),
        master_account_id VARCHAR(100),
        master_account_name VARCHAR(255),
        contact_name VARCHAR(255),
        contact_title VARCHAR(255),
        contact_email VARCHAR(255),
        contact_phone VARCHAR(50),
        license_id INTEGER,
        created_by VARCHAR(100),
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_by VARCHAR(100),
        last_update_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        details JSONB DEFAULT '{}'::jsonb
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_accounts_master_account_id ON acme.fnd_accounts(master_account_id);
    CREATE INDEX IF NOT EXISTS idx_fnd_accounts_name ON acme.fnd_accounts(account_name);

    RAISE NOTICE 'Table acme.fnd_accounts created successfully';
END;
$$;

-- Function to create account addresses table
CREATE OR REPLACE FUNCTION acme.create_fnd_account_addresses_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_account_addresses (
        address_id SERIAL PRIMARY KEY,
        account_id INTEGER,
        address_line_1 VARCHAR(255),
        address_line_2 VARCHAR(255),
        city VARCHAR(100),
        state VARCHAR(100),
        country VARCHAR(100),
        zip_code VARCHAR(20),
        created_by VARCHAR(100),
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_by VARCHAR(100),
        last_update_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_account_addresses_account_id ON acme.fnd_account_addresses(account_id);

    -- Add foreign key constraint
    ALTER TABLE acme.fnd_account_addresses
    ADD CONSTRAINT fk_account_addresses_account_id
    FOREIGN KEY (account_id) REFERENCES acme.fnd_accounts(account_id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_account_addresses created successfully';
END;
$$;

-- Function to create license details table
CREATE OR REPLACE FUNCTION acme.create_fnd_license_details_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_license_details (
        license_id SERIAL PRIMARY KEY,
        account_id INTEGER,
        license_type VARCHAR(100),
        license_start_date DATE,
        license_end_date DATE,
        created_by VARCHAR(100),
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_by VARCHAR(100),
        last_update_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_license_details_account_id ON acme.fnd_license_details(account_id);

    -- Add foreign key constraint
    ALTER TABLE acme.fnd_license_details
    ADD CONSTRAINT fk_license_details_account_id
    FOREIGN KEY (account_id) REFERENCES acme.fnd_accounts(account_id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_license_details created successfully';
END;
$$;

-- Function to create technical users table
CREATE OR REPLACE FUNCTION acme.create_fnd_account_technical_users_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_account_technical_users (
        tech_user_id SERIAL PRIMARY KEY,
        account_id INTEGER,
        tech_user_name VARCHAR(255),
        tech_user_email VARCHAR(255),
        tech_user_phone VARCHAR(50),
        created_by VARCHAR(100),
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_by VARCHAR(100),
        last_update_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_tech_users_account_id ON acme.fnd_account_technical_users(account_id);

    -- Add foreign key constraint
    ALTER TABLE acme.fnd_account_technical_users
    ADD CONSTRAINT fk_tech_users_account_id
    FOREIGN KEY (account_id) REFERENCES acme.fnd_accounts(account_id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_account_technical_users created successfully';
END;
$$;

-- Function to create products table
CREATE OR REPLACE FUNCTION acme.create_fnd_products_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_products (
        product_id SERIAL PRIMARY KEY,
        product_name VARCHAR(255),
        product_type VARCHAR(100),
        created_by VARCHAR(100),
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_by VARCHAR(100),
        last_update_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_products_name ON acme.fnd_products(product_name);

    RAISE NOTICE 'Table acme.fnd_products created successfully';
END;
$$;

-- Function to create services table
CREATE OR REPLACE FUNCTION acme.create_fnd_services_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_services (
        service_id SERIAL PRIMARY KEY,
        service_name VARCHAR(255),
        service_type VARCHAR(100),
        created_by VARCHAR(100),
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_by VARCHAR(100),
        last_update_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_services_name ON acme.fnd_services(service_name);

    RAISE NOTICE 'Table acme.fnd_services created successfully';
END;
$$;

-- Function to create enterprise products services table
CREATE OR REPLACE FUNCTION acme.create_fnd_enterprise_products_services_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_enterprise_products_services (
        id SERIAL PRIMARY KEY,
        enterprise_id INTEGER,
        product_id INTEGER,
        service_id INTEGER[],
        created_by VARCHAR(100),
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_by VARCHAR(100),
        last_update_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_eps_enterprise_id ON acme.fnd_enterprise_products_services(enterprise_id);
    CREATE INDEX IF NOT EXISTS idx_fnd_eps_product_id ON acme.fnd_enterprise_products_services(product_id);

    -- Add foreign key constraints
    ALTER TABLE acme.fnd_enterprise_products_services
    ADD CONSTRAINT fk_eps_enterprise_id
    FOREIGN KEY (enterprise_id) REFERENCES acme.fnd_enterprise(enterprise_id) ON DELETE CASCADE;

    ALTER TABLE acme.fnd_enterprise_products_services
    ADD CONSTRAINT fk_eps_product_id
    FOREIGN KEY (product_id) REFERENCES acme.fnd_products(product_id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_enterprise_products_services created successfully';
END;
$$;

-- Function to create business unit settings table
CREATE OR REPLACE FUNCTION acme.create_fnd_business_unit_settings_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_business_unit_settings (
        bu_id SERIAL PRIMARY KEY,
        account_id INTEGER,
        enterprise_id INTEGER,
        entities VARCHAR(500),
        created_by VARCHAR(100),
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_updated_by VARCHAR(100),
        last_update_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_bu_settings_account_id ON acme.fnd_business_unit_settings(account_id);
    CREATE INDEX IF NOT EXISTS idx_fnd_bu_settings_enterprise_id ON acme.fnd_business_unit_settings(enterprise_id);

    -- Add foreign key constraints
    ALTER TABLE acme.fnd_business_unit_settings
    ADD CONSTRAINT fk_bu_settings_account_id
    FOREIGN KEY (account_id) REFERENCES acme.fnd_accounts(account_id) ON DELETE CASCADE;

    ALTER TABLE acme.fnd_business_unit_settings
    ADD CONSTRAINT fk_bu_settings_enterprise_id
    FOREIGN KEY (enterprise_id) REFERENCES acme.fnd_enterprise(enterprise_id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_business_unit_settings created successfully';
END;
$$;

-- Function to create global clients table
CREATE OR REPLACE FUNCTION acme.create_fnd_global_clients_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_global_clients (
        global_client_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        global_client_name TEXT NOT NULL UNIQUE,
        industry TEXT,
        region TEXT,
        creation_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_update_date TIMESTAMP WITH TIME ZONE
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_global_clients_name ON acme.fnd_global_clients(global_client_name);

    RAISE NOTICE 'Table acme.fnd_global_clients created successfully';
END;
$$;

-- Function to create user groups table
CREATE OR REPLACE FUNCTION acme.create_fnd_user_groups_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_user_groups (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL,
        enterprise_id INTEGER NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        entity_id VARCHAR(100),
        service_id VARCHAR(20) DEFAULT 'active',
        created_by INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT acme_user_groups_status_check CHECK ((service_id = ANY (ARRAY['active'::character varying, 'inactive'::character varying]))),
        UNIQUE(account_id, enterprise_id, entity_id)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_user_groups_account_id ON acme.fnd_user_groups(account_id);
    CREATE INDEX IF NOT EXISTS idx_user_groups_enterprise_id ON acme.fnd_user_groups(enterprise_id);
    CREATE INDEX IF NOT EXISTS idx_user_groups_entity_id ON acme.fnd_user_groups(entity_id);
    CREATE INDEX IF NOT EXISTS idx_user_groups_status ON acme.fnd_user_groups(service_id);
    CREATE INDEX IF NOT EXISTS idx_user_groups_created_by ON acme.fnd_user_groups(created_by);

    -- Add foreign key constraints
    ALTER TABLE acme.fnd_user_groups
    ADD CONSTRAINT fk_user_groups_account_id
    FOREIGN KEY (account_id) REFERENCES acme.fnd_accounts(account_id) ON DELETE CASCADE;

    ALTER TABLE acme.fnd_user_groups
    ADD CONSTRAINT fk_user_groups_enterprise_id
    FOREIGN KEY (enterprise_id) REFERENCES acme.fnd_enterprise(enterprise_id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_user_groups created successfully';
END;
$$;

-- Function to create user group entities table
CREATE OR REPLACE FUNCTION acme.create_fnd_user_group_entities_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_user_group_entities (
        id SERIAL PRIMARY KEY,
        user_group_id INTEGER NOT NULL,
        entity_id INTEGER NOT NULL,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        assigned_by INTEGER,
        UNIQUE(user_group_id, entity_id)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_user_group_entities_group_id ON acme.fnd_user_group_entities(user_group_id);
    CREATE INDEX IF NOT EXISTS idx_user_group_entities_entity_id ON acme.fnd_user_group_entities(entity_id);
    CREATE INDEX IF NOT EXISTS idx_user_group_entities_assigned_by ON acme.fnd_user_group_entities(assigned_by);

    -- Add foreign key constraints
    ALTER TABLE acme.fnd_user_group_entities
    ADD CONSTRAINT fk_user_group_entities_group_id
    FOREIGN KEY (user_group_id) REFERENCES acme.fnd_user_groups(id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_user_group_entities created successfully';
END;
$$;

-- Function to create user group services table
CREATE OR REPLACE FUNCTION acme.create_fnd_user_group_services_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_user_group_services (
        id SERIAL PRIMARY KEY,
        user_group_id INTEGER NOT NULL,
        service_id INTEGER NOT NULL,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        assigned_by INTEGER,
        UNIQUE(user_group_id, service_id)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_user_group_services_group_id ON acme.fnd_user_group_services(user_group_id);
    CREATE INDEX IF NOT EXISTS idx_user_group_services_service_id ON acme.fnd_user_group_services(service_id);
    CREATE INDEX IF NOT EXISTS idx_user_group_services_assigned_by ON acme.fnd_user_group_services(assigned_by);

    -- Add foreign key constraints
    ALTER TABLE acme.fnd_user_group_services
    ADD CONSTRAINT fk_user_group_services_group_id
    FOREIGN KEY (user_group_id) REFERENCES acme.fnd_user_groups(id) ON DELETE CASCADE;

    ALTER TABLE acme.fnd_user_group_services
    ADD CONSTRAINT fk_user_group_services_service_id
    FOREIGN KEY (service_id) REFERENCES acme.fnd_services(service_id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_user_group_services created successfully';
END;
$$;

-- Function to create user group roles table
CREATE OR REPLACE FUNCTION acme.create_fnd_user_group_roles_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_user_group_roles (
        id SERIAL PRIMARY KEY,
        user_group_id INTEGER NOT NULL,
        role_id INTEGER NOT NULL,
        assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        assigned_by INTEGER,
        role_name VARCHAR(255),
        role_description VARCHAR(255),
        account_id BIGINT,
        enterprise_id BIGINT,
        UNIQUE(user_group_id, role_id)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_user_group_roles_group_id ON acme.fnd_user_group_roles(user_group_id);
    CREATE INDEX IF NOT EXISTS idx_user_group_roles_role_id ON acme.fnd_user_group_roles(role_id);
    CREATE INDEX IF NOT EXISTS idx_user_group_roles_assigned_by ON acme.fnd_user_group_roles(assigned_by);
    CREATE INDEX IF NOT EXISTS idx_user_group_roles_account_id ON acme.fnd_user_group_roles(account_id);
    CREATE INDEX IF NOT EXISTS idx_user_group_roles_enterprise_id ON acme.fnd_user_group_roles(enterprise_id);

    -- Add foreign key constraints
    ALTER TABLE acme.fnd_user_group_roles
    ADD CONSTRAINT fk_user_group_roles_group_id
    FOREIGN KEY (user_group_id) REFERENCES acme.fnd_user_groups(id) ON DELETE CASCADE;

    ALTER TABLE acme.fnd_user_group_roles
    ADD CONSTRAINT fk_user_group_roles_account_id
    FOREIGN KEY (account_id) REFERENCES acme.fnd_accounts(account_id) ON DELETE CASCADE;

    ALTER TABLE acme.fnd_user_group_roles
    ADD CONSTRAINT fk_user_group_roles_enterprise_id
    FOREIGN KEY (enterprise_id) REFERENCES acme.fnd_enterprise(enterprise_id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_user_group_roles created successfully';
END;
$$;

-- Function to create users table
CREATE OR REPLACE FUNCTION acme.create_fnd_users_table() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    CREATE TABLE IF NOT EXISTS acme.fnd_users (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(50) NOT NULL,
        middle_name VARCHAR(50),
        last_name VARCHAR(50) NOT NULL,
        email_address VARCHAR(255) NOT NULL UNIQUE,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        start_date DATE NOT NULL,
        end_date DATE,
        password_hash VARCHAR(255),
        assigned_user_group INTEGER[],
        enterprise_id INTEGER,
        account_id INTEGER,
        created_by INTEGER,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP WITH TIME ZONE,
        failed_login_attempts INTEGER DEFAULT 0,
        account_locked_until TIMESTAMP WITH TIME ZONE,
        password_expires_at TIMESTAMP WITH TIME ZONE,
        must_change_password BOOLEAN DEFAULT true,
        is_technical_user BOOLEAN DEFAULT false,
        technical_user BOOLEAN DEFAULT false,
        CONSTRAINT acme_fnd_users_status_check CHECK ((status IN ('ACTIVE', 'INACTIVE', 'LOCKED', 'SUSPENDED')))
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_fnd_users_email ON acme.fnd_users(email_address);
    CREATE INDEX IF NOT EXISTS idx_fnd_users_status ON acme.fnd_users(status);
    CREATE INDEX IF NOT EXISTS idx_fnd_users_account_id ON acme.fnd_users(account_id);
    CREATE INDEX IF NOT EXISTS idx_fnd_users_enterprise_id ON acme.fnd_users(enterprise_id);
    CREATE INDEX IF NOT EXISTS idx_fnd_users_start_date ON acme.fnd_users(start_date);
    CREATE INDEX IF NOT EXISTS idx_fnd_users_end_date ON acme.fnd_users(end_date);
    CREATE INDEX IF NOT EXISTS idx_fnd_users_user_group ON acme.fnd_users(assigned_user_group);

    -- Add foreign key constraints
    ALTER TABLE acme.fnd_users
    ADD CONSTRAINT fk_users_account_id
    FOREIGN KEY (account_id) REFERENCES acme.fnd_accounts(account_id) ON DELETE CASCADE;

    ALTER TABLE acme.fnd_users
    ADD CONSTRAINT fk_users_enterprise_id
    FOREIGN KEY (enterprise_id) REFERENCES acme.fnd_enterprise(enterprise_id) ON DELETE CASCADE;

    RAISE NOTICE 'Table acme.fnd_users created successfully';
END;
$$;

-- Function to create update triggers
CREATE OR REPLACE FUNCTION acme.create_update_triggers() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Create trigger function for last_update_date
    CREATE OR REPLACE FUNCTION acme.update_last_update_date()
    RETURNS TRIGGER AS $trigger$
    BEGIN
        NEW.last_update_date = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $trigger$ LANGUAGE plpgsql;

    -- Create trigger function for updated_at
    CREATE OR REPLACE FUNCTION acme.update_fnd_users_updated_at()
    RETURNS TRIGGER AS $trigger$
    BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
    END;
    $trigger$ LANGUAGE plpgsql;

    -- Create triggers for all tables with last_update_date
    DROP TRIGGER IF EXISTS trg_update_fnd_accounts ON acme.fnd_accounts;
    CREATE TRIGGER trg_update_fnd_accounts
        BEFORE UPDATE ON acme.fnd_accounts
        FOR EACH ROW EXECUTE FUNCTION acme.update_last_update_date();

    DROP TRIGGER IF EXISTS trg_update_fnd_account_addresses ON acme.fnd_account_addresses;
    CREATE TRIGGER trg_update_fnd_account_addresses
        BEFORE UPDATE ON acme.fnd_account_addresses
        FOR EACH ROW EXECUTE FUNCTION acme.update_last_update_date();

    DROP TRIGGER IF EXISTS trg_update_fnd_account_technical_users ON acme.fnd_account_technical_users;
    CREATE TRIGGER trg_update_fnd_account_technical_users
        BEFORE UPDATE ON acme.fnd_account_technical_users
        FOR EACH ROW EXECUTE FUNCTION acme.update_last_update_date();

    DROP TRIGGER IF EXISTS trg_update_fnd_enterprise ON acme.fnd_enterprise;
    CREATE TRIGGER trg_update_fnd_enterprise
        BEFORE UPDATE ON acme.fnd_enterprise
        FOR EACH ROW EXECUTE FUNCTION acme.update_last_update_date();

    DROP TRIGGER IF EXISTS trg_update_fnd_products ON acme.fnd_products;
    CREATE TRIGGER trg_update_fnd_products
        BEFORE UPDATE ON acme.fnd_products
        FOR EACH ROW EXECUTE FUNCTION acme.update_last_update_date();

    DROP TRIGGER IF EXISTS trg_update_fnd_services ON acme.fnd_services;
    CREATE TRIGGER trg_update_fnd_services
        BEFORE UPDATE ON acme.fnd_services
        FOR EACH ROW EXECUTE FUNCTION acme.update_last_update_date();

    DROP TRIGGER IF EXISTS trg_update_fnd_enterprise_products_services ON acme.fnd_enterprise_products_services;
    CREATE TRIGGER trg_update_fnd_enterprise_products_services
        BEFORE UPDATE ON acme.fnd_enterprise_products_services
        FOR EACH ROW EXECUTE FUNCTION acme.update_last_update_date();

    DROP TRIGGER IF EXISTS trg_update_fnd_business_unit_settings ON acme.fnd_business_unit_settings;
    CREATE TRIGGER trg_update_fnd_business_unit_settings
        BEFORE UPDATE ON acme.fnd_business_unit_settings
        FOR EACH ROW EXECUTE FUNCTION acme.update_last_update_date();

    -- Special trigger for users table (uses updated_at)
    DROP TRIGGER IF EXISTS trigger_fnd_users_updated_at ON acme.fnd_users;
    CREATE TRIGGER trigger_fnd_users_updated_at
        BEFORE UPDATE ON acme.fnd_users
        FOR EACH ROW EXECUTE FUNCTION acme.update_fnd_users_updated_at();

    RAISE NOTICE 'Update triggers created successfully';
END;
$$;

-- Main function to create all tables
CREATE OR REPLACE FUNCTION acme.create_all_access_control_tables() RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE NOTICE 'Starting creation of all access control tables in acme schema...';

    -- Create tables in dependency order
    PERFORM acme.create_fnd_enterprise_table();
    PERFORM acme.create_fnd_accounts_table();
    PERFORM acme.create_fnd_account_addresses_table();
    PERFORM acme.create_fnd_license_details_table();
    PERFORM acme.create_fnd_account_technical_users_table();
    PERFORM acme.create_fnd_products_table();
    PERFORM acme.create_fnd_services_table();
    PERFORM acme.create_fnd_enterprise_products_services_table();
    PERFORM acme.create_fnd_business_unit_settings_table();
    PERFORM acme.create_fnd_global_clients_table();
    PERFORM acme.create_fnd_user_groups_table();
    PERFORM acme.create_fnd_user_group_entities_table();
    PERFORM acme.create_fnd_user_group_services_table();
    PERFORM acme.create_fnd_user_group_roles_table();
    PERFORM acme.create_fnd_users_table();
    PERFORM acme.create_update_triggers();

    RAISE NOTICE 'All access control tables created successfully in acme schema!';
END;
$$;

-- Function to insert sample data
CREATE OR REPLACE FUNCTION acme.insert_sample_data() RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    enterprise_id_1 INTEGER;
    account_id_1 INTEGER;
    product_id_1 INTEGER;
    service_id_1 INTEGER;
    group_id_1 INTEGER;
    user_id_1 INTEGER;
BEGIN
    RAISE NOTICE 'Inserting sample data into acme schema...';

    -- Insert sample enterprise
    INSERT INTO acme.fnd_enterprise (enterprise_name, created_by)
    VALUES ('Enterprise Corporation', 'system')
    RETURNING enterprise_id INTO enterprise_id_1;

    -- Insert sample account
    INSERT INTO acme.fnd_accounts (account_name, master_account_id, master_account_name, created_by)
    VALUES ('Main Business Account', 'CLI001', 'Primary Client', 'system')
    RETURNING account_id INTO account_id_1;

    -- Insert sample product
    INSERT INTO acme.fnd_products (product_name, product_type, created_by)
    VALUES ('Core Platform', 'Software', 'system')
    RETURNING product_id INTO product_id_1;

    -- Insert sample service
    INSERT INTO acme.fnd_services (service_name, service_type, created_by)
    VALUES ('User Management Service', 'Security', 'system')
    RETURNING service_id INTO service_id_1;

    -- Insert sample user group
    INSERT INTO acme.fnd_user_groups (account_id, enterprise_id, name, entity_id, description, created_by)
    VALUES (account_id_1, enterprise_id_1, 'System Administrators', 'SYS_ADMINS', 'System administration group', 1)
    RETURNING id INTO group_id_1;

    -- Insert sample user
    INSERT INTO acme.fnd_users (first_name, last_name, email_address, status, start_date, account_id, enterprise_id, created_by)
    VALUES ('Admin', 'User', 'admin@acme.com', 'ACTIVE', CURRENT_DATE, account_id_1, enterprise_id_1, 1)
    RETURNING id INTO user_id_1;

    -- Link enterprise, product, and service
    INSERT INTO acme.fnd_enterprise_products_services (enterprise_id, product_id, service_id, created_by)
    VALUES (enterprise_id_1, product_id_1, ARRAY[service_id_1], 'system');

    RAISE NOTICE 'Sample data inserted successfully into acme schema!';
END;
$$;

--
-- EXECUTION SECTION: Create schema and execute all functions
--

-- Create the acme schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS acme;

-- Clean up any existing tables to avoid conflicts
DROP TABLE IF EXISTS acme.fnd_users CASCADE;
DROP TABLE IF EXISTS acme.fnd_user_groups CASCADE;
DROP TABLE IF EXISTS acme.fnd_user_group_roles CASCADE;
DROP TABLE IF EXISTS acme.fnd_user_group_services CASCADE;
DROP TABLE IF EXISTS acme.fnd_user_group_entities CASCADE;
DROP TABLE IF EXISTS acme.fnd_global_clients CASCADE;
DROP TABLE IF EXISTS acme.fnd_business_unit_settings CASCADE;
DROP TABLE IF EXISTS acme.fnd_enterprise_products_services CASCADE;
DROP TABLE IF EXISTS acme.fnd_services CASCADE;
DROP TABLE IF EXISTS acme.fnd_products CASCADE;
DROP TABLE IF EXISTS acme.fnd_account_technical_users CASCADE;
DROP TABLE IF EXISTS acme.fnd_license_details CASCADE;
DROP TABLE IF EXISTS acme.fnd_account_addresses CASCADE;
DROP TABLE IF EXISTS acme.fnd_accounts CASCADE;
DROP TABLE IF EXISTS acme.fnd_enterprise CASCADE;

-- Execute the main function to create all tables
SELECT acme.create_all_access_control_tables();

-- Insert sample data
SELECT acme.insert_sample_data();
