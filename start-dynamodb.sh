#!/bin/bash

# DynamoDB Environment Configuration
export STORAGE_MODE=dynamodb
export AWS_REGION=us-east-1
export AWS_ACCESS_KEY_ID=test_key
export AWS_SECRET_ACCESS_KEY=test_secret
export DYNAMODB_ENTERPRISE_TABLE=EnterpriseConfig
export USE_IN_MEMORY_DYNAMODB=false
export SKIP_DYNAMODB_CONNECTION_TEST=true

echo "=== Starting with DynamoDB Configuration ==="
echo "STORAGE_MODE=$STORAGE_MODE"
echo "USE_IN_MEMORY_DYNAMODB=$USE_IN_MEMORY_DYNAMODB"
echo "AWS_REGION=$AWS_REGION"
echo "DYNAMODB_ENTERPRISE_TABLE=$DYNAMODB_ENTERPRISE_TABLE"
echo "=========================================="

# Start the application
npm run dev
