import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module} from '@nestjs/common';
import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Param,
    Body,
    Query,
    Res,
    HttpStatus,
    Patch,
} from '@nestjs/common';
import dotenv from 'dotenv';
import path from 'path';
import {AccountsService} from './services/accounts';
import {EnterprisesService} from './services/enterprises';
import {BusinessUnitsService} from './services/businessUnits';
import {UsersService} from './services/users';
import {UserGroupsService} from './services/userGroups';
import {GroupsService} from './services/groups';
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
    US: {
        CA: ['Los Angeles', 'San Francisco', 'San Diego'],
        NY: ['New York City', 'Buffalo', 'Albany'],
        TX: ['Houston', 'Dallas', 'Austin'],
    },
    UK: {
        England: ['London', 'Manchester', 'Birmingham'],
        Scotland: ['Edinburgh', 'Glasgow', 'Aberdeen'],
        Wales: ['Cardiff', 'Swansea', 'Newport'],
    },
};

// Providers (plain classes)
const accounts = new AccountsService(STORAGE_DIR);
const enterprises = new EnterprisesService(STORAGE_DIR);
const businessUnits = new BusinessUnitsService(STORAGE_DIR);
const users = new UsersService(STORAGE_DIR);
const userGroups = new UserGroupsService(STORAGE_DIR);
const groups = new GroupsService(STORAGE_DIR);
const templates = new TemplatesService(STORAGE_DIR);
const pipelineYaml = new PipelineYamlService(STORAGE_DIR);
const pipelineConfig = new PipelineConfigService(STORAGE_DIR);
const services = new ServicesService(STORAGE_DIR);
const products = new ProductsService(STORAGE_DIR);
const enterpriseProductsServices = new EnterpriseProductsServicesService(
    STORAGE_DIR,
);

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
    async listEntities(
        @Query('accountId') accountId?: string,
        @Query('enterpriseId') enterpriseId?: string,
        @Query('enterpriseName') enterpriseName?: string,
    ) {
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
    async create(@Body() body: any, @Res() res: any) {
        const existing = users.getByEmail(body?.email);
        if (existing) {
            return res
                .status(HttpStatus.CONFLICT)
                .json({error: 'email already exists'});
        }
        const created = await users.create(body);
        return res.status(HttpStatus.CREATED).json(created);
    }
    @Put()
    async update(@Body() body: any, @Res() res: any) {
        const {id, ...rest} = body || {};
        if (!id)
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: 'id required'});
        const exists = users.getById(id);
        if (!exists)
            return res.status(HttpStatus.NOT_FOUND).json({error: 'Not found'});
        const updated = await users.update(id, rest);
        return res.status(HttpStatus.OK).json(updated);
    }
    @Delete(':id')
    async remove(@Param('id') id: string, @Res() res: any) {
        const exists = users.getById(id);
        if (!exists)
            return res.status(HttpStatus.NOT_FOUND).json({error: 'Not found'});
        await users.remove(id);
        return res.status(HttpStatus.NO_CONTENT).send();
    }

    // Optional granular endpoints
    @Patch(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        const exists = users.getById(id);
        if (!exists)
            return res.status(HttpStatus.NOT_FOUND).json({error: 'Not found'});
        if (!['ACTIVE', 'INACTIVE'].includes(body?.status)) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: 'invalid status'});
        }
        const updated = users.partialUpdate(id, {status: body.status});
        return res.status(HttpStatus.OK).json(updated);
    }

    @Patch(':id/lock')
    async updateLock(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        const exists = users.getById(id);
        if (!exists)
            return res.status(HttpStatus.NOT_FOUND).json({error: 'Not found'});
        if (typeof body?.locked !== 'boolean') {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: 'invalid locked flag'});
        }
        const updated = users.partialUpdate(id, {locked: body.locked});
        return res.status(HttpStatus.OK).json(updated);
    }

    @Post(':id/password')
    async updatePassword(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        const exists = users.getById(id);
        if (!exists)
            return res.status(HttpStatus.NOT_FOUND).json({error: 'Not found'});
        const pwd: string = body?.password || '';
        const valid =
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(pwd);
        if (!valid)
            return res.status(HttpStatus.BAD_REQUEST).json({
                error: 'password does not meet complexity requirements',
            });
        // No-op store for filesystem mode
        return res.status(HttpStatus.NO_CONTENT).send();
    }

    // Group assignment endpoints
    @Post(':id/groups')
    async assignGroup(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        const user = users.getById(id);
        if (!user)
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'User not found'});
        const group = groups.get(body?.groupId);
        if (!group)
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'Group not found'});
        await userGroups.create(user.username, {
            id: group.id,
            name: group.name,
            description: group.description,
        });
        return res.status(HttpStatus.NO_CONTENT).send();
    }

    @Delete(':id/groups/:groupId')
    async unassignGroup(
        @Param('id') id: string,
        @Param('groupId') groupId: string,
        @Res() res: any,
    ) {
        const user = users.getById(id);
        if (!user)
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'User not found'});
        await userGroups.removeForUser(user.username, groupId);
        return res.status(HttpStatus.NO_CONTENT).send();
    }
}

@Controller('api/user-groups')
class UserGroupsController {
    @Get(':username')
    async list(@Param('username') username: string) {
        return await userGroups.list(username);
    }
    @Post(':username')
    async create(
        @Param('username') username: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        // ensure group exists (create-and-assign)
        let grp = groups.findByName(body?.name);
        if (!grp) {
            grp = groups.create({
                name: body?.name,
                description: body?.description,
            });
        }
        const record = await userGroups.create(username, {
            id: grp.id,
            name: grp.name,
            description: grp.description,
            enterprise: body?.enterprise,
        });
        const resp = {
            id: record.id,
            name: record.name,
            description: record.description,
        };
        return res.status(HttpStatus.CREATED).json(resp);
    }
    @Delete(':username/:id')
    async remove(@Param('id') id: string, @Res() res: any) {
        await userGroups.remove(id);
        return res.status(HttpStatus.NO_CONTENT).send();
    }
}

@Controller('api/groups')
class GroupsController {
    @Get()
    async list(@Query('search') search?: string) {
        return groups.list(search);
    }

    @Post()
    async create(@Body() body: any, @Res() res: any) {
        const created = groups.create({
            name: body?.name,
            description: body?.description,
        });
        return res.status(HttpStatus.CREATED).json(created);
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
        return await enterpriseProductsServices.getByEnterprise(
            parseInt(enterpriseId),
        );
    }

    // Get detailed information with names for a specific enterprise
    @Get('enterprise/:enterpriseId/detailed')
    async getDetailedByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        return await enterpriseProductsServices.getDetailedByEnterprise(
            parseInt(enterpriseId),
        );
    }

    // Get all linkages for a specific product
    @Get('product/:productId')
    async getByProduct(@Param('productId') productId: string) {
        return await enterpriseProductsServices.getByProduct(
            parseInt(productId),
        );
    }

    // Get all linkages for a specific service
    @Get('service/:serviceId')
    async getByService(@Param('serviceId') serviceId: string) {
        return await enterpriseProductsServices.getByService(
            parseInt(serviceId),
        );
    }

    // Remove all linkages for a specific enterprise
    @Delete('enterprise/:enterpriseId')
    async removeByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        await enterpriseProductsServices.removeByEnterprise(
            parseInt(enterpriseId),
        );
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
        GroupsController,
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
                console.error(
                    'Failed to connect to PostgreSQL. Please check your database configuration.',
                );
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
