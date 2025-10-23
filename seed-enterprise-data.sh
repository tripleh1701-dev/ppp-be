#!/bin/bash

# Optimized Seed Script for Enterprise Business Software Configuration
# This script creates essential data for enterprise resource planning and business applications

API_BASE="http://localhost:4000"
SLEEP_TIME=3

echo "🚀 Starting optimized enterprise data seeding..."
echo ""

# ============================================================
# 0. CLEANUP EXISTING DATA
# ============================================================
echo "🧹 Cleaning up existing data..."

# Delete linkages first
LINKAGES=$(curl -s "$API_BASE/api/enterprise-products-services" 2>/dev/null)
if [ ! -z "$LINKAGES" ]; then
  LINKAGE_IDS=$(echo $LINKAGES | grep -o '"id":"[^"]*' | grep -o '[^"]*$' || echo "")
  for LINKAGE_ID in $LINKAGE_IDS; do
    if [ ! -z "$LINKAGE_ID" ]; then
      curl -s -X DELETE "$API_BASE/api/enterprise-products-services/$LINKAGE_ID" > /dev/null 2>&1
      sleep 0.3
    fi
  done
  echo "  ✓ Deleted linkages"
fi

# Delete accounts
ACCOUNTS=$(curl -s "$API_BASE/api/accounts" 2>/dev/null)
if [ ! -z "$ACCOUNTS" ]; then
  ACCOUNT_IDS=$(echo $ACCOUNTS | grep -o '"id":"[^"]*' | grep -o '[^"]*$' || echo "")
  for ACCOUNT_ID in $ACCOUNT_IDS; do
    if [ ! -z "$ACCOUNT_ID" ]; then
      curl -s -X DELETE "$API_BASE/api/accounts/$ACCOUNT_ID" > /dev/null 2>&1
      sleep 0.3
    fi
  done
  echo "  ✓ Deleted accounts"
fi

# Delete services, products, enterprises
for ENTITY in services products enterprises users roles groups; do
  DATA=$(curl -s "$API_BASE/api/$ENTITY" 2>/dev/null)
  if [ ! -z "$DATA" ]; then
    IDS=$(echo $DATA | grep -o '"id":"[^"]*' | grep -o '[^"]*$' || echo "")
    for ID in $IDS; do
      if [ ! -z "$ID" ]; then
        curl -s -X DELETE "$API_BASE/api/$ENTITY/$ID" > /dev/null 2>&1
        sleep 0.3
      fi
    done
    echo "  ✓ Deleted $ENTITY"
  fi
done

echo "✅ Cleanup completed!"
echo ""
sleep 3

# ============================================================
# 1. CREATE DEFAULT GROUP AND ROLE WITH COMPREHENSIVE PERMISSIONS
# ============================================================
echo "👥 Creating Default Group and Role..."

# Create TechnicalUserGrp
TECH_GROUP_RESPONSE=$(curl -s -X POST $API_BASE/api/groups \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TechnicalUserGrp",
    "description": "Default group for technical users"
  }')
TECH_GROUP_ID=$(echo $TECH_GROUP_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
if [ -z "$TECH_GROUP_ID" ]; then
  echo "❌ Failed to create TechnicalUserGrp"
  exit 1
fi
echo "✅ Created TechnicalUserGrp: $TECH_GROUP_ID"
sleep $SLEEP_TIME

# Create TechnicalUserRole with comprehensive permissions
TECH_ROLE_RESPONSE=$(curl -s -X POST $API_BASE/api/roles \
  -H "Content-Type: application/json" \
  -d '{
    "name": "TechnicalUserRole",
    "description": "Default role for technical users with full DevOps permissions",
    "permissions": ["read", "write", "execute", "deploy", "manage", "admin"],
    "scopeConfig": {
      "configured": true,
      "accountSettings": [
        {"resource": "User Profile", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "Billing", "view": true, "create": false, "edit": false, "delete": false},
        {"resource": "Notifications", "view": true, "create": true, "edit": true, "delete": true},
        {"resource": "API Keys", "view": true, "create": true, "edit": true, "delete": true},
        {"resource": "accounts", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "licenses", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "addresses", "view": true, "create": true, "edit": true, "delete": true}
      ],
      "accessControl": [
        {"resource": "Users", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "Roles", "view": true, "create": false, "edit": false, "delete": false},
        {"resource": "Permissions", "view": true, "create": false, "edit": false, "delete": false},
        {"resource": "Groups", "view": true, "create": false, "edit": false, "delete": false}
      ],
      "securityGovernance": [
        {"resource": "Audit Logs", "view": true, "create": false, "edit": false, "delete": false},
        {"resource": "Compliance", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "Policies", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "Certificates", "view": true, "create": true, "edit": true, "delete": false}
      ],
      "pipelines": [
        {"resource": "Pipeline Templates", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "Execution History", "view": true, "create": false, "edit": false, "delete": false},
        {"resource": "Variables", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "Triggers", "view": true, "create": true, "edit": true, "delete": false}
      ],
      "builds": [
        {"resource": "Build Configurations", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "Artifacts", "view": true, "create": true, "edit": false, "delete": false},
        {"resource": "Deployment", "view": true, "create": true, "edit": true, "delete": false},
        {"resource": "Monitoring", "view": true, "create": false, "edit": false, "delete": false}
      ]
    }
  }')
TECH_ROLE_ID=$(echo $TECH_ROLE_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
if [ -z "$TECH_ROLE_ID" ]; then
  echo "❌ Failed to create TechnicalUserRole"
  exit 1
fi
echo "✅ Created TechnicalUserRole: $TECH_ROLE_ID"
sleep $SLEEP_TIME

# Assign TechnicalUserRole to TechnicalUserGrp
echo "🔗 Assigning TechnicalUserRole to TechnicalUserGrp..."
ROLE_ASSIGNMENT=$(curl -s -X POST $API_BASE/api/user-groups/$TECH_GROUP_ID/roles \
  -H "Content-Type: application/json" \
  -d "{
    \"roleId\": \"$TECH_ROLE_ID\",
    \"roleName\": \"TechnicalUserRole\"
  }")
echo "✅ Role assigned to group"
sleep $SLEEP_TIME

echo ""

# ============================================================
# 2. CREATE ENTERPRISE (Business Software Vendors)
# ============================================================
echo "📊 Creating Enterprise Vendors..."

# Enterprise 1: Business Suite Provider
ENTERPRISE1_RESPONSE=$(curl -s -X POST $API_BASE/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Enterprise Business Suite",
    "description": "Leading provider of enterprise resource planning and business process management solutions",
    "industry": "Enterprise Software"
  }')
ENTERPRISE1_ID=$(echo $ENTERPRISE1_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Enterprise Business Suite: $ENTERPRISE1_ID"
sleep $SLEEP_TIME

# Enterprise 2: Analytics Cloud Provider
ENTERPRISE2_RESPONSE=$(curl -s -X POST $API_BASE/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Analytics Cloud Platform",
    "description": "Cloud-based analytics and business intelligence solutions",
    "industry": "Business Analytics"
  }')
ENTERPRISE2_ID=$(echo $ENTERPRISE2_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Analytics Cloud Platform: $ENTERPRISE2_ID"
sleep $SLEEP_TIME

# Enterprise 3: Integration Platform
ENTERPRISE3_RESPONSE=$(curl -s -X POST $API_BASE/api/enterprises \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Enterprise Integration Hub",
    "description": "Integration platform for connecting enterprise applications",
    "industry": "Integration Services"
  }')
ENTERPRISE3_ID=$(echo $ENTERPRISE3_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Enterprise Integration Hub: $ENTERPRISE3_ID"
sleep $SLEEP_TIME

# ============================================================
# 3. CREATE PRODUCTS (Enterprise Applications)
# ============================================================
echo ""
echo "📦 Creating Enterprise Products..."

# Product 1: ERP System
PRODUCT1_RESPONSE=$(curl -s -X POST $API_BASE/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Business Central ERP",
    "description": "Enterprise resource planning system for finance, supply chain, and operations",
    "category": "ERP"
  }')
PRODUCT1_ID=$(echo $PRODUCT1_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Business Central ERP: $PRODUCT1_ID"
sleep $SLEEP_TIME

# Product 2: Analytics Cloud
PRODUCT2_RESPONSE=$(curl -s -X POST $API_BASE/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Analytics Cloud",
    "description": "Cloud-based business intelligence and analytics platform",
    "category": "Business Intelligence"
  }')
PRODUCT2_ID=$(echo $PRODUCT2_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Analytics Cloud: $PRODUCT2_ID"
sleep $SLEEP_TIME

# Product 3: Integration Suite
PRODUCT3_RESPONSE=$(curl -s -X POST $API_BASE/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cloud Integration Suite",
    "description": "Comprehensive integration platform for enterprise applications",
    "category": "Integration"
  }')
PRODUCT3_ID=$(echo $PRODUCT3_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Cloud Integration Suite: $PRODUCT3_ID"
sleep $SLEEP_TIME

# Product 4: CRM Platform
PRODUCT4_RESPONSE=$(curl -s -X POST $API_BASE/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Experience Platform",
    "description": "Customer relationship management and engagement platform",
    "category": "CRM"
  }')
PRODUCT4_ID=$(echo $PRODUCT4_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Customer Experience Platform: $PRODUCT4_ID"
sleep $SLEEP_TIME

# ============================================================
# 4. CREATE SERVICES (Professional Services)
# ============================================================
echo ""
echo "🔧 Creating Professional Services..."

# Service 1: Implementation
SERVICE1_RESPONSE=$(curl -s -X POST $API_BASE/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Enterprise Implementation",
    "description": "Full implementation and deployment services for enterprise solutions",
    "type": "Implementation"
  }')
SERVICE1_ID=$(echo $SERVICE1_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Enterprise Implementation: $SERVICE1_ID"
sleep $SLEEP_TIME

# Service 2: Integration Services
SERVICE2_RESPONSE=$(curl -s -X POST $API_BASE/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "System Integration Services",
    "description": "Integration and connectivity services for enterprise applications",
    "type": "Integration"
  }')
SERVICE2_ID=$(echo $SERVICE2_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created System Integration Services: $SERVICE2_ID"
sleep $SLEEP_TIME

# Service 3: Custom Development
SERVICE3_RESPONSE=$(curl -s -X POST $API_BASE/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Custom Extension Development",
    "description": "Custom development and extension services for business applications",
    "type": "Development"
  }')
SERVICE3_ID=$(echo $SERVICE3_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Custom Extension Development: $SERVICE3_ID"
sleep $SLEEP_TIME

# Service 4: Managed Services
SERVICE4_RESPONSE=$(curl -s -X POST $API_BASE/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Managed Application Services",
    "description": "24/7 monitoring, support, and management of enterprise applications",
    "type": "Managed Services"
  }')
SERVICE4_ID=$(echo $SERVICE4_RESPONSE | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Managed Application Services: $SERVICE4_ID"
sleep $SLEEP_TIME

# ============================================================
# 5. CREATE ENTERPRISE-PRODUCT-SERVICE LINKAGES
# ============================================================
echo ""
echo "🔗 Creating Configuration Linkages..."

# Linkage 1: ERP + Implementation
if [ ! -z "$ENTERPRISE1_ID" ] && [ ! -z "$PRODUCT1_ID" ] && [ ! -z "$SERVICE1_ID" ]; then
  curl -s -X POST $API_BASE/api/enterprise-products-services \
    -H "Content-Type: application/json" \
    -d "{
      \"enterpriseId\": \"$ENTERPRISE1_ID\",
      \"productId\": \"$PRODUCT1_ID\",
      \"serviceIds\": [\"$SERVICE1_ID\"]
    }" > /dev/null
  echo "✅ Linked: Business Suite + ERP + Implementation"
  sleep $SLEEP_TIME
fi

# Linkage 2: ERP + Integration
if [ ! -z "$ENTERPRISE1_ID" ] && [ ! -z "$PRODUCT1_ID" ] && [ ! -z "$SERVICE2_ID" ]; then
  curl -s -X POST $API_BASE/api/enterprise-products-services \
    -H "Content-Type: application/json" \
    -d "{
      \"enterpriseId\": \"$ENTERPRISE1_ID\",
      \"productId\": \"$PRODUCT1_ID\",
      \"serviceIds\": [\"$SERVICE2_ID\"]
    }" > /dev/null
  echo "✅ Linked: Business Suite + ERP + Integration"
  sleep $SLEEP_TIME
fi

# Linkage 3: Analytics + Implementation
if [ ! -z "$ENTERPRISE2_ID" ] && [ ! -z "$PRODUCT2_ID" ] && [ ! -z "$SERVICE1_ID" ]; then
  curl -s -X POST $API_BASE/api/enterprise-products-services \
    -H "Content-Type: application/json" \
    -d "{
      \"enterpriseId\": \"$ENTERPRISE2_ID\",
      \"productId\": \"$PRODUCT2_ID\",
      \"serviceIds\": [\"$SERVICE1_ID\"]
    }" > /dev/null
  echo "✅ Linked: Analytics Platform + Analytics Cloud + Implementation"
  sleep $SLEEP_TIME
fi

# Linkage 4: Integration Suite + Custom Development
if [ ! -z "$ENTERPRISE3_ID" ] && [ ! -z "$PRODUCT3_ID" ] && [ ! -z "$SERVICE3_ID" ]; then
  curl -s -X POST $API_BASE/api/enterprise-products-services \
    -H "Content-Type: application/json" \
    -d "{
      \"enterpriseId\": \"$ENTERPRISE3_ID\",
      \"productId\": \"$PRODUCT3_ID\",
      \"serviceIds\": [\"$SERVICE3_ID\"]
    }" > /dev/null
  echo "✅ Linked: Integration Hub + Integration Suite + Custom Development"
  sleep $SLEEP_TIME
fi

# Linkage 5: CRM + Managed Services
if [ ! -z "$ENTERPRISE1_ID" ] && [ ! -z "$PRODUCT4_ID" ] && [ ! -z "$SERVICE4_ID" ]; then
  curl -s -X POST $API_BASE/api/enterprise-products-services \
    -H "Content-Type: application/json" \
    -d "{
      \"enterpriseId\": \"$ENTERPRISE1_ID\",
      \"productId\": \"$PRODUCT4_ID\",
      \"serviceIds\": [\"$SERVICE4_ID\"]
    }" > /dev/null
  echo "✅ Linked: Business Suite + CRM Platform + Managed Services"
  sleep $SLEEP_TIME
fi

# ============================================================
# 6. CREATE SAMPLE ACCOUNTS
# ============================================================
echo ""
echo "🏢 Creating Sample Accounts..."

# Account 1: Accenture
ACCOUNT1_ID=$(curl -s -X POST $API_BASE/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "Accenture Digital",
    "masterAccount": "Accenture PLC",
    "cloudType": "Multi Cloud",
    "country": "USA",
    "addresses": [{
      "addressLine1": "161 North Clark Street",
      "addressLine2": "Suite 4400",
      "city": "Chicago",
      "state": "Illinois",
      "zipCode": "60601",
      "country": "USA"
    }]
  }' | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Accenture Digital: $ACCOUNT1_ID"
sleep $SLEEP_TIME

# Add Technical User for Accenture (with default group and role)
curl -s -X POST $API_BASE/api/users \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Michael\",
    \"lastName\": \"Chen\",
    \"emailAddress\": \"michael.chen@accenture.com\",
    \"status\": \"Active\",
    \"startDate\": \"2024-01-01\",
    \"endDate\": \"2025-12-31\",
    \"password\": \"Accenture2024!\",
    \"technicalUser\": true,
    \"assignedUserGroups\": [\"TechnicalUserGrp\"],
    \"assignedRole\": \"TechnicalUserRole\",
    \"selectedAccountId\": \"$ACCOUNT1_ID\",
    \"selectedAccountName\": \"Accenture Digital\"
  }" > /dev/null
echo "✅ Added Technical User with TechnicalUserRole → TechnicalUserGrp"
sleep $SLEEP_TIME

# Add License
curl -s -X POST $API_BASE/api/accounts/$ACCOUNT1_ID/licenses \
  -H "Content-Type: application/json" \
  -d '{
    "enterprise": "Enterprise Business Suite",
    "product": "Business Central ERP",
    "service": "Enterprise Implementation",
    "licenseStart": "2024-01-01",
    "licenseEnd": "2025-12-31",
    "users": "500",
    "renewalNotice": true,
    "noticePeriod": 90,
    "contactDetails": {
      "id": "contact-acc-1",
      "name": "Emily Rodriguez",
      "email": "emily.rodriguez@accenture.com",
      "phone": "13125554200",
      "department": "Cloud Architecture",
      "designation": "Senior Cloud Architect",
      "company": "Accenture Digital"
    }
  }' > /dev/null
echo "✅ Added ERP License with contact"
sleep $SLEEP_TIME

# Account 2: Systiva (Critical)
SYSTIVA_ID=$(curl -s -X POST $API_BASE/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "accountName": "Systiva",
    "masterAccount": "Systiva Master",
    "cloudType": "Multi Cloud",
    "country": "USA",
    "addresses": [{
      "addressLine1": "1000 Technology Plaza",
      "addressLine2": "Suite 2000",
      "city": "Seattle",
      "state": "Washington",
      "zipCode": "98101",
      "country": "USA"
    }]
  }' | grep -o '"id":"[^"]*' | grep -o '[^"]*$')
echo "✅ Created Systiva: $SYSTIVA_ID"
sleep $SLEEP_TIME

# Add Technical Users for Systiva (with default group and role)
curl -s -X POST $API_BASE/api/users \
  -H "Content-Type: application/json" \
  -d "{
    \"firstName\": \"Nihar\",
    \"lastName\": \"Sharma\",
    \"emailAddress\": \"nihar.sharma@systiva.com\",
    \"status\": \"Active\",
    \"startDate\": \"2024-01-01\",
    \"endDate\": \"2025-12-31\",
    \"password\": \"SystivaAdmin2024!\",
    \"technicalUser\": true,
    \"assignedUserGroups\": [\"TechnicalUserGrp\"],
    \"assignedRole\": \"TechnicalUserRole\",
    \"selectedAccountId\": \"$SYSTIVA_ID\",
    \"selectedAccountName\": \"Systiva\"
  }" > /dev/null
echo "✅ Added Technical User 1 for Systiva"
sleep $SLEEP_TIME

# Add Multiple Licenses for Systiva
curl -s -X POST $API_BASE/api/accounts/$SYSTIVA_ID/licenses \
  -H "Content-Type: application/json" \
  -d '{
    "enterprise": "Enterprise Business Suite",
    "product": "Business Central ERP",
    "service": "Enterprise Implementation",
    "licenseStart": "2024-01-01",
    "licenseEnd": "2025-12-31",
    "users": "1000",
    "renewalNotice": true,
    "noticePeriod": 90,
    "contactDetails": {
      "id": "contact-sys-1",
      "name": "Jennifer Martinez",
      "email": "jennifer.martinez@systiva.com",
      "phone": "12065551000",
      "department": "Enterprise Applications",
      "designation": "VP of Engineering",
      "company": "Systiva Corporation"
    }
  }' > /dev/null
echo "✅ Added ERP License for Systiva"
sleep $SLEEP_TIME

curl -s -X POST $API_BASE/api/accounts/$SYSTIVA_ID/licenses \
  -H "Content-Type: application/json" \
  -d '{
    "enterprise": "Analytics Cloud Platform",
    "product": "Analytics Cloud",
    "service": "System Integration Services",
    "licenseStart": "2024-01-01",
    "licenseEnd": "2025-12-31",
    "users": "500",
    "renewalNotice": true,
    "noticePeriod": 120,
    "contactDetails": {
      "id": "contact-sys-2",
      "name": "Patricia Chen",
      "email": "patricia.chen@systiva.com",
      "phone": "12065553000",
      "department": "Analytics",
      "designation": "Chief Data Officer",
      "company": "Systiva Corporation"
    }
  }' > /dev/null
echo "✅ Added Analytics License for Systiva"
sleep $SLEEP_TIME

echo ""
echo "============================================================"
echo "🎉 OPTIMIZED SEEDING COMPLETED SUCCESSFULLY!"
echo "============================================================"
echo ""
echo "📊 SUMMARY:"
echo "  👥 Groups: 1 (TechnicalUserGrp)"
echo "  🔐 Roles: 1 (TechnicalUserRole with comprehensive permissions)"
echo "  🔗 Role → Group Assignment: ✅ Complete"
echo ""
echo "  🏢 Enterprises: 3"
echo "    - Enterprise Business Suite (ERP Solutions)"
echo "    - Analytics Cloud Platform (BI & Analytics)"
echo "    - Enterprise Integration Hub (Integration)"
echo ""
echo "  📦 Products: 4"
echo "    - Business Central ERP"
echo "    - Analytics Cloud"
echo "    - Cloud Integration Suite"
echo "    - Customer Experience Platform"
echo ""
echo "  🔧 Services: 4"
echo "    - Enterprise Implementation"
echo "    - System Integration Services"
echo "    - Custom Extension Development"
echo "    - Managed Application Services"
echo ""
echo "  🔗 Linkages: 5 configuration combinations"
echo ""
echo "  🏢 Accounts: 2 (Accenture Digital, Systiva)"
echo "  👤 Technical Users: 2"
echo "    → All assigned to TechnicalUserGrp"
echo "    → All have TechnicalUserRole permissions"
echo "  📄 Licenses: 3 with full contact information"
echo ""
echo "✅ Frontend UI: http://localhost:3000"
echo "✅ Backend API: http://localhost:4000"
echo "============================================================"
