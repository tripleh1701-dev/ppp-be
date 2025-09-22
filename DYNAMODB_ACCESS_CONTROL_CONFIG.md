# DynamoDB AccessControl Configuration Guide

This document provides comprehensive configuration instructions for using the DynamoDB-based Role-Based Access Control system.

## Overview

The backend supports multiple storage modes for AccessControl operations:
- **PostgreSQL** (legacy)
- **Filesystem** (legacy) 
- **DynamoDB** (new, recommended)

When `STORAGE_MODE=dynamodb`, all AccessControl operations (Users, Groups, Roles, Assignments) will use the new `AccessControl_DynamoDBService` with your DynamoDB table.

## Environment Variables

### Required Variables

```bash
# Storage Configuration
STORAGE_MODE=dynamodb

# DynamoDB Configuration
DYNAMODB_AccessControl_TABLE=accessControl
AWS_REGION=us-east-1

# AWS Credentials (if not using IAM roles)
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

### Optional Variables

```bash
# For local DynamoDB development
DYNAMODB_ENDPOINT=http://localhost:8000

# For in-memory DynamoDB testing
USE_IN_MEMORY_DYNAMODB=true
```

## DynamoDB Table Structure

### Table Name
- **Default**: `accessControl`
- **Configurable via**: `DYNAMODB_AccessControl_TABLE` environment variable

### Key Schema
- **Partition Key (PK)**: String
- **Sort Key (SK)**: String

### Entity Patterns

| Entity | PK Pattern | SK Pattern | Description |
|--------|------------|------------|-------------|
| User Profile | `USER#<user_id>` | `PROFILE` | User basic information |
| Group Profile | `GROUP#<group_id>` | `PROFILE` | Group basic information |
| Role Profile | `ROLE#<role_id>` | `PROFILE` | Role basic information |
| Service Profile | `SERVICE#<service_id>` | `PROFILE` | Service basic information |
| User-Group Assignment | `USER#<user_id>` | `GROUP#<group_id>` | User assigned to group |
| Group-User Assignment | `GROUP#<group_id>` | `USER#<user_id>` | Group contains user (reverse lookup) |
| Group-Role Assignment | `GROUP#<group_id>` | `ROLE#<role_id>` | Group has role |
| Group-Service Assignment | `GROUP#<group_id>` | `SERVICE#<service_id>` | Group has access to service |

### Example Records

```json
// User Profile
{
  "PK": "USER#123e4567-e89b-12d3-a456-426614174000",
  "SK": "PROFILE",
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "firstName": "John",
  "lastName": "Doe",
  "emailAddress": "john.doe@example.com",
  "status": "ACTIVE",
  "technicalUser": false,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "entityType": "USER"
}

// Group Profile
{
  "PK": "GROUP#456e7890-e12b-34d5-a678-901234567890",
  "SK": "PROFILE", 
  "id": "456e7890-e12b-34d5-a678-901234567890",
  "name": "Administrators",
  "description": "System administrators with full access",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z",
  "entityType": "GROUP"
}

// User-Group Assignment
{
  "PK": "USER#123e4567-e89b-12d3-a456-426614174000",
  "SK": "GROUP#456e7890-e12b-34d5-a678-901234567890",
  "userId": "123e4567-e89b-12d3-a456-426614174000",
  "groupId": "456e7890-e12b-34d5-a678-901234567890",
  "assignedAt": "2024-01-01T00:00:00.000Z",
  "entityType": "USER_GROUP_ASSIGNMENT"
}
```

## CloudFormation Template

Use this CloudFormation template to create the required DynamoDB table:

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'DynamoDB table for AccessControl system'

Resources:
  AccessControlDynamoDBTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: accessControl
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: false
      SSESpecification:
        SSEEnabled: true
      Tags:
        - Key: Project
          Value: AccessControl
        - Key: Environment
          Value: !Ref AWS::StackName

Outputs:
  TableName:
    Description: 'Name of the created DynamoDB table'
    Value: !Ref AccessControlDynamoDBTable
    Export:
      Name: !Sub '${AWS::StackName}-AccessControlTableName'
  
  TableArn:
    Description: 'ARN of the created DynamoDB table'
    Value: !GetAtt AccessControlDynamoDBTable.Arn
    Export:
      Name: !Sub '${AWS::StackName}-AccessControlTableArn'
```

## API Endpoints

### Users (`/api/users`)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user
- `GET /api/users/:id/groups` - Get user's groups
- `POST /api/users/:id/groups` - Assign user to group
- `DELETE /api/users/:id/groups/:groupId` - Remove user from group

### Groups (`/api/groups`)
- `GET /api/groups` - List all groups
- `POST /api/groups` - Create new group

### Roles (`/api/roles`)
- `GET /api/roles` - List all roles
- `GET /api/roles/:id` - Get role by ID
- `POST /api/roles` - Create new role
- `PUT /api/roles/:id` - Update role
- `DELETE /api/roles/:id` - Delete role

### User Groups (`/api/user-groups`)
- `POST /api/user-groups/:groupId/roles` - Assign role to group
- `DELETE /api/user-groups/:groupId/roles/:roleId` - Remove role from group
- `GET /api/user-groups/:groupId/roles` - Get group's roles
- `GET /api/user-groups/:groupId/users` - Get group's users

## Migration from Legacy Storage

### Step 1: Deploy DynamoDB Table
```bash
aws cloudformation create-stack \
  --stack-name accessControl-dynamodb \
  --template-body file://accessControl-table.yaml \
  --region us-east-1
```

### Step 2: Update Environment Variables
```bash
# Update your .env or config.env file
STORAGE_MODE=dynamodb
DYNAMODB_AccessControl_TABLE=accessControl
AWS_REGION=us-east-1
```

### Step 3: Restart Application
```bash
# The application will automatically use DynamoDB when restarted
npm run start
```

### Step 4: Verify Configuration
Check the application logs for:
```
Loaded Storage Mode: dynamodb
DynamoDB connection successful!
AccessControl DynamoDB service initialized
```

## Development Setup

### Local DynamoDB
For local development, you can use DynamoDB Local:

```bash
# Install DynamoDB Local
npm install -g dynamodb-local

# Start DynamoDB Local
dynamodb-local

# Update environment variables
DYNAMODB_ENDPOINT=http://localhost:8000
```

### Create Local Table
```bash
aws dynamodb create-table \
  --table-name accessControl \
  --attribute-definitions \
    AttributeName=PK,AttributeType=S \
    AttributeName=SK,AttributeType=S \
  --key-schema \
    AttributeName=PK,KeyType=HASH \
    AttributeName=SK,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --endpoint-url http://localhost:8000
```

## Monitoring and Troubleshooting

### Common Issues

1. **Connection Failed**
   - Verify AWS credentials
   - Check region configuration
   - Ensure table exists

2. **Permission Denied**
   - Verify IAM permissions for DynamoDB operations
   - Required permissions: `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:DeleteItem`, `dynamodb:Query`, `dynamodb:Scan`

3. **Table Not Found**
   - Verify `DYNAMODB_AccessControl_TABLE` environment variable
   - Check table exists in correct region

### Logging
The application logs all DynamoDB operations. Look for:
- `✅ AccessControl DynamoDB service initialized`
- `🔧 Creating missing entities...`
- `❌ Error loading users: Error: HTTP error! status: 404`

### Performance Considerations

1. **Query Patterns**: The PK/SK design supports efficient queries for:
   - Get user profile: `PK = USER#<id> AND SK = PROFILE`
   - Get user's groups: `PK = USER#<id> AND SK begins_with GROUP#`
   - Get group's users: `PK = GROUP#<id> AND SK begins_with USER#`

2. **Pagination**: Use DynamoDB's native pagination for large result sets

3. **Batch Operations**: Consider implementing batch operations for bulk user/group assignments

## Security Best Practices

1. **Encryption**: Enable encryption at rest (included in CloudFormation template)
2. **Access Control**: Use IAM roles with least privilege
3. **VPC**: Deploy DynamoDB VPC endpoints for private access
4. **Monitoring**: Enable CloudTrail for DynamoDB API calls

## Backup and Recovery

1. **Point-in-Time Recovery**: Enable PITR for the table
2. **Backups**: Set up automated backups
3. **Cross-Region Replication**: Consider Global Tables for disaster recovery

## Cost Optimization

1. **On-Demand Billing**: Used by default for variable workloads
2. **Provisioned Capacity**: Consider for predictable workloads
3. **TTL**: Implement TTL for temporary data (sessions, tokens)

## Support

For issues or questions:
1. Check application logs
2. Verify environment configuration
3. Test with local DynamoDB first
4. Review AWS CloudWatch metrics
