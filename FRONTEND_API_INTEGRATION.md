# Frontend API Integration Guide

This guide shows how the frontend should interact with the DynamoDB-based backend APIs for Enterprise, Product, Service, and their linkages.

## API Base URL
```javascript
const API_BASE_URL = 'http://localhost:4000/api';
```

## 1. Enterprise Management APIs

### Get All Enterprises
```javascript
// GET /api/enterprises
const getEnterprises = async () => {
  const response = await fetch(`${API_BASE_URL}/enterprises`);
  return await response.json();
};

// Response format:
[
  {
    "id": "49ba95a0-ee80-4b7f-83e0-055206f44afe",
    "name": "Premium Solutions Enterprise",
    "createdAt": "2025-09-16T07:07:52.070Z",
    "updatedAt": "2025-09-16T07:07:52.070Z"
  }
]
```

### Create Enterprise
```javascript
// POST /api/enterprises
const createEnterprise = async (enterpriseData) => {
  const response = await fetch(`${API_BASE_URL}/enterprises`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: enterpriseData.name
    })
  });
  return await response.json();
};

// Usage:
createEnterprise({ name: "New Enterprise Corp" });
```

### Update Enterprise
```javascript
// PUT /api/enterprises/:id
const updateEnterprise = async (enterpriseId, enterpriseData) => {
  const response = await fetch(`${API_BASE_URL}/enterprises/${enterpriseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: enterpriseData.name
    })
  });
  return await response.json();
};
```

## 2. Product Management APIs

### Get All Products
```javascript
// GET /api/products
const getProducts = async () => {
  const response = await fetch(`${API_BASE_URL}/products`);
  return await response.json();
};

// Response format:
[
  {
    "id": "869bac32-9263-4a35-86af-cb89121c92f1",
    "name": "Cloud Infrastructure",
    "createdAt": "2025-09-16T07:42:37.031Z",
    "updatedAt": "2025-09-16T07:42:37.031Z"
  }
]
```

### Create Product
```javascript
// POST /api/products
const createProduct = async (productData) => {
  const response = await fetch(`${API_BASE_URL}/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: productData.name
    })
  });
  return await response.json();
};

// Usage:
createProduct({ name: "AI/ML Platform" });
```

## 3. Service Management APIs

### Get All Services
```javascript
// GET /api/services
const getServices = async () => {
  const response = await fetch(`${API_BASE_URL}/services`);
  return await response.json();
};

// Response format:
[
  {
    "id": "4f9faf39-a64b-486f-bd3f-1bab19185dea",
    "name": "AWS EC2 Management",
    "createdAt": "2025-09-16T07:43:06.028Z",
    "updatedAt": "2025-09-16T07:43:06.028Z"
  }
]
```

### Create Service
```javascript
// POST /api/services
const createService = async (serviceData) => {
  const response = await fetch(`${API_BASE_URL}/services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: serviceData.name
    })
  });
  return await response.json();
};

// Usage:
createService({ name: "API Gateway Service" });
```

## 4. Enterprise-Product-Service Linkage APIs

### Create Linkage
```javascript
// POST /api/enterprise-products-services
const createLinkage = async (linkageData) => {
  const response = await fetch(`${API_BASE_URL}/enterprise-products-services`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      enterpriseId: linkageData.enterpriseId,
      productId: linkageData.productId,
      serviceIds: linkageData.serviceIds  // Array of service IDs
    })
  });
  return await response.json();
};

// Usage:
createLinkage({
  enterpriseId: "49ba95a0-ee80-4b7f-83e0-055206f44afe",
  productId: "869bac32-9263-4a35-86af-cb89121c92f1",
  serviceIds: [
    "4f9faf39-a64b-486f-bd3f-1bab19185dea",
    "fca0b767-70df-4008-afb4-706f846f53c3"
  ]
});

// Response format:
{
  "id": "c99c50f5-b7c0-4fae-843f-7cfb6fab321a",
  "enterpriseId": "49ba95a0-ee80-4b7f-83e0-055206f44afe",
  "productId": "869bac32-9263-4a35-86af-cb89121c92f1",
  "serviceIds": [
    "4f9faf39-a64b-486f-bd3f-1bab19185dea",
    "fca0b767-70df-4008-afb4-706f846f53c3"
  ],
  "createdAt": "2025-09-16T07:43:54.816Z",
  "updatedAt": "2025-09-16T07:43:54.816Z"
}
```

### Get Linkages by Enterprise
```javascript
// GET /api/enterprise-products-services/enterprise/:enterpriseId
const getLinkagesByEnterprise = async (enterpriseId) => {
  const response = await fetch(`${API_BASE_URL}/enterprise-products-services/enterprise/${enterpriseId}`);
  return await response.json();
};
```

### Get Detailed Linkages (with names)
```javascript
// GET /api/enterprise-products-services/enterprise/:enterpriseId/detailed
const getDetailedLinkagesByEnterprise = async (enterpriseId) => {
  const response = await fetch(`${API_BASE_URL}/enterprise-products-services/enterprise/${enterpriseId}/detailed`);
  return await response.json();
};

// Response format:
[
  {
    "id": "c99c50f5-b7c0-4fae-843f-7cfb6fab321a",
    "enterprise": {
      "id": "49ba95a0-ee80-4b7f-83e0-055206f44afe",
      "name": "Premium Solutions Enterprise"
    },
    "product": {
      "id": "869bac32-9263-4a35-86af-cb89121c92f1",
      "name": "Cloud Infrastructure"
    },
    "services": [
      {
        "id": "4f9faf39-a64b-486f-bd3f-1bab19185dea",
        "name": "AWS EC2 Management"
      },
      {
        "id": "fca0b767-70df-4008-afb4-706f846f53c3",
        "name": "Load Balancing"
      }
    ],
    "createdAt": "2025-09-16T07:43:54.816Z",
    "updatedAt": "2025-09-16T07:43:54.816Z"
  }
]
```

## 5. React.js Implementation Examples

### Custom Hook for API Calls
```javascript
// hooks/useApi.js
import { useState, useEffect } from 'react';

const API_BASE_URL = 'http://localhost:4000/api';

export const useApi = (endpoint) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`${API_BASE_URL}${endpoint}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [endpoint]);

  return { data, loading, error };
};
```

### Enterprise Management Component
```javascript
// components/EnterpriseManager.jsx
import React, { useState } from 'react';
import { useApi } from '../hooks/useApi';

const EnterpriseManager = () => {
  const { data: enterprises, loading, error } = useApi('/enterprises');
  const [newEnterpriseName, setNewEnterpriseName] = useState('');

  const createEnterprise = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch('http://localhost:4000/api/enterprises', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: newEnterpriseName })
      });
      
      if (response.ok) {
        // Refresh the page or update state
        window.location.reload();
      }
    } catch (error) {
      console.error('Error creating enterprise:', error);
    }
  };

  if (loading) return <div>Loading enterprises...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="enterprise-manager">
      <h2>Enterprise Management</h2>
      
      {/* Create Enterprise Form */}
      <form onSubmit={createEnterprise} className="mb-4">
        <div className="form-group">
          <input
            type="text"
            value={newEnterpriseName}
            onChange={(e) => setNewEnterpriseName(e.target.value)}
            placeholder="Enterprise Name"
            required
            className="form-control"
          />
          <button type="submit" className="btn btn-primary">
            Create Enterprise
          </button>
        </div>
      </form>

      {/* Enterprises List */}
      <div className="enterprises-list">
        <h3>Existing Enterprises</h3>
        {enterprises?.map(enterprise => (
          <div key={enterprise.id} className="enterprise-card">
            <h4>{enterprise.name}</h4>
            <p>ID: {enterprise.id}</p>
            <p>Created: {new Date(enterprise.createdAt).toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EnterpriseManager;
```

### Linkage Management Component
```javascript
// components/LinkageManager.jsx
import React, { useState, useEffect } from 'react';

const LinkageManager = () => {
  const [enterprises, setEnterprises] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedEnterprise, setSelectedEnterprise] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedServices, setSelectedServices] = useState([]);

  useEffect(() => {
    // Load initial data
    Promise.all([
      fetch('http://localhost:4000/api/enterprises').then(r => r.json()),
      fetch('http://localhost:4000/api/products').then(r => r.json()),
      fetch('http://localhost:4000/api/services').then(r => r.json())
    ]).then(([entData, prodData, servData]) => {
      setEnterprises(entData);
      setProducts(prodData);
      setServices(servData);
    });
  }, []);

  const handleServiceToggle = (serviceId) => {
    setSelectedServices(prev => 
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const createLinkage = async (e) => {
    e.preventDefault();
    
    if (!selectedEnterprise || !selectedProduct || selectedServices.length === 0) {
      alert('Please select enterprise, product, and at least one service');
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/api/enterprise-products-services', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enterpriseId: selectedEnterprise,
          productId: selectedProduct,
          serviceIds: selectedServices
        })
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Linkage created successfully! ID: ${result.id}`);
        // Reset form
        setSelectedEnterprise('');
        setSelectedProduct('');
        setSelectedServices([]);
      }
    } catch (error) {
      console.error('Error creating linkage:', error);
    }
  };

  return (
    <div className="linkage-manager">
      <h2>Create Enterprise-Product-Service Linkage</h2>
      
      <form onSubmit={createLinkage}>
        {/* Enterprise Selection */}
        <div className="form-group">
          <label>Select Enterprise:</label>
          <select
            value={selectedEnterprise}
            onChange={(e) => setSelectedEnterprise(e.target.value)}
            required
          >
            <option value="">Choose Enterprise...</option>
            {enterprises.map(enterprise => (
              <option key={enterprise.id} value={enterprise.id}>
                {enterprise.name}
              </option>
            ))}
          </select>
        </div>

        {/* Product Selection */}
        <div className="form-group">
          <label>Select Product:</label>
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            required
          >
            <option value="">Choose Product...</option>
            {products.map(product => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </select>
        </div>

        {/* Services Selection (Multiple) */}
        <div className="form-group">
          <label>Select Services:</label>
          <div className="services-checkbox-group">
            {services.map(service => (
              <div key={service.id} className="checkbox-item">
                <input
                  type="checkbox"
                  id={service.id}
                  checked={selectedServices.includes(service.id)}
                  onChange={() => handleServiceToggle(service.id)}
                />
                <label htmlFor={service.id}>{service.name}</label>
              </div>
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn-success">
          Create Linkage
        </button>
      </form>
    </div>
  );
};

export default LinkageManager;
```

## 6. Vue.js Implementation Example

```javascript
// components/EnterpriseService.vue
<template>
  <div class="enterprise-service">
    <h2>Enterprise Configuration</h2>
    
    <!-- Enterprise Selection -->
    <div class="section">
      <h3>Select Enterprise</h3>
      <select v-model="selectedEnterpriseId" @change="loadEnterpriseDetails">
        <option value="">Choose Enterprise...</option>
        <option v-for="enterprise in enterprises" :key="enterprise.id" :value="enterprise.id">
          {{ enterprise.name }}
        </option>
      </select>
    </div>

    <!-- Enterprise Details -->
    <div v-if="enterpriseDetails.length > 0" class="enterprise-details">
      <h3>Enterprise Configuration</h3>
      <div v-for="detail in enterpriseDetails" :key="detail.id" class="config-item">
        <h4>{{ detail.product.name }}</h4>
        <div class="services">
          <span v-for="service in detail.services" :key="service.id" class="service-tag">
            {{ service.name }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'EnterpriseService',
  data() {
    return {
      enterprises: [],
      selectedEnterpriseId: '',
      enterpriseDetails: []
    };
  },
  async mounted() {
    await this.loadEnterprises();
  },
  methods: {
    async loadEnterprises() {
      try {
        const response = await fetch('http://localhost:4000/api/enterprises');
        this.enterprises = await response.json();
      } catch (error) {
        console.error('Error loading enterprises:', error);
      }
    },
    async loadEnterpriseDetails() {
      if (!this.selectedEnterpriseId) {
        this.enterpriseDetails = [];
        return;
      }

      try {
        const response = await fetch(
          `http://localhost:4000/api/enterprise-products-services/enterprise/${this.selectedEnterpriseId}/detailed`
        );
        this.enterpriseDetails = await response.json();
      } catch (error) {
        console.error('Error loading enterprise details:', error);
      }
    }
  }
};
</script>
```

## 7. Error Handling

```javascript
// utils/apiClient.js
class ApiClient {
  constructor(baseURL = 'http://localhost:4000/api') {
    this.baseURL = baseURL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Enterprise methods
  getEnterprises() {
    return this.request('/enterprises');
  }

  createEnterprise(data) {
    return this.request('/enterprises', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Product methods
  getProducts() {
    return this.request('/products');
  }

  createProduct(data) {
    return this.request('/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Service methods
  getServices() {
    return this.request('/services');
  }

  createService(data) {
    return this.request('/services', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Linkage methods
  createLinkage(data) {
    return this.request('/enterprise-products-services', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  getEnterpriseDetails(enterpriseId) {
    return this.request(`/enterprise-products-services/enterprise/${enterpriseId}/detailed`);
  }
}

export default new ApiClient();
```

## 8. Data Flow Summary

1. **Frontend loads dropdowns**: Get enterprises, products, and services
2. **User creates linkages**: Select enterprise + product + services → POST to linkage API
3. **Display configurations**: Use detailed endpoint to show human-readable names
4. **Real-time updates**: Refresh data after create/update operations

## 9. Key Frontend Considerations

- **UUIDs**: All IDs are UUID strings, not numbers
- **Multiple Services**: serviceIds is always an array
- **Error Handling**: Handle network errors and API error responses
- **Loading States**: Show loading indicators during API calls
- **Validation**: Validate required fields before API calls
- **Caching**: Consider caching dropdown data to reduce API calls
