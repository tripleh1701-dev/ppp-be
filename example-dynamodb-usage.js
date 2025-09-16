/**
 * Example DynamoDB Usage Script
 *
 * This script demonstrates how to use the DynamoDB enterprise configuration
 * following the pattern provided in the user's request.
 */

const {DynamoDBClient} = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    PutCommand,
    QueryCommand,
    GetCommand,
    ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

// Create DynamoDB client
const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    // Uncomment for local DynamoDB
    // endpoint: "http://localhost:8000"
});

// Use DocumentClient for easier JSON handling
const ddbDocClient = DynamoDBDocumentClient.from(client);

// Table name
const tableName = process.env.DYNAMODB_ENTERPRISE_TABLE || 'EnterpriseConfig';

// Example: Insert enterprise item
async function putEnterpriseItem() {
    const enterpriseId = '1001';
    const params = {
        TableName: tableName,
        Item: {
            PK: `ENT#${enterpriseId}`,
            SK: 'METADATA',
            id: enterpriseId,
            enterprise_name: 'Premium Plan',
            name: 'Premium Plan',
            created_date: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updated_date: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            entity_type: 'enterprise',
        },
    };

    try {
        await ddbDocClient.send(new PutCommand(params));
        console.log('Enterprise item inserted successfully!');
        return params.Item;
    } catch (error) {
        console.error('Error inserting enterprise item:', error);
        throw error;
    }
}

// Example: Query enterprise items
async function queryEnterpriseItems() {
    const enterpriseId = '1001';
    const params = {
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
        ExpressionAttributeValues: {
            ':pk': `ENT#${enterpriseId}`,
            ':sk': 'META',
        },
    };

    try {
        const data = await ddbDocClient.send(new QueryCommand(params));
        console.log('Query result:', data.Items);
        return data.Items;
    } catch (error) {
        console.error('Error querying enterprise items:', error);
        throw error;
    }
}

// Example: Get specific enterprise item
async function getEnterpriseItem(enterpriseId) {
    const params = {
        TableName: tableName,
        Key: {
            PK: `ENT#${enterpriseId}`,
            SK: 'METADATA',
        },
    };

    try {
        const data = await ddbDocClient.send(new GetCommand(params));
        console.log('Get result:', data.Item);
        return data.Item;
    } catch (error) {
        console.error('Error getting enterprise item:', error);
        throw error;
    }
}

// Example: List all enterprises
async function listAllEnterprises() {
    const params = {
        TableName: tableName,
        FilterExpression: 'entity_type = :type',
        ExpressionAttributeValues: {
            ':type': 'enterprise',
        },
    };

    try {
        const data = await ddbDocClient.send(new ScanCommand(params));
        console.log('All enterprises:', data.Items);
        return data.Items;
    } catch (error) {
        console.error('Error listing enterprises:', error);
        throw error;
    }
}

// Example: Add product configuration to enterprise
async function addProductToEnterprise(enterpriseId, productId, productName) {
    const params = {
        TableName: tableName,
        Item: {
            PK: `ENT#${enterpriseId}`,
            SK: `PROD#${productId}`,
            product_id: productId,
            product_name: productName,
            enterprise_id: enterpriseId,
            created_date: new Date().toISOString(),
            entity_type: 'product_config',
        },
    };

    try {
        await ddbDocClient.send(new PutCommand(params));
        console.log('Product configuration added successfully!');
        return params.Item;
    } catch (error) {
        console.error('Error adding product configuration:', error);
        throw error;
    }
}

// Example: Query all products for an enterprise
async function getEnterpriseProducts(enterpriseId) {
    const params = {
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk and begins_with(SK, :sk)',
        ExpressionAttributeValues: {
            ':pk': `ENT#${enterpriseId}`,
            ':sk': 'PROD#',
        },
    };

    try {
        const data = await ddbDocClient.send(new QueryCommand(params));
        console.log('Enterprise products:', data.Items);
        return data.Items;
    } catch (error) {
        console.error('Error getting enterprise products:', error);
        throw error;
    }
}

// Main execution function
async function main() {
    try {
        console.log('=== DynamoDB Enterprise Configuration Example ===\n');

        // 1. Insert an enterprise
        console.log('1. Inserting enterprise...');
        await putEnterpriseItem();

        // 2. Query the enterprise
        console.log('\n2. Querying enterprise...');
        await queryEnterpriseItems();

        // 3. Get specific enterprise
        console.log('\n3. Getting specific enterprise...');
        await getEnterpriseItem('1001');

        // 4. Add product configuration
        console.log('\n4. Adding product configuration...');
        await addProductToEnterprise('1001', '2001', 'Premium Plan Product');

        // 5. Get enterprise products
        console.log('\n5. Getting enterprise products...');
        await getEnterpriseProducts('1001');

        // 6. List all enterprises
        console.log('\n6. Listing all enterprises...');
        await listAllEnterprises();

        console.log('\n=== Example completed successfully! ===');
    } catch (error) {
        console.error('Example failed:', error);
        process.exit(1);
    }
}

// Run the example if this script is executed directly
if (require.main === module) {
    main();
}

module.exports = {
    putEnterpriseItem,
    queryEnterpriseItems,
    getEnterpriseItem,
    listAllEnterprises,
    addProductToEnterprise,
    getEnterpriseProducts,
};
