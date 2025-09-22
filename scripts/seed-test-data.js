#!/usr/bin/env node

/**
 * Script to seed test data for User Groups, Roles, and Scopes
 * Run with: node scripts/seed-test-data.js
 */

const {DynamoDBClient} = require('@aws-sdk/client-dynamodb');
const {DynamoDBDocumentClient, PutCommand} = require('@aws-sdk/lib-dynamodb');
const {v4: uuid} = require('uuid');

// Initialize DynamoDB client
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
    credentials: {
        accessKeyId: 'dummy',
        secretAccessKey: 'dummy',
    },
});

const docClient = DynamoDBDocumentClient.from(client);
const tableName = process.env.DYNAMODB_RBAC_TABLE || 'accessControl';

// Test data
const testGroups = [
    {
        id: uuid(),
        name: 'Administrators',
        description: 'System administrators with full access',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'HR Team',
        description: 'Human Resources team members',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Finance Team',
        description: 'Finance and accounting team members',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'IT Support',
        description: 'Technical support team members',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Sales Team',
        description: 'Sales and marketing team members',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Project Managers',
        description: 'Project management team',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const testRoles = [
    {
        id: uuid(),
        name: 'Super Admin',
        description: 'Full system access and control',
        permissions: ['*'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'User Manager',
        description: 'Can manage users and groups',
        permissions: [
            'users:read',
            'users:write',
            'groups:read',
            'groups:write',
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'HR Manager',
        description: 'Human resources management permissions',
        permissions: [
            'users:read',
            'users:write',
            'reports:hr',
            'payroll:read',
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Finance Manager',
        description: 'Financial data and reporting access',
        permissions: [
            'finance:read',
            'finance:write',
            'reports:finance',
            'budgets:manage',
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Read Only',
        description: 'View-only access to most resources',
        permissions: ['users:read', 'groups:read', 'reports:read'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Support Agent',
        description: 'Customer support and ticket management',
        permissions: [
            'tickets:read',
            'tickets:write',
            'customers:read',
            'knowledge:read',
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

const testServices = [
    {
        id: uuid(),
        name: 'User Management',
        description: 'User account and profile management service',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Financial Reporting',
        description: 'Financial data and reporting service',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'HR Portal',
        description: 'Human resources management portal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Project Tracking',
        description: 'Project management and tracking system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Customer Support',
        description: 'Customer service and support system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
    {
        id: uuid(),
        name: 'Analytics Dashboard',
        description: 'Business intelligence and analytics',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];

async function seedData() {
    console.log('🌱 Starting to seed test data...');

    try {
        // Seed Groups
        console.log('📋 Creating test user groups...');
        for (const group of testGroups) {
            const command = new PutCommand({
                TableName: tableName,
                Item: {
                    PK: `GROUP#${group.id}`,
                    SK: 'PROFILE',
                    ...group,
                    entityType: 'GROUP',
                },
            });
            await docClient.send(command);
            console.log(`✅ Created group: ${group.name}`);
        }

        // Seed Roles
        console.log('🎭 Creating test roles...');
        for (const role of testRoles) {
            const command = new PutCommand({
                TableName: tableName,
                Item: {
                    PK: `ROLE#${role.id}`,
                    SK: 'PROFILE',
                    ...role,
                    entityType: 'ROLE',
                },
            });
            await docClient.send(command);
            console.log(`✅ Created role: ${role.name}`);
        }

        // Seed Services
        console.log('🔧 Creating test services...');
        for (const service of testServices) {
            const command = new PutCommand({
                TableName: tableName,
                Item: {
                    PK: `SERVICE#${service.id}`,
                    SK: 'PROFILE',
                    ...service,
                    entityType: 'SERVICE',
                },
            });
            await docClient.send(command);
            console.log(`✅ Created service: ${service.name}`);
        }

        // Create some role-group assignments
        console.log('🔗 Creating role-group assignments...');
        const assignments = [
            {groupName: 'Administrators', roleName: 'Super Admin'},
            {groupName: 'HR Team', roleName: 'HR Manager'},
            {groupName: 'Finance Team', roleName: 'Finance Manager'},
            {groupName: 'IT Support', roleName: 'Support Agent'},
            {groupName: 'Sales Team', roleName: 'Read Only'},
            {groupName: 'Project Managers', roleName: 'User Manager'},
        ];

        for (const assignment of assignments) {
            const group = testGroups.find(
                (g) => g.name === assignment.groupName,
            );
            const role = testRoles.find((r) => r.name === assignment.roleName);

            if (group && role) {
                const command = new PutCommand({
                    TableName: tableName,
                    Item: {
                        PK: `GROUP#${group.id}`,
                        SK: `ROLE#${role.id}`,
                        groupId: group.id,
                        roleId: role.id,
                        assignedAt: new Date().toISOString(),
                        entityType: 'GROUP_ROLE_ASSIGNMENT',
                    },
                });
                await docClient.send(command);
                console.log(
                    `✅ Assigned role "${role.name}" to group "${group.name}"`,
                );
            }
        }

        // Create some service-group assignments
        console.log('🔗 Creating service-group assignments...');
        const serviceAssignments = [
            {groupName: 'Administrators', serviceName: 'User Management'},
            {groupName: 'Administrators', serviceName: 'Analytics Dashboard'},
            {groupName: 'HR Team', serviceName: 'HR Portal'},
            {groupName: 'HR Team', serviceName: 'User Management'},
            {groupName: 'Finance Team', serviceName: 'Financial Reporting'},
            {groupName: 'Finance Team', serviceName: 'Analytics Dashboard'},
            {groupName: 'IT Support', serviceName: 'Customer Support'},
            {groupName: 'IT Support', serviceName: 'User Management'},
            {groupName: 'Project Managers', serviceName: 'Project Tracking'},
            {groupName: 'Project Managers', serviceName: 'Analytics Dashboard'},
        ];

        for (const assignment of serviceAssignments) {
            const group = testGroups.find(
                (g) => g.name === assignment.groupName,
            );
            const service = testServices.find(
                (s) => s.name === assignment.serviceName,
            );

            if (group && service) {
                const command = new PutCommand({
                    TableName: tableName,
                    Item: {
                        PK: `GROUP#${group.id}`,
                        SK: `SERVICE#${service.id}`,
                        groupId: group.id,
                        serviceId: service.id,
                        assignedAt: new Date().toISOString(),
                        entityType: 'GROUP_SERVICE_ASSIGNMENT',
                    },
                });
                await docClient.send(command);
                console.log(
                    `✅ Assigned service "${service.name}" to group "${group.name}"`,
                );
            }
        }

        console.log('\n🎉 Test data seeding completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`   • ${testGroups.length} User Groups created`);
        console.log(`   • ${testRoles.length} Roles created`);
        console.log(`   • ${testServices.length} Services created`);
        console.log(
            `   • ${assignments.length} Role-Group assignments created`,
        );
        console.log(
            `   • ${serviceAssignments.length} Service-Group assignments created`,
        );

        console.log('\n📋 Created User Groups:');
        testGroups.forEach((group) =>
            console.log(`   • ${group.name}: ${group.description}`),
        );

        console.log('\n🎭 Created Roles:');
        testRoles.forEach((role) =>
            console.log(`   • ${role.name}: ${role.description}`),
        );

        console.log('\n🔧 Created Services:');
        testServices.forEach((service) =>
            console.log(`   • ${service.name}: ${service.description}`),
        );
    } catch (error) {
        console.error('❌ Error seeding test data:', error);
        process.exit(1);
    }
}

// Run the seeding
seedData()
    .then(() => {
        console.log(
            '\n✅ Seeding process completed. You can now test user group assignments!',
        );
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Seeding process failed:', error);
        process.exit(1);
    });
