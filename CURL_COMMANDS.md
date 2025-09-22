# DynamoDB Enterprise Configuration - cURL Commands

This document provides cURL commands to interact with your DynamoDB-based enterprise configuration API.

## Environment Setup

Make sure your application is running with these environment variables:

```bash
export STORAGE_MODE=dynamodb
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=your_access_key_here
export AWS_SECRET_ACCESS_KEY=your_secret_key_here
export DYNAMODB_ENTERPRISE_TABLE=EnterpriseConfig
export PORT=4000
```

## Start the Application

```bash
npm run dev
```

## cURL Commands

### 1. Insert/Create Enterprise Data

```bash
# Create a new enterprise
curl -X POST http://localhost:4000/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Premium Enterprise Solutions"
  }'
```

**Expected Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Premium Enterprise Solutions",
  "createdAt": "2025-09-16T10:30:00.000Z",
  "updatedAt": "2025-09-16T10:30:00.000Z"
}
```

### 2. Retrieve All Enterprise Data

```bash
# Get all enterprises
curl -X GET http://localhost:4000/api/enterprises \
  -H "Accept: application/json"
```

**Expected Response:**
```json
[
  {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Premium Enterprise Solutions",
    "createdAt": "2025-09-16T10:30:00.000Z",
    "updatedAt": "2025-09-16T10:30:00.000Z"
  },
  {
    "id": "987fcdeb-51a2-43d1-b678-512345678901",
    "name": "Standard Enterprise Package",
    "createdAt": "2025-09-16T09:15:00.000Z",
    "updatedAt": "2025-09-16T09:15:00.000Z"
  }
]
```

### 3. Retrieve Specific Enterprise Data

```bash
# Get enterprise by ID (replace with actual ID from create response)
curl -X GET http://localhost:4000/api/enterprises/123e4567-e89b-12d3-a456-426614174000 \
  -H "Accept: application/json"
```

**Expected Response:**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "name": "Premium Enterprise Solutions",
  "createdAt": "2025-09-16T10:30:00.000Z",
  "updatedAt": "2025-09-16T10:30:00.000Z"
}
```

### 4. Update Enterprise Data

```bash
# Update enterprise by ID
curl -X PUT http://localhost:4000/api/enterprises/123e4567-e89b-12d3-a456-426614174000 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Premium Enterprise Solutions"
  }'
```

**Alternative update method (ID in body):**
```bash
# Update enterprise with ID in request body
curl -X PUT http://localhost:4000/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Updated Premium Enterprise Solutions"
  }'
```

### 5. Delete Enterprise Data

```bash
# Delete enterprise by ID
curl -X DELETE http://localhost:4000/api/enterprises/123e4567-e89b-12d3-a456-426614174000
```

**Expected Response:**
```json
{}
```

### 6. Debug DynamoDB Table Contents

```bash
# Debug DynamoDB table (shows table structure and sample data)
curl -X GET http://localhost:4000/api/enterprises/debug/dynamodb \
  -H "Accept: application/json"
```

**Expected Response:**
```json
{
  "tableName": "EnterpriseConfig",
  "totalItems": 2,
  "items": [
    {
      "PK": "ENT#123e4567-e89b-12d3-a456-426614174000",
      "SK": "METADATA",
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "enterprise_name": "Premium Enterprise Solutions",
      "name": "Premium Enterprise Solutions",
      "created_date": "2025-09-16T10:30:00.000Z",
      "createdAt": "2025-09-16T10:30:00.000Z",
      "updated_date": "2025-09-16T10:30:00.000Z",
      "updatedAt": "2025-09-16T10:30:00.000Z",
      "entity_type": "enterprise"
    }
  ],
  "itemStructure": ["PK", "SK", "id", "enterprise_name", "name", "created_date", "createdAt", "updated_date", "updatedAt", "entity_type"]
}
```

## Bulk Operations Examples

### Insert Multiple Enterprises

```bash
# Create first enterprise
curl -X POST http://localhost:4000/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{"name": "Enterprise Alpha"}'

# Create second enterprise
curl -X POST http://localhost:4000/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{"name": "Enterprise Beta"}'

# Create third enterprise
curl -X POST http://localhost:4000/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{"name": "Enterprise Gamma"}'
```

### Retrieve and Process Data

```bash
# Get all enterprises and save to file
curl -X GET http://localhost:4000/api/enterprises \
  -H "Accept: application/json" \
  -o enterprises.json

# Pretty print the JSON response
curl -X GET http://localhost:4000/api/enterprises \
  -H "Accept: application/json" | jq '.'
```

## Health Check

```bash
# Check if application is running
curl -X GET http://localhost:4000/health
```

**Expected Response:**
```json
{
  "ok": true
}
```

## Error Handling Examples

### Invalid Data

```bash
# Try to create enterprise without name (should fail)
curl -X POST http://localhost:4000/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Non-existent Resource

```bash
# Try to get non-existent enterprise
curl -X GET http://localhost:4000/api/enterprises/non-existent-id \
  -H "Accept: application/json"
```

**Expected Response:**
```json
null
```

## Notes

1. **UUID Format**: DynamoDB uses UUID strings for IDs instead of sequential integers
2. **Case Sensitivity**: Enterprise IDs are case-sensitive
3. **Content-Type**: Always include `Content-Type: application/json` for POST/PUT requests
4. **Environment**: Make sure `STORAGE_MODE=dynamodb` is set before starting the application
5. **Table Setup**: Ensure your DynamoDB table exists and is properly configured

## Troubleshooting

If you get connection errors:

1. Check that the application is running on port 4000
2. Verify DynamoDB configuration and AWS credentials
3. Check the debug endpoint to see DynamoDB connection status:

```bash
curl -X GET http://localhost:4000/api/enterprises/debug/dynamodb
```
