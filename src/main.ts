import 'reflect-metadata';
import {NestFactory} from '@nestjs/core';
import {Module} from '@nestjs/common';
import {Controller, Get, Post, Put, Delete, Param, Body} from '@nestjs/common';
import dotenv from 'dotenv';
import path from 'path';
import {AccountsService} from './services/accounts';
import {EnterprisesService} from './services/enterprises';
import {BusinessUnitsService} from './services/businessUnits';
import {UsersService} from './services/users';
import {UserGroupsService} from './services/userGroups';
import {TemplatesService} from './services/templates';
import {PipelineYamlService} from './services/pipelineYaml';
import {GlobalSettingsService} from './services/globalSettings';
import {PipelineConfigService} from './services/pipelineConfig';

dotenv.config();

const STORAGE_DIR = process.env.STORAGE_DIR
    ? path.resolve(process.env.STORAGE_DIR)
    : path.join(process.cwd(), 'data');

// Providers (plain classes)
const accounts = new AccountsService(STORAGE_DIR);
const enterprises = new EnterprisesService(STORAGE_DIR);
const businessUnits = new BusinessUnitsService(STORAGE_DIR);
const users = new UsersService(STORAGE_DIR);
const userGroups = new UserGroupsService(STORAGE_DIR);
const templates = new TemplatesService(STORAGE_DIR);
const pipelineYaml = new PipelineYamlService(STORAGE_DIR);
const globalSettings = new GlobalSettingsService(STORAGE_DIR);
const pipelineConfig = new PipelineConfigService(STORAGE_DIR);

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

    // original had no GET by id

    @Post()
    async create(@Body() body: any) {
        return await accounts.create(body);
    }

    @Put()
    async update(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        const updated = await accounts.update(id, rest);
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await accounts.remove(id);
        return {};
    }
}

@Controller('api/enterprises')
class EnterprisesController {
    @Get()
    async list() {
        return await enterprises.list();
    }
    @Post()
    async create(@Body() body: any) {
        return await enterprises.create(body);
    }
    // original had no PUT by id
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await enterprises.remove(id);
        return {};
    }
}

@Controller('api/business-units')
class BusinessUnitsController {
    @Get()
    async list() {
        return await businessUnits.list();
    }
    @Post()
    async create(@Body() body: any) {
        return await businessUnits.create(body);
    }
    @Put()
    async update(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        const updated = await businessUnits.update(id, rest);
        if (!updated) return {error: 'Not found'};
        return updated;
    }
    @Delete(':id')
    async remove(@Param('id') id: string) {
        await businessUnits.remove(id);
        return {};
    }

    // original had no entities endpoint
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

@Controller('api/global-settings')
class GlobalSettingsController {
    @Get()
    async list() {
        return await globalSettings.list();
    }

    @Post()
    async create(@Body() body: any) {
        return await globalSettings.create(body);
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        return await globalSettings.get(id);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        return await globalSettings.update(id, body);
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        await globalSettings.remove(id);
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
        GlobalSettingsController,
        PipelineConfigController,
    ],
})
class AppModule {}

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {cors: true});
    const PORT = Number(process.env.PORT || 4000);
    await app.listen(PORT);
}

bootstrap();
