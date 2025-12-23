/**
 * AWS Lambda Handler for NestJS Application
 *
 * This file provides the Lambda handler function that wraps the NestJS application
 * for serverless deployment on AWS Lambda behind API Gateway.
 */

import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {ExpressAdapter} from '@nestjs/platform-express';
import serverlessExpress from '@vendia/serverless-express';
import express, {Express} from 'express';
import {AppModule} from './main';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Cache the serverless express instance for warm starts
let cachedServer: any;

/**
 * Bootstrap the NestJS application for Lambda
 */
async function bootstrap(): Promise<any> {
    console.log('🚀 Bootstrapping NestJS app for Lambda...');
    console.log('📊 Environment:', {
        NODE_ENV: process.env.NODE_ENV || 'not set',
        WORKSPACE: process.env.WORKSPACE || 'not set',
        STORAGE_MODE: process.env.STORAGE_MODE || 'dynamodb',
        DYNAMODB_SYSTIVA_TABLE: process.env.DYNAMODB_SYSTIVA_TABLE || 'not set',
        ACCOUNT_REGISTRY_TABLE_NAME: process.env.ACCOUNT_REGISTRY_TABLE_NAME || 'not set',
    });

    const expressApp: Express = express();

    // Create NestJS app with Express adapter
    const adapter = new ExpressAdapter(expressApp);
    const app = await NestFactory.create(AppModule, adapter, {
        logger: ['error', 'warn', 'log'],
    });

    // Configure CORS
    const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',')
        : ['*'];

    app.enableCors({
        origin: (origin, callback) => {
            // Allow requests with no origin (like Lambda invocations)
            if (!origin) return callback(null, true);

            // Allow all origins in development/staging
            if (allowedOrigins.includes('*')) return callback(null, true);

            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.warn(`CORS blocked origin: ${origin}`);
                callback(null, true); // Allow anyway for API Gateway
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    });

    // Initialize the app
    await app.init();

    console.log('✅ NestJS app initialized for Lambda');

    // Create serverless express handler
    return serverlessExpress({app: expressApp});
}

/**
 * Lambda Handler
 *
 * This is the entry point for AWS Lambda. It creates or reuses
 * the NestJS application instance and handles the incoming request.
 */
export const handler = async (event: any, context: any): Promise<any> => {
    console.log('📨 Lambda invoked:', {
        path: event.path || event.rawPath,
        method: event.httpMethod || event.requestContext?.http?.method,
        resource: event.resource,
    });

    try {
        // Reuse cached server for warm starts
        if (!cachedServer) {
            console.log('🔄 Cold start - initializing server...');
            cachedServer = await bootstrap();
        } else {
            console.log('♻️ Warm start - reusing cached server');
        }

        // Handle the request
        const response = await cachedServer(event, context);
        console.log('✅ Response status:', response.statusCode);
        return response;
    } catch (error: any) {
        console.error('❌ Lambda handler error:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            },
            body: JSON.stringify({
                error: 'Internal Server Error',
                message: error?.message || 'Unknown error',
                timestamp: new Date().toISOString(),
            }),
        };
    }
};

// For local testing
if (process.env.LOCAL_DEVELOPMENT === 'true') {
    const port = process.env.PORT || 4000;
    bootstrap().then(() => {
        console.log(`🚀 Local development server would run on port ${port}`);
    });
}
