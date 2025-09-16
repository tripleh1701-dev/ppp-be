# Complete CURL Commands Reference

This document provides comprehensive curl commands for all operations on enterprises, products, services, and linkages.

## Base URL
```bash
BASE_URL="http://localhost:4000/api"
```

## 🏢 ENTERPRISES

### GET Operations

#### Get All Enterprises
```bash
curl -X GET "${BASE_URL}/enterprises" | jq '.'
```

#### Get Single Enterprise
```bash
# Replace {id} with actual enterprise ID
curl -X GET "${BASE_URL}/enterprises/{id}" | jq '.'

# Example with actual ID
curl -X GET "${BASE_URL}/enterprises/6df7c5bd-c896-45e8-8ebb-4bcb7620add0" | jq '.'
```

### POST Operations

#### Create Enterprise
```bash
curl -X POST "${BASE_URL}/enterprises" \
  -H "Content-Type: application/json" \
  -d '{"name": "Tech Solutions Inc"}' | jq '.'

curl -X POST "${BASE_URL}/enterprises" \
  -H "Content-Type: application/json" \
  -d '{"name": "Global Analytics Corp"}' | jq '.'

curl -X POST "${BASE_URL}/enterprises" \
  -H "Content-Type: application/json" \
  -d '{"name": "Innovation Labs"}' | jq '.'
```

### PUT Operations

#### Update Enterprise
```bash
# Replace {id} with actual enterprise ID
curl -X PUT "${BASE_URL}/enterprises/{id}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Enterprise Name"}' | jq '.'

# Example with actual ID
curl -X PUT "${BASE_URL}/enterprises/6df7c5bd-c896-45e8-8ebb-4bcb7620add0" \
  -H "Content-Type: application/json" \
  -d '{"name": "Tech Solutions International"}' | jq '.'
```

---

## 📦 PRODUCTS

### GET Operations

#### Get All Products
```bash
curl -X GET "${BASE_URL}/products" | jq '.'
```

#### Get Single Product
```bash
# Replace {id} with actual product ID
curl -X GET "${BASE_URL}/products/{id}" | jq '.'

# Example with actual ID
curl -X GET "${BASE_URL}/products/bab88a52-8a5c-4b8c-b317-79bdfc04a2d6" | jq '.'
```

### POST Operations

#### Create Product
```bash
curl -X POST "${BASE_URL}/products" \
  -H "Content-Type: application/json" \
  -d '{"name": "AI Platform"}' | jq '.'

curl -X POST "${BASE_URL}/products" \
  -H "Content-Type: application/json" \
  -d '{"name": "Data Analytics Suite"}' | jq '.'

curl -X POST "${BASE_URL}/products" \
  -H "Content-Type: application/json" \
  -d '{"name": "Cloud Infrastructure"}' | jq '.'

curl -X POST "${BASE_URL}/products" \
  -H "Content-Type: application/json" \
  -d '{"name": "Mobile Application Framework"}' | jq '.'
```

### PUT Operations

#### Update Product
```bash
# Replace {id} with actual product ID
curl -X PUT "${BASE_URL}/products/{id}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Product Name"}' | jq '.'

# Example with actual ID
curl -X PUT "${BASE_URL}/products/bab88a52-8a5c-4b8c-b317-79bdfc04a2d6" \
  -H "Content-Type: application/json" \
  -d '{"name": "AI Platform Pro"}' | jq '.'
```

---

## 🔧 SERVICES

### GET Operations

#### Get All Services
```bash
curl -X GET "${BASE_URL}/services" | jq '.'
```

#### Get Single Service
```bash
# Replace {id} with actual service ID
curl -X GET "${BASE_URL}/services/{id}" | jq '.'

# Example with actual ID
curl -X GET "${BASE_URL}/services/b140b90d-ac61-434c-9b19-d3fbb10bf5b4" | jq '.'
```

### POST Operations

#### Create Service
```bash
curl -X POST "${BASE_URL}/services" \
  -H "Content-Type: application/json" \
  -d '{"name": "Machine Learning API"}' | jq '.'

curl -X POST "${BASE_URL}/services" \
  -H "Content-Type: application/json" \
  -d '{"name": "Data Processing"}' | jq '.'

curl -X POST "${BASE_URL}/services" \
  -H "Content-Type: application/json" \
  -d '{"name": "Analytics Engine"}' | jq '.'

curl -X POST "${BASE_URL}/services" \
  -H "Content-Type: application/json" \
  -d '{"name": "Real-time Streaming"}' | jq '.'

curl -X POST "${BASE_URL}/services" \
  -H "Content-Type: application/json" \
  -d '{"name": "Data Visualization"}' | jq '.'

curl -X POST "${BASE_URL}/services" \
  -H "Content-Type: application/json" \
  -d '{"name": "API Gateway"}' | jq '.'
```

### PUT Operations

#### Update Service
```bash
# Replace {id} with actual service ID
curl -X PUT "${BASE_URL}/services/{id}" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Service Name"}' | jq '.'

# Example with actual ID
curl -X PUT "${BASE_URL}/services/b140b90d-ac61-434c-9b19-d3fbb10bf5b4" \
  -H "Content-Type: application/json" \
  -d '{"name": "Advanced Machine Learning API"}' | jq '.'
```

---

## 🔗 ENTERPRISE-PRODUCT-SERVICE LINKAGES

### GET Operations

#### Get All Linkages (Enhanced with Names)
```bash
curl -X GET "${BASE_URL}/enterprise-products-services" | jq '.'
```

#### Get Single Linkage
```bash
# Replace {id} with actual linkage ID
curl -X GET "${BASE_URL}/enterprise-products-services/{id}" | jq '.'

# Example with actual ID
curl -X GET "${BASE_URL}/enterprise-products-services/e92737b1-5716-42c9-b1dd-0e04e601e8fd" | jq '.'
```

#### Get Linkages by Enterprise (Detailed with Names)
```bash
# Replace {enterpriseId} with actual enterprise ID
curl -X GET "${BASE_URL}/enterprise-products-services/enterprise/{enterpriseId}/detailed" | jq '.'

# Example with actual ID
curl -X GET "${BASE_URL}/enterprise-products-services/enterprise/6df7c5bd-c896-45e8-8ebb-4bcb7620add0/detailed" | jq '.'
```

#### Get Linkages by Enterprise (Basic)
```bash
# Replace {enterpriseId} with actual enterprise ID
curl -X GET "${BASE_URL}/enterprise-products-services/enterprise/{enterpriseId}" | jq '.'

# Example with actual ID
curl -X GET "${BASE_URL}/enterprise-products-services/enterprise/6df7c5bd-c896-45e8-8ebb-4bcb7620add0" | jq '.'
```

#### Get Linkages by Product
```bash
# Replace {productId} with actual product ID
curl -X GET "${BASE_URL}/enterprise-products-services/product/{productId}" | jq '.'

# Example with actual ID
curl -X GET "${BASE_URL}/enterprise-products-services/product/bab88a52-8a5c-4b8c-b317-79bdfc04a2d6" | jq '.'
```

#### Get Linkages by Service
```bash
# Replace {serviceId} with actual service ID
curl -X GET "${BASE_URL}/enterprise-products-services/service/{serviceId}" | jq '.'

# Example with actual ID
curl -X GET "${BASE_URL}/enterprise-products-services/service/b140b90d-ac61-434c-9b19-d3fbb10bf5b4" | jq '.'
```

### POST Operations

#### Create Linkage (Single Service)
```bash
curl -X POST "${BASE_URL}/enterprise-products-services" \
  -H "Content-Type: application/json" \
  -d '{
    "enterpriseId": "6df7c5bd-c896-45e8-8ebb-4bcb7620add0",
    "productId": "bab88a52-8a5c-4b8c-b317-79bdfc04a2d6",
    "serviceIds": ["b140b90d-ac61-434c-9b19-d3fbb10bf5b4"]
  }' | jq '.'
```

#### Create Linkage (Multiple Services)
```bash
curl -X POST "${BASE_URL}/enterprise-products-services" \
  -H "Content-Type: application/json" \
  -d '{
    "enterpriseId": "6df7c5bd-c896-45e8-8ebb-4bcb7620add0",
    "productId": "bab88a52-8a5c-4b8c-b317-79bdfc04a2d6",
    "serviceIds": [
      "b140b90d-ac61-434c-9b19-d3fbb10bf5b4",
      "7cc9f153-e378-4b5a-84d9-aa47514ebf76",
      "c7a70c4f-f9b7-473a-99fa-009328c8ff5b"
    ]
  }' | jq '.'
```

### PUT Operations

#### Update Linkage
```bash
# Replace {id} with actual linkage ID
curl -X PUT "${BASE_URL}/enterprise-products-services/{id}" \
  -H "Content-Type: application/json" \
  -d '{
    "enterpriseId": "6df7c5bd-c896-45e8-8ebb-4bcb7620add0",
    "productId": "bab88a52-8a5c-4b8c-b317-79bdfc04a2d6",
    "serviceIds": ["b140b90d-ac61-434c-9b19-d3fbb10bf5b4"]
  }' | jq '.'

# Example with actual ID
curl -X PUT "${BASE_URL}/enterprise-products-services/e92737b1-5716-42c9-b1dd-0e04e601e8fd" \
  -H "Content-Type: application/json" \
  -d '{
    "enterpriseId": "6df7c5bd-c896-45e8-8ebb-4bcb7620add0",
    "productId": "bab88a52-8a5c-4b8c-b317-79bdfc04a2d6",
    "serviceIds": [
      "b140b90d-ac61-434c-9b19-d3fbb10bf5b4",
      "7cc9f153-e378-4b5a-84d9-aa47514ebf76"
    ]
  }' | jq '.'
```

---

## 🛠️ UTILITY COMMANDS

### Health Check
```bash
curl -X GET "http://localhost:4000/health" | jq '.'
```

### Debug DynamoDB Contents
```bash
curl -X GET "${BASE_URL}/enterprises/debug/dynamodb" | jq '.'
```

---

## 📝 COMPLETE WORKFLOW EXAMPLE

Here's a complete workflow example that creates entities and linkages:

```bash
#!/bin/bash
BASE_URL="http://localhost:4000/api"

echo "=== Creating Enterprise ==="
ENT_RESPONSE=$(curl -s -X POST "${BASE_URL}/enterprises" \
  -H "Content-Type: application/json" \
  -d '{"name": "Demo Tech Corp"}')
ENT_ID=$(echo $ENT_RESPONSE | jq -r '.id')
echo "Enterprise ID: $ENT_ID"

echo "=== Creating Product ==="
PROD_RESPONSE=$(curl -s -X POST "${BASE_URL}/products" \
  -H "Content-Type: application/json" \
  -d '{"name": "Demo Platform"}')
PROD_ID=$(echo $PROD_RESPONSE | jq -r '.id')
echo "Product ID: $PROD_ID"

echo "=== Creating Services ==="
SVC1_RESPONSE=$(curl -s -X POST "${BASE_URL}/services" \
  -H "Content-Type: application/json" \
  -d '{"name": "Demo API Service"}')
SVC1_ID=$(echo $SVC1_RESPONSE | jq -r '.id')

SVC2_RESPONSE=$(curl -s -X POST "${BASE_URL}/services" \
  -H "Content-Type: application/json" \
  -d '{"name": "Demo Processing Service"}')
SVC2_ID=$(echo $SVC2_RESPONSE | jq -r '.id')

echo "Service IDs: $SVC1_ID, $SVC2_ID"

echo "=== Creating Linkage ==="
LINKAGE_RESPONSE=$(curl -s -X POST "${BASE_URL}/enterprise-products-services" \
  -H "Content-Type: application/json" \
  -d "{\"enterpriseId\": \"$ENT_ID\", \"productId\": \"$PROD_ID\", \"serviceIds\": [\"$SVC1_ID\", \"$SVC2_ID\"]}")
LINKAGE_ID=$(echo $LINKAGE_RESPONSE | jq -r '.id')
echo "Linkage ID: $LINKAGE_ID"

echo "=== Viewing Complete Configuration ==="
curl -s -X GET "${BASE_URL}/enterprise-products-services" | jq '.'
```

---

## 🔑 Response Formats

### Enterprise Response
```json
{
  "id": "uuid-string",
  "name": "Enterprise Name",
  "createdAt": "2025-09-16T08:38:51.894Z",
  "updatedAt": "2025-09-16T08:38:51.894Z"
}
```

### Product Response
```json
{
  "id": "uuid-string",
  "name": "Product Name",
  "createdAt": "2025-09-16T08:38:51.904Z",
  "updatedAt": "2025-09-16T08:38:51.904Z"
}
```

### Service Response
```json
{
  "id": "uuid-string",
  "name": "Service Name",
  "createdAt": "2025-09-16T08:38:51.914Z",
  "updatedAt": "2025-09-16T08:38:51.914Z"
}
```

### Enhanced Linkage Response (with Names)
```json
{
  "id": "linkage-uuid",
  "enterpriseId": "enterprise-uuid",
  "productId": "product-uuid",
  "serviceIds": ["service-uuid-1", "service-uuid-2"],
  "enterprise": {
    "id": "enterprise-uuid",
    "name": "Enterprise Name"
  },
  "product": {
    "id": "product-uuid",
    "name": "Product Name"
  },
  "services": [
    {
      "id": "service-uuid-1",
      "name": "Service Name 1"
    },
    {
      "id": "service-uuid-2",
      "name": "Service Name 2"
    }
  ],
  "createdAt": "2025-09-16T08:40:37.751Z",
  "updatedAt": "2025-09-16T08:40:37.751Z"
}
```

---

## 📋 Notes

1. **All IDs are UUIDs** when using DynamoDB storage mode
2. **Replace placeholders** like `{id}`, `{enterpriseId}`, etc. with actual UUID values
3. **Enhanced linkage endpoint** (`/enterprise-products-services`) returns complete information with names for easy frontend rendering
4. **Use `jq '.'`** for pretty-printed JSON output
5. **All responses include** `createdAt` and `updatedAt` timestamps
6. **The application must be running** on `http://localhost:4000` for these commands to work
