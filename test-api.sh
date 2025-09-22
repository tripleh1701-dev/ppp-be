#!/bin/bash

echo "🚀 Testing AccessControl API Endpoints"
echo "================================"

BASE_URL="http://localhost:4000/api"

# Test Users endpoints
echo "📋 Testing Users API..."
echo "GET /api/users"
curl -s -X GET "$BASE_URL/users" -H "Content-Type: application/json" | jq . || echo "❌ Failed"

echo -e "\n📋 Testing Groups API..."
echo "GET /api/groups"
curl -s -X GET "$BASE_URL/groups" -H "Content-Type: application/json" | jq . || echo "❌ Failed"

echo -e "\n📋 Testing Roles API..."
echo "GET /api/roles"
curl -s -X GET "$BASE_URL/roles" -H "Content-Type: application/json" | jq . || echo "❌ Failed"

# Test POST endpoints
echo -e "\n📋 Testing User Creation..."
echo "POST /api/users"
curl -s -X POST "$BASE_URL/users" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "emailAddress": "test@example.com",
    "password": "password123",
    "status": "ACTIVE",
    "startDate": "2024-01-01",
    "technicalUser": false
  }' | jq . || echo "❌ Failed"

echo -e "\n📋 Testing Group Creation..."
echo "POST /api/groups"
curl -s -X POST "$BASE_URL/groups" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Group",
    "description": "A test group"
  }' | jq . || echo "❌ Failed"

echo -e "\n📋 Testing Role Creation..."
echo "POST /api/roles"
curl -s -X POST "$BASE_URL/roles" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Role",
    "description": "A test role",
    "permissions": ["read", "write"]
  }' | jq . || echo "❌ Failed"

echo -e "\n✅ API Testing Complete"
