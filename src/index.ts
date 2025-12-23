/**
 * Simplified AWS Lambda Handler for ppp-be-main
 *
 * This handler directly processes API requests without full NestJS overhead
 * to ensure reliable Lambda execution.
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import {AccountsDynamoDBService} from './services/accounts-dynamodb';
import {EnterprisesDynamoDBService} from './services/enterprises-dynamodb';
import {ProductsDynamoDBService} from './services/products-dynamodb';
import {ServicesDynamoDBService} from './services/services-dynamodb';

// Load environment variables
dotenv.config();

// CORS headers for all responses
const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
};

// Initialize services once (reused across warm starts)
let accountsService: AccountsDynamoDBService | null = null;
let enterprisesService: EnterprisesDynamoDBService | null = null;
let productsService: ProductsDynamoDBService | null = null;
let servicesService: ServicesDynamoDBService | null = null;

function initServices(): void {
    if (!accountsService) {
        console.log('🔧 Initializing services...');
        const STORAGE_DIR = process.env.STORAGE_DIR || '/tmp';
        accountsService = new AccountsDynamoDBService();
        enterprisesService = new EnterprisesDynamoDBService(STORAGE_DIR);
        productsService = new ProductsDynamoDBService(STORAGE_DIR);
        servicesService = new ServicesDynamoDBService(STORAGE_DIR);
        console.log('✅ Services initialized');
    }
}

// Helper to create response
function response(statusCode: number, body: any): any {
    return {
        statusCode,
        headers: CORS_HEADERS,
        body: JSON.stringify(body),
    };
}

// Helper to extract path from event
function getPath(event: any): string {
    // Handle both API Gateway v1 and v2 formats
    let path = event.path || event.rawPath || '';

    // Remove stage prefix if present (e.g., /prod, /dev)
    const stage = event.requestContext?.stage;
    if (stage && path.startsWith(`/${stage}`)) {
        path = path.slice(stage.length + 1);
    }

    // Remove /api/v1/app prefix for routing (our proxy path)
    if (path.startsWith('/api/v1/app')) {
        path = path.slice('/api/v1/app'.length);
    }

    return path;
}

// Helper to get HTTP method
function getMethod(event: any): string {
    return (
        event.httpMethod ||
        event.requestContext?.http?.method ||
        'GET'
    ).toUpperCase();
}

// Helper to parse body
function parseBody(event: any): any {
    if (!event.body) return {};
    try {
        if (event.isBase64Encoded) {
            return JSON.parse(Buffer.from(event.body, 'base64').toString());
        }
        return JSON.parse(event.body);
    } catch {
        return {};
    }
}

/**
 * Main Lambda Handler
 */
export const handler = async (event: any, context: any): Promise<any> => {
    console.log('📨 Lambda invoked');
    console.log('Event path:', event.path || event.rawPath);
    console.log('Event method:', event.httpMethod || event.requestContext?.http?.method);

    // Handle OPTIONS (CORS preflight)
    if (getMethod(event) === 'OPTIONS') {
        return response(200, {message: 'OK'});
    }

    try {
        // Initialize services
        initServices();

        const path = getPath(event);
        const method = getMethod(event);

        console.log('🔀 Routing:', method, path);

        // Health check
        if (path === '/health' || path === '/api/health') {
            return response(200, {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                version: '1.0.0',
            });
        }

        // ============ ACCOUNTS ROUTES ============
        if (path === '/api/accounts' && method === 'GET') {
            console.log('📋 GET /api/accounts');
            const accounts = await accountsService!.list();
            return response(200, {
                msg: 'Accounts retrieved successfully',
                data: {
                    accounts: accounts || [],
                    totalCount: accounts?.length || 0,
                    timestamp: new Date().toISOString(),
                },
                result: 'success',
            });
        }

        if (path === '/api/accounts/onboard' && method === 'POST') {
            console.log('📝 POST /api/accounts/onboard');
            const body = parseBody(event);

            // Validate required fields (only 3 required)
            const requiredFields = ['accountName', 'masterAccount', 'subscriptionTier'];
            const missingFields = requiredFields.filter((f) => !body[f]);

            if (missingFields.length > 0) {
                return response(400, {
                    result: 'failed',
                    msg: `Missing required fields: ${missingFields.join(', ')}`,
                });
            }

            // Map subscriptionTier to cloudType for storage
            let cloudType = body.subscriptionTier || '';
            if (body.subscriptionTier) {
                const tier = body.subscriptionTier.toLowerCase();
                if (tier === 'private') {
                    cloudType = 'Private Cloud';
                } else if (tier === 'public' || tier === 'platform') {
                    cloudType = 'Public Cloud';
                }
            }

            // Create account using the service
            const account = await accountsService!.create({
                accountName: body.accountName,
                masterAccount: body.masterAccount,
                subscriptionTier: body.subscriptionTier,
                cloudType: cloudType,
                email: body.email || body.technicalUser?.adminEmail || '',
                firstName: body.firstName || body.technicalUser?.firstName || '',
                lastName: body.lastName || body.technicalUser?.lastName || '',
                status: body.status || 'Active',
                technicalUsers: body.technicalUser ? [body.technicalUser] : [],
                addresses: body.addressDetails ? [body.addressDetails] : [],
            } as any);

            return response(201, {
                result: 'success',
                msg: 'Account created successfully',
                data: {
                    account,
                    accountId: account?.id,
                },
            });
        }

        // PUT /api/accounts/:id
        if (path.startsWith('/api/accounts/') && !path.includes('/onboard') && method === 'PUT') {
            const id = path.replace('/api/accounts/', '');
            console.log('📝 PUT /api/accounts/' + id);
            const body = parseBody(event);
            const account = await accountsService!.update(id, body);
            return response(200, {
                result: 'success',
                msg: 'Account updated successfully',
                data: { account },
            });
        }

        // ============ ENTERPRISES ROUTES ============
        if (path === '/api/enterprises' && method === 'GET') {
            console.log('📋 GET /api/enterprises');
            const enterprises = await enterprisesService!.list();
            return response(200, {
                data: enterprises || [],
                totalCount: enterprises?.length || 0,
            });
        }

        if (path === '/api/enterprises' && method === 'POST') {
            console.log('📝 POST /api/enterprises');
            const body = parseBody(event);
            const enterprise = await enterprisesService!.create(body);
            return response(201, enterprise);
        }

        // PUT /api/enterprises/:id
        if (path.startsWith('/api/enterprises/') && method === 'PUT') {
            const id = path.replace('/api/enterprises/', '');
            console.log('📝 PUT /api/enterprises/' + id);
            const body = parseBody(event);
            const enterprise = await enterprisesService!.update(id, body);
            return response(200, enterprise);
        }

        // ============ PRODUCTS ROUTES ============
        if (path === '/api/products' && method === 'GET') {
            console.log('📋 GET /api/products');
            const products = await productsService!.list();
            return response(200, {
                data: products || [],
                totalCount: products?.length || 0,
            });
        }

        if (path === '/api/products' && method === 'POST') {
            console.log('📝 POST /api/products');
            const body = parseBody(event);
            const product = await productsService!.create(body);
            return response(201, product);
        }

        // PUT /api/products/:id
        if (path.startsWith('/api/products/') && method === 'PUT') {
            const id = path.replace('/api/products/', '');
            console.log('📝 PUT /api/products/' + id);
            const body = parseBody(event);
            const product = await productsService!.update(id, body);
            return response(200, product);
        }

        // ============ SERVICES ROUTES ============
        if (path === '/api/services' && method === 'GET') {
            console.log('📋 GET /api/services');
            const svcList = await servicesService!.list();
            return response(200, {
                data: svcList || [],
                totalCount: svcList?.length || 0,
            });
        }

        if (path === '/api/services' && method === 'POST') {
            console.log('📝 POST /api/services');
            const body = parseBody(event);
            const svc = await servicesService!.create(body);
            return response(201, svc);
        }

        // PUT /api/services/:id
        if (path.startsWith('/api/services/') && method === 'PUT') {
            const id = path.replace('/api/services/', '');
            console.log('📝 PUT /api/services/' + id);
            const body = parseBody(event);
            const svc = await servicesService!.update(id, body);
            return response(200, svc);
        }

        // ============ 404 NOT FOUND ============
        console.log('❌ Route not found:', method, path);
        return response(404, {
            error: 'Not Found',
            message: `Route ${method} ${path} not found`,
            availableRoutes: [
                'GET /api/accounts',
                'POST /api/accounts/onboard',
                'PUT /api/accounts/:id',
                'GET /api/enterprises',
                'POST /api/enterprises',
                'PUT /api/enterprises/:id',
                'GET /api/products',
                'POST /api/products',
                'PUT /api/products/:id',
                'GET /api/services',
                'POST /api/services',
                'PUT /api/services/:id',
            ],
        });
    } catch (error: any) {
        console.error('❌ Handler error:', error);
        return response(500, {
            error: 'Internal Server Error',
            message: error?.message || 'Unknown error',
            stack: process.env.NODE_ENV === 'dev' ? error?.stack : undefined,
        });
    }
};
