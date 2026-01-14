/**
 * AWS Lambda Handler for ppp-be-main
 *
 * This handler wraps the existing NestJS application using @vendia/serverless-express
 * to leverage all existing controllers, services, and routes defined in main.ts
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import {NestFactory} from '@nestjs/core';
import {ExpressAdapter} from '@nestjs/platform-express';
import serverlessExpress from '@vendia/serverless-express';
import express from 'express';
import {AppModule} from './main';

// Load environment variables
dotenv.config();

// Cached serverless express instance for warm starts
let cachedServer: any;

async function bootstrapServer(): Promise<any> {
    if (cachedServer) {
        console.log('🔄 Using cached server instance');
        return cachedServer;
    }

    console.log('🚀 Bootstrapping NestJS application for Lambda...');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Storage Mode:', process.env.STORAGE_MODE || 'dynamodb');
    console.log(
        'Account Registry Table:',
        process.env.ACCOUNT_REGISTRY_TABLE_NAME,
    );

    // Create Express instance
    const expressApp = express();

    // Create NestJS app with Express adapter
    const nestApp = await NestFactory.create(
        AppModule,
        new ExpressAdapter(expressApp),
        {
            logger: ['error', 'warn', 'log'],
        },
    );

    // Enable CORS
    nestApp.enableCors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        credentials: true,
    });

    // Initialize the app
    await nestApp.init();

    console.log('✅ NestJS application initialized for Lambda');

    // Create serverless express handler
    cachedServer = serverlessExpress({app: expressApp});

    return cachedServer;
}

/**
 * Main Lambda Handler
 * Proxies all requests to the NestJS application
 */
export const handler = async (event: any, context: any): Promise<any> => {
    console.log('📨 Lambda invoked');
    console.log('Original Path:', event.path || event.rawPath);
    console.log(
        'Method:',
        event.httpMethod || event.requestContext?.http?.method,
    );

    // Don't wait for empty event loop (allows Lambda to return faster)
    context.callbackWaitsForEmptyEventLoop = false;

    try {
        // Rewrite path: Remove /api/v1/app prefix so NestJS can match routes
        // API Gateway sends: /api/v1/app/api/accounts
        // NestJS expects:    /api/accounts
        let path = event.path || event.rawPath || '';

        // Remove stage prefix if present (e.g., /prod)
        const stage = event.requestContext?.stage;
        if (stage && path.startsWith(`/${stage}`)) {
            path = path.slice(stage.length + 1);
        }

        // Remove /api/v1/app prefix (e.g., /api/v1/app/api/accounts -> /api/accounts)
        if (path.startsWith('/api/v1/app')) {
            path = path.slice('/api/v1/app'.length);
        }
        // Keep /api/v1/auth paths as-is (controller is defined with api/v1/auth prefix)
        else if (path.startsWith('/api/v1/auth')) {
            // Don't rewrite auth paths - they match the controller path directly
            console.log('Auth path - no rewriting needed');
        }
        // Remove /api/v1 prefix for routes like /api/v1/global-settings -> /api/global-settings
        else if (path.startsWith('/api/v1/')) {
            path = '/api/' + path.slice('/api/v1/'.length);
        }

        // Update the event with the rewritten path
        if (event.path) {
            event.path = path;
        }
        if (event.rawPath) {
            event.rawPath = path;
        }

        console.log('Rewritten Path:', path);

        // Bootstrap or get cached server
        const server = await bootstrapServer();

        // Proxy the request to NestJS
        return server(event, context);
    } catch (error: any) {
        console.error('❌ Lambda handler error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error?.message || 'Unknown error',
            }),
        };
    }
};
