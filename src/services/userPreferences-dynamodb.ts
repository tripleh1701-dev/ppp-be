/**
 * User Preferences DynamoDB Service
 * Stores user preferences like current account/enterprise context in DynamoDB
 * PK: USER_PREFERENCES#<userId>
 * SK: CURRENT_CONTEXT
 */
import {
    DynamoDBClient,
    PutItemCommand,
    GetItemCommand,
    DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import {marshall, unmarshall} from '@aws-sdk/util-dynamodb';

export interface UserContext {
    userId: string;
    accountId: string;
    accountName: string;
    enterpriseId: string;
    enterpriseName?: string;
    updatedAt: string;
}

export class UserPreferencesDynamoDBService {
    private client: DynamoDBClient;
    private tableName: string;

    constructor() {
        this.client = new DynamoDBClient({
            region: process.env.AWS_REGION || 'us-east-1',
        });
        this.tableName =
            process.env.DYNAMODB_SYSTIVA_TABLE ||
            process.env.DYNAMODB_TABLE ||
            'systiva-admin-dev';
        console.log(
            '🔧 UserPreferencesDynamoDBService initialized with table:',
            this.tableName,
        );
    }

    /**
     * Save user's current context (selected account/enterprise)
     */
    async saveCurrentContext(context: UserContext): Promise<UserContext> {
        const item = {
            PK: `USER_PREFERENCES#${context.userId}`,
            SK: 'CURRENT_CONTEXT',
            GSI1_PK: 'USER_PREFERENCES',
            GSI1_SK: `USER#${context.userId}`,
            userId: context.userId,
            accountId: context.accountId,
            accountName: context.accountName,
            enterpriseId: context.enterpriseId,
            enterpriseName: context.enterpriseName || '',
            updatedAt: new Date().toISOString(),
            entityType: 'USER_CONTEXT',
        };

        const command = new PutItemCommand({
            TableName: this.tableName,
            Item: marshall(item, {removeUndefinedValues: true}),
        });

        await this.client.send(command);
        console.log(`✅ Saved user context for ${context.userId}`);

        return {
            userId: context.userId,
            accountId: context.accountId,
            accountName: context.accountName,
            enterpriseId: context.enterpriseId,
            enterpriseName: context.enterpriseName,
            updatedAt: item.updatedAt,
        };
    }

    /**
     * Get user's current context
     */
    async getCurrentContext(userId: string): Promise<UserContext | null> {
        const command = new GetItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: `USER_PREFERENCES#${userId}`,
                SK: 'CURRENT_CONTEXT',
            }),
        });

        const response = await this.client.send(command);

        if (!response.Item) {
            console.log(`⚠️ No context found for user ${userId}`);
            return null;
        }

        const item = unmarshall(response.Item);
        return {
            userId: item.userId,
            accountId: item.accountId,
            accountName: item.accountName,
            enterpriseId: item.enterpriseId,
            enterpriseName: item.enterpriseName,
            updatedAt: item.updatedAt,
        };
    }

    /**
     * Delete user's current context
     */
    async deleteCurrentContext(userId: string): Promise<boolean> {
        const command = new DeleteItemCommand({
            TableName: this.tableName,
            Key: marshall({
                PK: `USER_PREFERENCES#${userId}`,
                SK: 'CURRENT_CONTEXT',
            }),
        });

        await this.client.send(command);
        console.log(`✅ Deleted user context for ${userId}`);
        return true;
    }
}
