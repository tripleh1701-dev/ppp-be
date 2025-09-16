# DynamoDB Migration Setup

This guide explains how to set up and use DynamoDB as the data persistence layer for enterprise configuration data.

## Environment Configuration

To use DynamoDB, you need to set the following environment variables:

### Required Variables

```bash
# Set storage mode to dynamodb
STORAGE_MODE=dynamodb

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key

# DynamoDB Table Configuration
DYNAMODB_ENTERPRISE_TABLE=EnterpriseConfig
```

### Optional Variables

```bash
# For local DynamoDB development
DYNAMODB_ENDPOINT=http://localhost:8000
```

## DynamoDB Table Structure

The application expects a DynamoDB table with the following structure:

### Table Name
- Default: `EnterpriseConfig`
- Configurable via: `DYNAMODB_ENTERPRISE_TABLE`

### Primary Key Structure
- **Partition Key (PK)**: `ENT#{enterpriseId}` (String)
- **Sort Key (SK)**: `METADATA` (String)

### Item Structure
```json
{
  "PK": "ENT#123e4567-e89b-12d3-a456-426614174000",
  "SK": "METADATA",
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "enterprise_name": "Premium Plan",
  "name": "Premium Plan",
  "created_date": "2025-09-16T10:30:00.000Z",
  "createdAt": "2025-09-16T10:30:00.000Z",
  "updated_date": "2025-09-16T10:30:00.000Z",
  "updatedAt": "2025-09-16T10:30:00.000Z",
  "entity_type": "enterprise"
}
```

## Creating the DynamoDB Table

### Using AWS CLI

```bash
aws dynamodb create-table \
    --table-name EnterpriseConfig \
    --attribute-definitions \
        AttributeName=PK,AttributeType=S \
        AttributeName=SK,AttributeType=S \
    --key-schema \
        AttributeName=PK,KeyType=HASH \
        AttributeName=SK,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --region us-east-1
```

### Using AWS Console

1. Go to AWS DynamoDB Console
2. Click "Create table"
3. Table name: `EnterpriseConfig`
4. Partition key: `PK` (String)
5. Sort key: `SK` (String)
6. Use default settings for other options
7. Click "Create table"

## Local Development with DynamoDB Local

### Install DynamoDB Local

```bash
# Download DynamoDB Local
wget https://s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.tar.gz
tar -xzf dynamodb_local_latest.tar.gz

# Run DynamoDB Local
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
```

### Environment for Local Development

```bash
STORAGE_MODE=dynamodb
DYNAMODB_ENDPOINT=http://localhost:8000
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=dummy
AWS_SECRET_ACCESS_KEY=dummy
DYNAMODB_ENTERPRISE_TABLE=EnterpriseConfig
```

### Create Local Table

```bash
aws dynamodb create-table \
    --table-name EnterpriseConfig \
    --attribute-definitions \
        AttributeName=PK,AttributeType=S \
        AttributeName=SK,AttributeType=S \
    --key-schema \
        AttributeName=PK,KeyType=HASH \
        AttributeName=SK,KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST \
    --endpoint-url http://localhost:8000 \
    --region us-east-1
```

## API Usage Examples

### Create Enterprise

```bash
curl -X POST http://localhost:4000/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium Plan Enterprise"
  }'
```

### List Enterprises

```bash
curl http://localhost:4000/api/enterprises
```

### Get Enterprise by ID

```bash
curl http://localhost:4000/api/enterprises/{enterprise-id}
```

### Update Enterprise

```bash
curl -X PUT http://localhost:4000/api/enterprises/{enterprise-id} \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Enterprise Name"
  }'
```

### Delete Enterprise

```bash
curl -X DELETE http://localhost:4000/api/enterprises/{enterprise-id}
```

### Debug DynamoDB

```bash
curl http://localhost:4000/api/enterprises/debug/dynamodb
```

## Key Differences from PostgreSQL

1. **ID Format**: DynamoDB uses UUID strings instead of sequential integers
2. **Data Structure**: Uses partition key (PK) and sort key (SK) for composite keys
3. **Querying**: Uses DynamoDB Query and Scan operations instead of SQL
4. **Consistency**: Eventually consistent reads by default (can be changed to strongly consistent)

## Migration from PostgreSQL

The service includes a migration method to transfer data from PostgreSQL to DynamoDB:

```typescript
// Example migration (would be called programmatically)
const dynamoService = new EnterprisesDynamoDBService();
const pgData = await postgresService.list();
await dynamoService.migrateFromPostgreSQL(pgData);
```

## Troubleshooting

### Connection Issues

1. Verify AWS credentials are correct
2. Check AWS region configuration
3. Ensure DynamoDB table exists
4. For local development, verify DynamoDB Local is running

### Permission Issues

Ensure your AWS credentials have the following DynamoDB permissions:
- `dynamodb:PutItem`
- `dynamodb:GetItem`
- `dynamodb:UpdateItem`
- `dynamodb:DeleteItem`
- `dynamodb:Query`
- `dynamodb:Scan`

### Table Not Found

Verify the table name matches the `DYNAMODB_ENTERPRISE_TABLE` environment variable or create the table using the instructions above.
