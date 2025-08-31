import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module} from '@nestjs/common';
import {Controller, Get, Post, Put, Delete, Param, Body, Query} from '@nestjs/common';
import dotenv from 'dotenv';
import path from 'path';
import {AccountsService} from './services/accounts';
import {EnterprisesService} from './services/enterprises';
import {BusinessUnitsService} from './services/businessUnits';
import {UsersService} from './services/users';
import {UserGroupsService} from './services/userGroups';
import {TemplatesService} from './services/templates';
import {PipelineYamlService} from './services/pipelineYaml';
import {PipelineConfigService} from './services/pipelineConfig';
import {ServicesService} from './services/services';
import {ProductsService} from './services/products';
import {EnterpriseProductsServicesService} from './services/enterpriseProductsServices';
import {testConnection} from './db';


dotenv.config();

const STORAGE_DIR = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.join(process.cwd(), 'data');

// Sample geo data
const GEO_DATA: Record<string, Record<string, string[]>> = {
    'US': {
        'CA': ['Los Angeles', 'San Francisco', 'San Diego'],
        'NY': ['New York City', 'Buffalo', 'Albany'],
        'TX': ['Houston', 'Dallas', 'Austin']
    },
    'UK': {
        'England': ['London', 'Manchester', 'Birmingham'],
        'Scotland': ['Edinburgh', 'Glasgow', 'Aberdeen'],
        'Wales': ['Cardiff', 'Swansea', 'Newport']
    }
};

// Providers (plain classes)
const accounts = new AccountsService(STORAGE_DIR);
const enterprises = new EnterprisesService(STORAGE_DIR);
const businessUnits = new BusinessUnitsService(STORAGE_DIR);
const users = new UsersService(STORAGE_DIR);
const userGroups = new UserGroupsService(STORAGE_DIR);
const templates = new TemplatesService(STORAGE_DIR);
const pipelineYaml = new PipelineYamlService(STORAGE_DIR);
const pipelineConfig = new PipelineConfigService(STORAGE_DIR);
const services = new ServicesService(STORAGE_DIR);
const products = new ProductsService(STORAGE_DIR);
const enterpriseProductsServices = new EnterpriseProductsServicesService(STORAGE_DIR);

@Controller('health')
class HealthController {
    @Get()
    get() {
        return {ok: true};
    }
}

@Controller('api/accounts')
class AccountsController {
    @Get()
    async list() {
        return await accounts.list();
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        return await accounts.get(Number(id));
    }

    @Post()
    async create(@Body() body: any) {
        return await accounts.create(body);
    }

    @Put()
    async update(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        const updated = await accounts.update(Number(id), rest);
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await accounts.remove(Number(id));
        return {};
    }
}

@Controller('api/enterprises')
class EnterprisesController {
    @Get()
    async list() {
        return await enterprises.list();
    }
    
    @Get(':id')
    async get(@Param('id') id: string) {
        return await enterprises.get(Number(id));
    }
    
    @Post()
    async create(@Body() body: any) {
        return await enterprises.create(body);
    }
    
    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        const updated = await enterprises.update(Number(id), body);
        if (!updated) return {error: 'Not found'};
        return updated;
    }
    
    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        const updated = await enterprises.update(Number(id), rest);
        if (!updated) return {error: 'Not found'};
        return updated;
    }
    
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await enterprises.remove(Number(id));
        return {};
    }
}

@Controller('api/business-units')
class BusinessUnitsController {
    @Get()
    async list() {
        return await businessUnits.list();
    }
    @Get('entities')
    async listEntities(@Query('accountId') accountId?: string, @Query('enterpriseId') enterpriseId?: string, @Query('enterpriseName') enterpriseName?: string) {
        return await businessUnits.listEntities(accountId, enterpriseId);
    }
    @Post()
    async create(@Body() body: any) {
        return await businessUnits.create(body);
    }
    @Put()
    async update(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        const updated = await businessUnits.update(Number(id), rest);
        if (!updated) return {error: 'Not found'};
        return updated;
    }
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await businessUnits.remove(Number(id));
        return {};
    }
}

@Controller('api/services')
class ServicesController {
    @Get()
    async list() {
        return await services.list();
    }
    
    @Get('debug')
    async debug() {
        return await services.debugTableContents();
    }
    
    @Get(':id')
    async get(@Param('id') id: string) {
        return await services.get(Number(id));
    }
    
    @Post()
    async create(@Body() body: any) {
        return await services.create(body);
    }
    
    @Put()
    async update(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        const updated = await services.update(Number(id), rest);
        if (!updated) return {error: 'Not found'};
        return updated;
    }
    
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await services.remove(Number(id));
        return {};
    }
}

@Controller('api/products')
class ProductsController {
    @Get()
    async list() {
        return await products.list();
    }
    
    @Get(':id')
    async get(@Param('id') id: string) {
        return await products.get(Number(id));
    }
    
    @Post()
    async create(@Body() body: any) {
        return await products.create(body);
    }
    
    @Put()
    async update(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        const updated = await products.update(Number(id), rest);
        if (!updated) return {error: 'Not found'};
        return updated;
    }
    
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await products.remove(Number(id));
        return {};
    }
}

@Controller('api/users')
class UsersController {
    @Get()
    async list() {
        return await users.list();
    }
    @Post()
    async create(@Body() body: any) {
        return await users.create(body);
    }
    @Put()
    async update(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        const updated = await users.update(id, rest);
        if (!updated) return {error: 'Not found'};
        return updated;
    }
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await users.remove(id);
        return {};
    }
}

@Controller('api/user-groups')
class UserGroupsController {
    @Get(':username')
    async list(@Param('username') username: string) {
        return await userGroups.list(username);
    }
    @Post(':username')
    async create(@Param('username') username: string, @Body() body: any) {
        return await userGroups.create(username, body);
    }
    @Delete(':username/:id')
    async remove(@Param('id') id: string) {
        await userGroups.remove(id);
        return {};
    }
}

@Controller('api/ai')
class AiController {
    @Get('insights')
    insights() {
        return [
            {
                title: 'Flaky test suite detection',
                body: 'AI detected instability in “Checkout E2E”. Retries rose by 24% this week. Consider quarantining the suite and enabling test impact analysis.',
                severity: 'warning',
            },
            {
                title: 'Pipeline optimization',
                body: 'Cache hit rate for Docker layers improved to 78%. Enabling layer pinning could reduce build time by another 10-15%.',
                severity: 'info',
            },
            {
                title: 'Deployment reliability',
                body: 'Blue/green deployments reached 99.2% success. Canary window extension by 5 minutes could cut rollbacks by ~8%.',
                severity: 'success',
            },
        ];
    }

    @Get('trends/builds')
    builds() {
        return [
            {label: 'Mon', value: 12},
            {label: 'Tue', value: 17},
            {label: 'Wed', value: 9},
            {label: 'Thu', value: 21},
            {label: 'Fri', value: 14},
            {label: 'Sat', value: 8},
            {label: 'Sun', value: 11},
        ];
    }
}

// removed products/services catalog and geo endpoints to original

@Controller('api/geo')
class GeoController {
    @Get('countries')
    countries() {
        return Object.keys(GEO_DATA);
    }

    @Get('states')
    states(@Query('country') country?: string) {
        if (!country) return [] as string[];
        return Object.keys(GEO_DATA[country] || {});
    }

    @Get('cities')
    cities(@Query('country') country?: string, @Query('state') state?: string) {
        if (!country || !state) return [] as string[];
        return (GEO_DATA[country]?.[state] || []) as string[];
    }
}

@Controller('api/templates')
class TemplatesController {
    @Get()
    async list() {
        return await templates.list();
    }

    @Post()
    async create(@Body() body: any) {
        return await templates.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        const updated = await templates.update(id, body);
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await templates.remove(id);
        return {};
    }
}

@Controller('api/pipeline-yaml')
class PipelineYamlController {
    @Get(':templateId')
    async get(@Param('templateId') templateId: string) {
        const yaml = await pipelineYaml.get(templateId);
        return yaml ? {templateId, yaml} : {templateId, yaml: null};
    }

    @Get()
    async getAll() {
        return await pipelineYaml.getAll();
    }

    @Post(':templateId')
    async save(@Param('templateId') templateId: string, @Body() body: any) {
        await pipelineYaml.save(templateId, body?.yaml || '');
        return {ok: true};
    }

    @Delete(':templateId')
    async remove(@Param('templateId') templateId: string) {
        await pipelineYaml.remove(templateId);
        return {};
    }
}

@Controller('api/pipeline-config')
class PipelineConfigController {
    @Get()
    async get() {
        return await pipelineConfig.get();
    }

    @Post()
    async save(@Body() body: any) {
        return await pipelineConfig.save(body || {});
    }
}

@Controller('api/enterprise-products-services')
class EnterpriseProductsServicesController {
    @Get()
    async list() {
        return await enterpriseProductsServices.list();
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        return await enterpriseProductsServices.get(parseInt(id));
    }

    @Post()
    async create(@Body() body: any) {
        return await enterpriseProductsServices.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        return await enterpriseProductsServices.update(parseInt(id), body);
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await enterpriseProductsServices.remove(parseInt(id));
        return {};
    }

    // Get all linkages for a specific enterprise
    @Get('enterprise/:enterpriseId')
    async getByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        return await enterpriseProductsServices.getByEnterprise(parseInt(enterpriseId));
    }

    // Get detailed information with names for a specific enterprise
    @Get('enterprise/:enterpriseId/detailed')
    async getDetailedByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        return await enterpriseProductsServices.getDetailedByEnterprise(parseInt(enterpriseId));
    }

    // Get all linkages for a specific product
    @Get('product/:productId')
    async getByProduct(@Param('productId') productId: string) {
        return await enterpriseProductsServices.getByProduct(parseInt(productId));
    }

    // Get all linkages for a specific service
    @Get('service/:serviceId')
    async getByService(@Param('serviceId') serviceId: string) {
        return await enterpriseProductsServices.getByService(parseInt(serviceId));
    }

    // Remove all linkages for a specific enterprise
    @Delete('enterprise/:enterpriseId')
    async removeByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        await enterpriseProductsServices.removeByEnterprise(parseInt(enterpriseId));
        return {};
    }

    // Remove all linkages for a specific product
    @Delete('product/:productId')
    async removeByProduct(@Param('productId') productId: string) {
        await enterpriseProductsServices.removeByProduct(parseInt(productId));
        return {};
    }

    // Remove all linkages for a specific service
    @Delete('service/:serviceId')
    async removeByService(@Param('serviceId') serviceId: string) {
        await enterpriseProductsServices.removeByService(parseInt(serviceId));
        return {};
    }

    // Debug endpoint to check table contents
    @Get('debug/contents')
    async debugContents() {
        return await enterpriseProductsServices.debugTableContents();
    }

    // Debug endpoint to check table structure
    @Get('debug/structure')
    async debugStructure() {
        return await enterpriseProductsServices.checkTableStructure();
    }
}

@Module({
    controllers: [
        HealthController,
        AccountsController,
        EnterprisesController,
        BusinessUnitsController,
        UsersController,
        UserGroupsController,
        AiController,
        TemplatesController,
        PipelineYamlController,
        PipelineConfigController,
        ServicesController,
        ProductsController,
        EnterpriseProductsServicesController,
    ],
})
class AppModule {}

async function bootstrap() {
    try {
        console.log('Starting DevOps Automate Backend...');
        console.log('Environment:', process.env.NODE_ENV || 'development');
        console.log('Storage Mode:', process.env.STORAGE_MODE || 'postgres');
        
        // Force reload environment variables
        dotenv.config();
        const storageMode = process.env.STORAGE_MODE || 'postgres';
        console.log('Reloaded Storage Mode:', storageMode);
        
        if (storageMode === 'postgres') {
            console.log('Testing PostgreSQL connection...');
            const dbConnected = await testConnection();
            if (!dbConnected) {
                console.error('Failed to connect to PostgreSQL. Please check your database configuration.');
                process.exit(1);
            }
            console.log('PostgreSQL connection successful!');
        }
        
        const app = await NestFactory.create(AppModule, {cors: true});
        const PORT = Number(process.env.PORT || 4000);
        await app.listen(PORT);
        
        console.log(`🚀 DevOps Automate Backend is running on port ${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/health`);
        console.log(`🔧 API endpoints: http://localhost:${PORT}/api`);
        
    } catch (error) {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
}

bootstrap();
