const {DynamoDBClient} = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    ScanCommand,
    GetCommand,
} = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
    region: 'us-east-1',
    endpoint: 'http://localhost:8000',
    credentials: {
        accessKeyId: 'dummy',
        secretAccessKey: 'dummy',
    },
});

const docClient = DynamoDBDocumentClient.from(client);

async function checkGroups() {
    try {
        console.log('🔍 Scanning systiva table for groups...\n');

        // Scan for all items with GROUP in SK
        const scanResult = await docClient.send(
            new ScanCommand({
                TableName: 'systiva',
                FilterExpression: 'begins_with(SK, :sk)',
                ExpressionAttributeValues: {
                    ':sk': 'GROUP#',
                },
            }),
        );

        console.log(
            `📊 Found ${
                scanResult.Items?.length || 0
            } groups in systiva table\n`,
        );

        if (scanResult.Items && scanResult.Items.length > 0) {
            scanResult.Items.forEach((item, index) => {
                console.log(`\n--- Group ${index + 1} ---`);
                console.log(`PK: ${item.PK}`);
                console.log(`SK: ${item.SK}`);
                console.log(`ID: ${item.id}`);
                console.log(`Name: ${item.group_name || item.name}`);
                console.log(`Description: ${item.description}`);
                console.log(`Entity: ${item.entity}`);
                console.log(`Service: ${item.service}`);
                console.log(`Created: ${item.created_date || item.createdAt}`);
                console.log(`Updated: ${item.updated_date || item.updatedAt}`);
            });
        } else {
            console.log('❌ No groups found in the systiva table!');
            console.log('\n💡 This means groups are not being created.');
            console.log(
                '   Check if the frontend is calling POST /api/user-management/groups',
            );
        }

        // Also check for the specific group ID from the logs
        const specificGroupId = '3c95318d-1b60-44d7-b5da-40251d150b5d';
        console.log(`\n\n🔍 Checking for specific group: ${specificGroupId}`);

        const getResult = await docClient.send(
            new GetCommand({
                TableName: 'systiva',
                Key: {
                    PK: `SYSTIVA#${specificGroupId}`,
                    SK: `GROUP#${specificGroupId}`,
                },
            }),
        );

        if (getResult.Item) {
            console.log('✅ Group found!');
            console.log(JSON.stringify(getResult.Item, null, 2));
        } else {
            console.log('❌ Group NOT found in database');
            console.log(
                '   This group needs to be CREATED first before it can be updated.',
            );
        }
    } catch (error) {
        console.error('❌ Error checking groups:', error.message);
    } finally {
        process.exit(0);
    }
}

checkGroups();
