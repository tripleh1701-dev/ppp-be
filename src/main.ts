import 'reflect-metadata';
import * as dotenv from 'dotenv';
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

import path from 'path';
import {AccountsService} from './services/accounts';
import {EnterprisesService} from './services/enterprises';
import {EnterprisesDynamoDBService} from './services/enterprises-dynamodb';
import {BusinessUnitsService} from './services/businessUnits';
import {UsersService} from './services/users';
import {UserGroupsService} from './services/userGroups';
import {GroupsService} from './services/groups';
import {TemplatesService, templatesService} from './services/templates';
import {PipelineYamlService} from './services/pipelineYaml';
import {PipelineConfigService} from './services/pipelineConfig';
import {ServicesService} from './services/services';
import {ServicesDynamoDBService} from './services/services-dynamodb';
import {ProductsService} from './services/products';
import {ProductsDynamoDBService} from './services/products-dynamodb';
import {EnterpriseProductsServicesService} from './services/enterpriseProductsServices';
import {EnterpriseProductsServicesDynamoDBService} from './services/enterpriseProductsServices-dynamodb';
import {RolesService} from './services/roles';
import {AttributesService} from './services/attributes';
import {AccessControl_DynamoDBService} from './services/AccessControl_DynamoDB';
import {testConnection, withPg} from './db';
import {testDynamoDBConnection, getStorageMode} from './dynamodb';

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

// Global service variables - will be initialized in bootstrap after env vars are loaded
let storageMode: string;
let enterprises: any;

const businessUnits = new BusinessUnitsService(STORAGE_DIR);
const templates = new TemplatesService(STORAGE_DIR);
const pipelineYaml = new PipelineYamlService(STORAGE_DIR);
const pipelineConfig = new PipelineConfigService(STORAGE_DIR);
// Global service variables - will be initialized in bootstrap after env vars are loaded
let services: any;
let products: any;
let enterpriseProductsServices: any;
let AccessControl_Service: AccessControl_DynamoDBService;
// Legacy services (will be replaced by AccessControl_Service)
const users = new UsersService();
const userGroups = new UserGroupsService(STORAGE_DIR);
const groups = new GroupsService(STORAGE_DIR);
const roles = new RolesService(STORAGE_DIR);
const attributes = new AttributesService(STORAGE_DIR);

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
        if (storageMode === 'dynamodb') {
            return await enterprises.get(id); // String ID for DynamoDB
        } else {
            return await enterprises.get(Number(id)); // Number ID for PostgreSQL
        }
    }

    @Post()
    async create(@Body() body: any) {
        return await enterprises.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await enterprises.update(id, body); // String ID for DynamoDB
        } else {
            updated = await enterprises.update(Number(id), body); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await enterprises.update(id, rest); // String ID for DynamoDB
        } else {
            updated = await enterprises.update(Number(id), rest); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await enterprises.remove(id); // String ID for DynamoDB
        } else {
            await enterprises.remove(Number(id)); // Number ID for PostgreSQL
        }
        return {};
    }

    @Get('debug/dynamodb')
    async debugDynamoDB() {
        if (storageMode !== 'dynamodb') {
            return {error: 'DynamoDB not enabled', storageMode};
        }

        try {
            const enterpriseService = enterprises as EnterprisesDynamoDBService;
            return await enterpriseService.debugTableContents();
        } catch (error) {
            return {
                error: error instanceof Error ? error.message : 'Unknown error',
                storageMode,
            };
        }
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
        const entities = await businessUnits.listEntities(
            accountId,
            enterpriseId,
        );
        // Transform to match expected format
        return entities.map((entity) => ({
            id: entity,
            name: entity,
            description: `${entity} entity`,
        }));
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
        if (storageMode === 'dynamodb') {
            return await services.get(id); // String ID for DynamoDB
        } else {
            return await services.get(Number(id)); // Number ID for PostgreSQL
        }
    }

    @Post()
    async create(@Body() body: any) {
        return await services.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await services.update(id, body); // String ID for DynamoDB
        } else {
            updated = await services.update(Number(id), body); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await services.update(id, rest); // String ID for DynamoDB
        } else {
            updated = await services.update(Number(id), rest); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await services.remove(id); // String ID for DynamoDB
        } else {
            await services.remove(Number(id)); // Number ID for PostgreSQL
        }
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
        if (storageMode === 'dynamodb') {
            return await products.get(id); // String ID for DynamoDB
        } else {
            return await products.get(Number(id)); // Number ID for PostgreSQL
        }
    }

    @Post()
    async create(@Body() body: any) {
        return await products.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any) {
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await products.update(id, body); // String ID for DynamoDB
        } else {
            updated = await products.update(Number(id), body); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Put()
    async updateWithIdInBody(@Body() body: any) {
        const {id, ...rest} = body || {};
        if (!id) return {error: 'id required'};
        let updated;
        if (storageMode === 'dynamodb') {
            updated = await products.update(id, rest); // String ID for DynamoDB
        } else {
            updated = await products.update(Number(id), rest); // Number ID for PostgreSQL
        }
        if (!updated) return {error: 'Not found'};
        return updated;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await products.remove(id); // String ID for DynamoDB
        } else {
            await products.remove(Number(id)); // Number ID for PostgreSQL
        }
        return {};
    }
}

@Controller('api/users')
class UsersController {
    @Get()
    async list() {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                // Use AccessControl DynamoDB service
                const result = await AccessControl_Service.listUsers({
                    limit: 1000,
                });

                // Fetch assigned groups for each user
                const usersWithGroups = await Promise.all(
                    result.users.map(async (user) => {
                        try {
                            const assignedGroups =
                                await AccessControl_Service.getUserGroups(
                                    user.id,
                                );
                            return {
                                ...user,
                                assignedUserGroups: assignedGroups,
                            };
                        } catch (error) {
                            console.error(
                                `❌ Failed to get groups for user ${user.id}:`,
                                error,
                            );
                            return {
                                ...user,
                                assignedUserGroups: [],
                            };
                        }
                    }),
                );

                return usersWithGroups;
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                const result = await users.listUsers({limit: 1000});
                return result.users;
            } else {
                // Filesystem mode - return empty array for now
                console.log('📁 Filesystem mode: returning empty users array');
                return [];
            }
        } catch (error) {
            console.error('Error in list endpoint:', error);
            throw error;
        }
    }
    @Post()
    async create(@Body() body: any, @Res() res: any) {
        try {
            // Check both email and emailAddress fields for compatibility
            const emailToCheck = body?.emailAddress || body?.email;

            // Debug: Backend received request
            console.log('🔍 Backend received user creation request:', {
                technicalUser: body.technicalUser,
                emailAddress: emailToCheck,
            });

            if (storageMode === 'dynamodb' && AccessControl_Service) {
                // Use AccessControl DynamoDB service
                const userPayload = {
                    firstName: body.firstName,
                    middleName: body.middleName,
                    lastName: body.lastName,
                    emailAddress: emailToCheck,
                    password: body.password,
                    status: (body.status === 'Active'
                        ? 'ACTIVE'
                        : 'INACTIVE') as 'ACTIVE' | 'INACTIVE',
                    startDate:
                        body.startDate ||
                        new Date().toISOString().split('T')[0],
                    endDate: body.endDate,
                    technicalUser:
                        body.technicalUser === true ||
                        body.technicalUser === 'true',
                };

                // Debug: Sending to DynamoDB
                console.log(
                    '🔍 Saving user to DynamoDB with technicalUser:',
                    userPayload.technicalUser,
                );

                const created = await AccessControl_Service.createUser(
                    userPayload,
                );

                // Handle user group assignments if provided
                if (
                    body.assignedUserGroups &&
                    Array.isArray(body.assignedUserGroups)
                ) {
                    console.log(
                        '🔗 Assigning user to groups:',
                        body.assignedUserGroups,
                    );

                    for (const group of body.assignedUserGroups) {
                        try {
                            const groupId = group.id || group;
                            if (groupId) {
                                await AccessControl_Service.assignUserToGroup(
                                    created.id,
                                    groupId,
                                );
                                console.log(
                                    `✅ Assigned user ${created.id} to group ${groupId}`,
                                );
                            }
                        } catch (error) {
                            console.error(
                                `❌ Failed to assign user to group:`,
                                error,
                            );
                        }
                    }
                }

                return res.status(HttpStatus.CREATED).json(created);
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                if (emailToCheck) {
                    const emailAvailable = await users.isEmailAvailable(
                        emailToCheck,
                    );
                    if (!emailAvailable) {
                        return res
                            .status(HttpStatus.CONFLICT)
                            .json({error: 'Email address already exists'});
                    }
                }

                const created = await users.createUser({
                    firstName: body.firstName,
                    middleName: body.middleName,
                    lastName: body.lastName,
                    emailAddress: emailToCheck,
                    password: body.password,
                    status: body.status || 'Active',
                    startDate:
                        body.startDate ||
                        new Date().toISOString().split('T')[0],
                    endDate: body.endDate,
                    technicalUser: body.technicalUser || false,
                    assignedUserGroups: body.assignedUserGroups || [],
                });

                // Remove password from response
                const {password, ...userResponse} = created;
                return res.status(HttpStatus.CREATED).json(userResponse);
            } else {
                // Filesystem mode - create a mock user for testing
                console.log('📁 Filesystem mode: creating mock user');
                const mockUser = {
                    id: `user-${Date.now()}`,
                    firstName: body.firstName,
                    middleName: body.middleName,
                    lastName: body.lastName,
                    emailAddress: emailToCheck,
                    status: body.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
                    startDate:
                        body.startDate ||
                        new Date().toISOString().split('T')[0],
                    endDate: body.endDate,
                    technicalUser: body.technicalUser || false,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                return res.status(HttpStatus.CREATED).json(mockUser);
            }
        } catch (error: any) {
            console.error('Error creating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to create user',
                details: error.message,
            });
        }
    }

    // Standard REST API endpoints
    @Get(':id')
    async getById(@Param('id') id: string, @Res() res: any) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    error: 'User not found',
                });
            }

            // Remove password from response
            const {password, ...userResponse} = user;
            return res.status(HttpStatus.OK).json(userResponse);
        } catch (error: any) {
            console.error('Error fetching user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to fetch user',
                details: error.message,
            });
        }
    }
    @Put(':id')
    async updateById(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                // Use AccessControl DynamoDB service
                const updatedUser = await AccessControl_Service.updateUser(id, {
                    firstName: body.firstName,
                    middleName: body.middleName,
                    lastName: body.lastName,
                    emailAddress: body.emailAddress,
                    status: body.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
                    startDate: body.startDate,
                    endDate: body.endDate,
                    technicalUser: body.technicalUser || false,
                });

                if (!updatedUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                // Handle user group assignments if provided
                if (
                    body.assignedUserGroups &&
                    Array.isArray(body.assignedUserGroups)
                ) {
                    console.log(
                        '🔗 Updating user group assignments:',
                        body.assignedUserGroups,
                    );

                    // First, remove all existing group assignments for this user
                    try {
                        const existingGroups =
                            await AccessControl_Service.getUserGroups(id);
                        for (const group of existingGroups) {
                            await AccessControl_Service.removeUserFromGroup(
                                id,
                                group.id,
                            );
                        }
                    } catch (error) {
                        console.error(
                            '❌ Failed to remove existing group assignments:',
                            error,
                        );
                    }

                    // Then, add the new group assignments
                    for (const group of body.assignedUserGroups) {
                        try {
                            const groupId = group.id || group;
                            if (groupId) {
                                await AccessControl_Service.assignUserToGroup(
                                    id,
                                    groupId,
                                );
                                console.log(
                                    `✅ Assigned user ${id} to group ${groupId}`,
                                );
                            }
                        } catch (error) {
                            console.error(
                                `❌ Failed to assign user to group:`,
                                error,
                            );
                        }
                    }
                }

                return res.status(HttpStatus.OK).json(updatedUser);
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                const existingUser = await users.getById(id);
                if (!existingUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                // Check email uniqueness if email is being updated
                if (
                    body.emailAddress &&
                    body.emailAddress !== existingUser.emailAddress
                ) {
                    const emailAvailable = await users.isEmailAvailable(
                        body.emailAddress,
                        id,
                    );
                    if (!emailAvailable) {
                        return res.status(HttpStatus.CONFLICT).json({
                            error: 'Email address already exists',
                        });
                    }
                }

                // Use the enhanced updateUser method
                const updatedUser = await users.updateUser(id, body);
                if (!updatedUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                // Remove password from response
                const {password, ...userResponse} = updatedUser;
                return res.status(HttpStatus.OK).json(userResponse);
            } else {
                // Filesystem mode - mock update for testing
                console.log(`📁 Filesystem mode: mock updating user ${id}`);
                const mockUser = {
                    id: id,
                    firstName: body.firstName,
                    middleName: body.middleName,
                    lastName: body.lastName,
                    emailAddress: body.emailAddress,
                    status: body.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
                    startDate: body.startDate,
                    endDate: body.endDate,
                    technicalUser: body.technicalUser || false,
                    updatedAt: new Date().toISOString(),
                };
                return res.status(HttpStatus.OK).json(mockUser);
            }
        } catch (error: any) {
            console.error('Error updating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to update user',
                details: error.message,
            });
        }
    }

    @Patch(':id')
    async partialUpdateById(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                // Use AccessControl DynamoDB service for partial updates
                const updatedUser = await AccessControl_Service.updateUser(id, {
                    ...(body.firstName && {firstName: body.firstName}),
                    ...(body.middleName && {middleName: body.middleName}),
                    ...(body.lastName && {lastName: body.lastName}),
                    ...(body.emailAddress && {emailAddress: body.emailAddress}),
                    ...(body.status && {
                        status:
                            body.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
                    }),
                    ...(body.startDate && {startDate: body.startDate}),
                    ...(body.endDate && {endDate: body.endDate}),
                    ...(body.technicalUser !== undefined && {
                        technicalUser: body.technicalUser,
                    }),
                });

                if (!updatedUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                return res.status(HttpStatus.OK).json(updatedUser);
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                const existingUser = await users.getById(id);
                if (!existingUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                // Check email uniqueness if email is being updated
                if (
                    body.emailAddress &&
                    body.emailAddress !== existingUser.emailAddress
                ) {
                    const emailAvailable = await users.isEmailAvailable(
                        body.emailAddress,
                        id,
                    );
                    if (!emailAvailable) {
                        return res.status(HttpStatus.CONFLICT).json({
                            error: 'Email address already exists',
                        });
                    }
                }

                // Use the enhanced updateUser method for partial updates too
                const updatedUser = await users.updateUser(id, body);
                if (!updatedUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'User not found',
                    });
                }

                // Remove password from response
                const {password, ...userResponse} = updatedUser;
                return res.status(HttpStatus.OK).json(userResponse);
            } else {
                // Filesystem mode - mock partial update for testing
                console.log(
                    `📁 Filesystem mode: mock partial updating user ${id}`,
                );
                const mockUser = {
                    id: id,
                    ...(body.firstName && {firstName: body.firstName}),
                    ...(body.middleName && {middleName: body.middleName}),
                    ...(body.lastName && {lastName: body.lastName}),
                    ...(body.emailAddress && {emailAddress: body.emailAddress}),
                    ...(body.status && {
                        status:
                            body.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
                    }),
                    ...(body.startDate && {startDate: body.startDate}),
                    ...(body.endDate && {endDate: body.endDate}),
                    ...(body.technicalUser !== undefined && {
                        technicalUser: body.technicalUser,
                    }),
                    updatedAt: new Date().toISOString(),
                };
                return res.status(HttpStatus.OK).json(mockUser);
            }
        } catch (error: any) {
            console.error('Error updating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to update user',
                details: error.message,
            });
        }
    }

    // Legacy PUT endpoint (keeping for backward compatibility)
    @Put('legacy')
    async updateLegacy(@Body() body: any, @Res() res: any) {
        const {id, ...rest} = body || {};
        if (!id)
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: 'id required'});
        const exists = users.getById(id);
        if (!exists)
            return res.status(HttpStatus.NOT_FOUND).json({error: 'Not found'});
        const updated = await users.updateUser(id, rest);
        return res.status(HttpStatus.OK).json(updated);
    }
    // Cleanup endpoint to remove incomplete users
    @Delete('cleanup/incomplete')
    async cleanupIncompleteUsers(@Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                // Get all users
                const result = await AccessControl_Service.listUsers({
                    limit: 1000,
                });
                const incompleteUsers = result.users.filter(
                    (user) =>
                        !user.firstName ||
                        !user.lastName ||
                        !user.emailAddress ||
                        user.firstName.trim() === '' ||
                        user.lastName.trim() === '' ||
                        user.emailAddress.trim() === '',
                );

                console.log(
                    `🧹 Found ${incompleteUsers.length} incomplete users to cleanup`,
                );

                // Delete incomplete users
                for (const user of incompleteUsers) {
                    await AccessControl_Service.deleteUser(user.id);
                    console.log(`🗑️ Deleted incomplete user: ${user.id}`);
                }

                return res.status(HttpStatus.OK).json({
                    success: true,
                    deletedCount: incompleteUsers.length,
                    message: `Cleaned up ${incompleteUsers.length} incomplete users`,
                });
            } else {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    error: 'Cleanup only available in DynamoDB mode',
                });
            }
        } catch (error: any) {
            console.error('Error cleaning up incomplete users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to cleanup incomplete users',
                details: error.message,
            });
        }
    }

    @Delete(':id')
    async remove(@Param('id') id: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                // Use AccessControl DynamoDB service
                await AccessControl_Service.deleteUser(id);
                return res.status(HttpStatus.NO_CONTENT).send();
            } else if (storageMode === 'postgres') {
                // Use legacy PostgreSQL service
                const exists = await users.getById(id);
                if (!exists) {
                    return res
                        .status(HttpStatus.NOT_FOUND)
                        .json({error: 'User not found'});
                }

                const deleted = await users.deleteUser(id);
                if (!deleted) {
                    return res
                        .status(HttpStatus.NOT_FOUND)
                        .json({error: 'User not found'});
                }

                return res.status(HttpStatus.NO_CONTENT).send();
            } else {
                // Filesystem mode - mock deletion
                console.log(`📁 Filesystem mode: mock deleting user ${id}`);
                return res.status(HttpStatus.NO_CONTENT).send();
            }
        } catch (error: any) {
            console.error('Error deleting user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to delete user',
                details: error.message,
            });
        }
    }

    // Optional granular endpoints
    @Patch(':id/status')
    async updateStatus(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const exists = await users.getById(id);
            if (!exists)
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User not found'});

            // Accept both uppercase and title case
            const normalizedStatus = body?.status?.toUpperCase();
            if (!['ACTIVE', 'INACTIVE'].includes(normalizedStatus)) {
                return res
                    .status(HttpStatus.BAD_REQUEST)
                    .json({error: 'Status must be ACTIVE or INACTIVE'});
            }

            const updated = await users.updateUser(id, {
                status: normalizedStatus,
            });
            if (!updated) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User not found'});
            }

            // Remove password from response
            const {password, ...userResponse} = updated;
            return res.status(HttpStatus.OK).json(userResponse);
        } catch (error: any) {
            console.error('Error updating user status:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to update user status',
                details: error.message,
            });
        }
    }

    @Patch(':id/lock')
    async updateLock(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const exists = await users.getById(id);
            if (!exists)
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User not found'});

            if (typeof body?.locked !== 'boolean') {
                return res
                    .status(HttpStatus.BAD_REQUEST)
                    .json({error: 'locked must be a boolean value'});
            }

            // Note: This is a legacy field - modern implementations might not use this
            // Since 'locked' is not in our current schema, we'll just return success for compatibility
            const user = await users.getById(id);
            if (!user) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User not found'});
            }
            const updated = user; // Return existing user since locked field doesn't exist
            return res.status(HttpStatus.OK).json(updated);
        } catch (error: any) {
            console.error('Error updating user lock status:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to update user lock status',
                details: error.message,
            });
        }
    }

    @Post(':id/password/legacy')
    async updatePasswordLegacy(
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
    @Post(':id/groups/legacy')
    async assignGroupLegacy(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        const user = await users.getById(id);
        if (!user)
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'User not found'});
        const group = groups.get(body?.groupId);
        if (!group)
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'Group not found'});
        await userGroups.create(user.emailAddress, {
            id: group.id,
            name: group.name,
            description: group.description,
        });
        return res.status(HttpStatus.NO_CONTENT).send();
    }

    @Delete(':id/groups/:groupId/legacy')
    async unassignGroupLegacy(
        @Param('id') id: string,
        @Param('groupId') groupId: string,
        @Res() res: any,
    ) {
        const user = await users.getById(id);
        if (!user)
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'User not found'});
        await userGroups.removeForUser(user.emailAddress, groupId);
        return res.status(HttpStatus.NO_CONTENT).send();
    }

    // ===============================
    // NEW COMPREHENSIVE USER MANAGEMENT APIS
    // ===============================

    // Enhanced list with pagination and filtering
    @Get('paginated')
    async listPaginated(
        @Res() res: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
        @Query('search') search?: string,
        @Query('status') status?: 'Active' | 'Inactive',
        @Query('technicalUser') technicalUser?: string,
        @Query('groupId') groupId?: string,
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        try {
            const query = {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                search,
                status: status
                    ? ((status === 'Active' ? 'ACTIVE' : 'INACTIVE') as
                          | 'ACTIVE'
                          | 'INACTIVE')
                    : undefined,
                technicalUser: technicalUser
                    ? technicalUser === 'true'
                    : undefined,
                groupId: groupId ? parseInt(groupId) : undefined,
                startDate,
                endDate,
            };

            const result = await users.listUsers(query);

            // Remove passwords from response
            const usersWithoutPasswords = result.users.map((user) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    ...result,
                    users: usersWithoutPasswords,
                },
            });
        } catch (error: any) {
            console.error('Error listing users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to list users',
            });
        }
    }

    // Enhanced create user
    @Post('enhanced')
    async createEnhanced(@Body() body: any, @Res() res: any) {
        try {
            // Validate required fields
            const requiredFields = [
                'firstName',
                'lastName',
                'emailAddress',
                'password',
                'startDate',
            ];
            for (const field of requiredFields) {
                if (!body[field]) {
                    return res.status(HttpStatus.BAD_REQUEST).json({
                        success: false,
                        error: `${field} is required`,
                    });
                }
            }

            // Check if email already exists
            const existing = await users.getByEmailAddress(body.emailAddress);
            if (existing) {
                return res.status(HttpStatus.CONFLICT).json({
                    success: false,
                    error: 'Email address already exists',
                });
            }

            // Validate password complexity
            const pwd: string = body.password || '';
            const valid =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(
                    pwd,
                );
            if (!valid) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Password does not meet complexity requirements (min 8 chars, uppercase, lowercase, number, special char)',
                });
            }

            const user = await users.createUser({
                firstName: body.firstName,
                middleName: body.middleName,
                lastName: body.lastName,
                emailAddress: body.emailAddress,
                status: body.status || 'Active',
                startDate: body.startDate,
                endDate: body.endDate,
                password: body.password,
                technicalUser: body.technicalUser || false,
                assignedUserGroups: body.assignedUserGroups || [],
            });

            // Remove password from response
            const {password, ...userResponse} = user;

            return res.status(HttpStatus.CREATED).json({
                success: true,
                message: 'User created successfully',
                data: userResponse,
            });
        } catch (error: any) {
            console.error('Error creating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to create user',
                details: error.message || error,
            });
        }
    }

    // Enhanced get by ID
    @Get('enhanced/:id')
    async getByIdEnhanced(@Param('id') id: string, @Res() res: any) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            // Remove password from response
            const {password, ...userResponse} = user;

            return res.status(HttpStatus.OK).json({
                success: true,
                data: userResponse,
            });
        } catch (error: any) {
            console.error('Error getting user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get user',
            });
        }
    }

    // Enhanced update user
    @Put('enhanced/:id')
    async updateEnhanced(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const existingUser = await users.getById(id);
            if (!existingUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            // Check email uniqueness if email is being updated
            if (
                body.emailAddress &&
                body.emailAddress !== existingUser.emailAddress
            ) {
                const emailAvailable = await users.isEmailAvailable(
                    body.emailAddress,
                    id,
                );
                if (!emailAvailable) {
                    return res.status(HttpStatus.CONFLICT).json({
                        success: false,
                        error: 'Email address already exists',
                    });
                }
            }

            const updatedUser = await users.updateUser(id, body);
            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            // Remove password from response
            const {password, ...userResponse} = updatedUser;

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User updated successfully',
                data: userResponse,
            });
        } catch (error: any) {
            console.error('Error updating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to update user',
            });
        }
    }

    // Enhanced delete user
    @Delete('enhanced/:id')
    async deleteEnhanced(@Param('id') id: string, @Res() res: any) {
        try {
            const success = await users.deleteUser(id);
            if (!success) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User deleted successfully',
            });
        } catch (error: any) {
            console.error('Error deleting user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to delete user',
            });
        }
    }

    // Password Management
    @Put(':id/password')
    async updatePasswordEnhanced(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            if (!body.currentPassword || !body.newPassword) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'currentPassword and newPassword are required',
                });
            }

            // Validate new password complexity
            const valid =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(
                    body.newPassword,
                );
            if (!valid) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'New password does not meet complexity requirements',
                });
            }

            const success = await users.updatePassword(
                id,
                body.currentPassword,
                body.newPassword,
            );
            if (!success) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Current password is incorrect',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Password updated successfully',
            });
        } catch (error: any) {
            console.error('Error updating password:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to update password',
            });
        }
    }

    @Post(':id/password/reset')
    async resetPassword(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            if (!body.newPassword) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'newPassword is required',
                });
            }

            // Validate new password complexity
            const valid =
                /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\da-zA-Z]).{8,}$/.test(
                    body.newPassword,
                );
            if (!valid) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Password does not meet complexity requirements',
                });
            }

            const success = await users.resetPassword(id, body.newPassword);
            if (!success) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Password reset successfully',
                data: {
                    temporaryPassword: body.newPassword,
                    requiresChange: true,
                },
            });
        } catch (error: any) {
            console.error('Error resetting password:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to reset password',
            });
        }
    }

    // User Status Management
    @Put(':id/status/enhanced')
    async updateStatusEnhanced(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            if (!['Active', 'Inactive'].includes(body.status)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Status must be Active or Inactive',
                });
            }

            const updatedUser = await users.updateUser(id, {
                status: body.status,
                endDate: body.endDate,
            });

            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            const {password, ...userResponse} = updatedUser;

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User status updated successfully',
                data: userResponse,
            });
        } catch (error: any) {
            console.error('Error updating user status:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to update user status',
            });
        }
    }

    @Put(':id/activate')
    async activate(@Param('id') id: string, @Res() res: any) {
        try {
            const updatedUser = await users.updateUser(id, {status: 'Active'});
            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User activated successfully',
            });
        } catch (error: any) {
            console.error('Error activating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to activate user',
            });
        }
    }

    @Put(':id/deactivate')
    async deactivate(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const updatedUser = await users.updateUser(id, {
                status: 'Inactive',
                endDate: body.endDate,
            });

            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'User deactivated successfully',
            });
        } catch (error: any) {
            console.error('Error deactivating user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to deactivate user',
            });
        }
    }

    // Technical User Management
    @Put(':id/technical-flag')
    async updateTechnicalFlag(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            if (typeof body.technicalUser !== 'boolean') {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'technicalUser must be a boolean',
                });
            }

            const updatedUser = await users.updateUser(id, {
                technicalUser: body.technicalUser,
            });

            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            const {password, ...userResponse} = updatedUser;

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Technical user flag updated successfully',
                data: {
                    technicalUser: userResponse.technicalUser,
                    updatedAt: userResponse.updatedAt,
                },
            });
        } catch (error: any) {
            console.error('Error updating technical flag:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to update technical user flag',
            });
        }
    }

    @Get('technical')
    async getTechnicalUsers(
        @Res() res: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        try {
            const query = {
                page: page ? parseInt(page) : undefined,
                limit: limit ? parseInt(limit) : undefined,
                technicalUser: true,
            };

            const result = await users.listUsers(query);

            // Remove passwords from response
            const usersWithoutPasswords = result.users.map((user) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    ...result,
                    users: usersWithoutPasswords,
                },
            });
        } catch (error: any) {
            console.error('Error getting technical users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get technical users',
            });
        }
    }

    // User Validation
    @Post('validate-email')
    async validateEmail(@Body() body: any, @Res() res: any) {
        try {
            if (!body.emailAddress) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'emailAddress is required',
                });
            }

            const available = await users.isEmailAvailable(
                body.emailAddress,
                body.excludeUserId,
            );

            return res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    available,
                    message: available
                        ? 'Email address is available'
                        : 'Email address is already taken',
                },
            });
        } catch (error: any) {
            console.error('Error validating email:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to validate email',
            });
        }
    }

    @Get('search')
    async searchUsers(
        @Res() res: any,
        @Query('q') searchQuery?: string,
        @Query('fields') fields?: string,
        @Query('exact') exact?: string,
    ) {
        try {
            if (!searchQuery) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Search query (q) is required',
                });
            }

            const result = await users.listUsers({search: searchQuery});

            // Remove passwords from response
            const usersWithoutPasswords = result.users.map((user) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                data: {
                    users: usersWithoutPasswords,
                    total: result.pagination.totalUsers,
                    query: searchQuery,
                    fields: fields
                        ? fields.split(',')
                        : ['firstName', 'lastName', 'emailAddress'],
                },
            });
        } catch (error: any) {
            console.error('Error searching users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to search users',
            });
        }
    }

    // Bulk Operations
    @Post('bulk')
    async bulkCreate(@Body() body: any, @Res() res: any) {
        try {
            if (!body.users || !Array.isArray(body.users)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'users array is required',
                });
            }

            const result = await users.bulkCreate(body.users);

            // Remove passwords from created users
            const createdWithoutPasswords = result.created.map((user: any) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                message: `${result.created.length} users created successfully`,
                data: {
                    created: createdWithoutPasswords,
                    errors: result.errors,
                },
            });
        } catch (error: any) {
            console.error('Error bulk creating users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to bulk create users',
            });
        }
    }

    @Put('bulk')
    async bulkUpdate(@Body() body: any, @Res() res: any) {
        try {
            if (!body.updates || !Array.isArray(body.updates)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'updates array is required',
                });
            }

            const result = await users.bulkUpdate(body.updates);

            // Remove passwords from updated users
            const updatedWithoutPasswords = result.updated.map((user: any) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            return res.status(HttpStatus.OK).json({
                success: true,
                message: `${result.updated.length} users updated successfully`,
                data: {
                    updated: updatedWithoutPasswords,
                    errors: result.errors,
                },
            });
        } catch (error: any) {
            console.error('Error bulk updating users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to bulk update users',
            });
        }
    }

    @Delete('bulk')
    async bulkDelete(@Body() body: any, @Res() res: any) {
        try {
            if (!body.userIds || !Array.isArray(body.userIds)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'userIds array is required',
                });
            }

            const result = await users.bulkDelete(body.userIds);

            return res.status(HttpStatus.OK).json({
                success: true,
                message: `${result.deleted.length} users deleted successfully`,
                data: {
                    deleted: result.deleted,
                    errors: result.errors,
                },
            });
        } catch (error: any) {
            console.error('Error bulk deleting users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to bulk delete users',
            });
        }
    }

    // User Group Management
    @Post(':id/groups')
    async assignGroupToUser(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            console.log(`🔗 Assigning group to user ${id}, body:`, body);

            // Check if this is a single group assignment {groupId: "..."} or bulk assignment {groupIds: [...]}
            if (body.groupId) {
                // Single group assignment (new format for individual assignments)
                if (storageMode === 'dynamodb' && AccessControl_Service) {
                    await AccessControl_Service.assignUserToGroup(
                        id,
                        body.groupId,
                    );
                    console.log(
                        `✅ Assigned user ${id} to group ${body.groupId} via DynamoDB`,
                    );

                    return res.status(HttpStatus.OK).json({
                        success: true,
                        message: 'Group assigned successfully',
                        data: {
                            userId: id,
                            groupId: body.groupId,
                        },
                    });
                } else {
                    // Fallback for non-DynamoDB modes
                    return res.status(HttpStatus.BAD_REQUEST).json({
                        success: false,
                        error: 'Single group assignment only supported in DynamoDB mode',
                    });
                }
            } else if (body.groupIds && Array.isArray(body.groupIds)) {
                // Bulk group assignment (existing format)
                const user = await users.getById(id);
                if (!user) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'User not found',
                    });
                }

                const updatedUser = await users.updateUser(id, {
                    assignedUserGroups: body.groupIds,
                });

                if (!updatedUser) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'User not found',
                    });
                }

                return res.status(HttpStatus.OK).json({
                    success: true,
                    message: 'Groups assigned successfully',
                    data: {
                        assignedGroups: body.groupIds.map((id: number) => ({
                            id,
                            name: `Group ${id}`,
                        })),
                    },
                });
            } else {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'Either groupId (string) or groupIds (array) is required',
                });
            }
        } catch (error: any) {
            console.error('Error assigning group(s) to user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to assign group(s) to user',
            });
        }
    }

    // Alternative endpoint name for frontend compatibility
    @Post(':id/assign-groups')
    async assignGroupsAlternative(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        // Delegate to the main implementation
        return this.assignGroupToUser(id, body, res);
    }

    @Delete(':id/groups')
    async removeGroupsFromUser(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const user = await users.getById(id);
            if (!user) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            if (!body.groupIds || !Array.isArray(body.groupIds)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'groupIds array is required',
                });
            }

            // Remove specified groups from user's assigned groups
            const currentGroups = user.assignedUserGroups || [];
            const updatedGroups = currentGroups.filter(
                (groupId) => !body.groupIds.includes(groupId),
            );

            const updatedUser = await users.updateUser(id, {
                assignedUserGroups: updatedGroups,
            });

            if (!updatedUser) {
                return res.status(HttpStatus.NOT_FOUND).json({
                    success: false,
                    error: 'User not found',
                });
            }

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Groups removed successfully',
            });
        } catch (error: any) {
            console.error('Error removing groups from user:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to remove groups from user',
            });
        }
    }

    @Get(':id/groups')
    async getUserGroups(@Param('id') id: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                const user = await AccessControl_Service.getUser(id);
                if (!user) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'User not found',
                    });
                }

                const groups = await AccessControl_Service.getUserGroups(id);
                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {
                        groups,
                    },
                });
            } else {
                const user = await users.getById(id);
                if (!user) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        success: false,
                        error: 'User not found',
                    });
                }

                // Mock group data - in real implementation, you'd fetch from group service
                const groups = (user.assignedUserGroups || []).map(
                    (groupId) => ({
                        id: groupId,
                        name: `Group ${groupId}`,
                        description: `Description for Group ${groupId}`,
                        assignedAt: user.createdAt,
                        assignedBy: 'system',
                    }),
                );

                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {
                        groups,
                    },
                });
            }
        } catch (error: any) {
            console.error('Error getting user groups:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get user groups',
            });
        }
    }

    @Post(':id/groups')
    async assignUserToGroup(
        @Param('id') userId: string,
        @Body() body: {groupId: string},
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                await AccessControl_Service.assignUserToGroup(
                    userId,
                    body.groupId,
                );
                return res.status(HttpStatus.CREATED).json({
                    success: true,
                    message: 'User assigned to group successfully',
                });
            } else {
                // Legacy implementation would go here
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'User-group assignment not implemented for this storage mode',
                });
            }
        } catch (error: any) {
            console.error('Error assigning user to group:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to assign user to group',
            });
        }
    }

    @Delete(':id/groups/:groupId')
    async removeUserFromGroup(
        @Param('id') userId: string,
        @Param('groupId') groupId: string,
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                await AccessControl_Service.removeUserFromGroup(
                    userId,
                    groupId,
                );
                return res.status(HttpStatus.NO_CONTENT).send();
            } else {
                // Legacy implementation would go here
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'User-group removal not implemented for this storage mode',
                });
            }
        } catch (error: any) {
            console.error('Error removing user from group:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to remove user from group',
            });
        }
    }

    // User Statistics
    @Get('stats')
    async getUserStats(@Res() res: any) {
        try {
            const stats = await users.getStats();

            return res.status(HttpStatus.OK).json({
                success: true,
                data: stats,
            });
        } catch (error: any) {
            console.error('Error getting user stats:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to get user statistics',
            });
        }
    }

    // Import/Export (Basic implementation)
    @Post('import')
    async importUsers(@Body() body: any, @Res() res: any) {
        try {
            // Basic CSV-like import simulation
            if (!body.users || !Array.isArray(body.users)) {
                return res.status(HttpStatus.BAD_REQUEST).json({
                    success: false,
                    error: 'users array is required for import',
                });
            }

            const result = await users.bulkCreate(body.users);

            return res.status(HttpStatus.OK).json({
                success: true,
                message: `Import completed: ${result.created.length} users created`,
                data: {
                    imported: result.created.length,
                    errors: result.errors.length,
                    details: {
                        created: result.created.map((u: any) => ({
                            id: u.id,
                            emailAddress: u.emailAddress,
                        })),
                        errors: result.errors,
                    },
                },
            });
        } catch (error: any) {
            console.error('Error importing users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to import users',
            });
        }
    }

    // Debug endpoint to check storage mode and database connection
    @Get('debug/info')
    async debugInfo(@Res() res: any) {
        try {
            const storageMode = process.env.STORAGE_MODE || 'filesystem';
            const schema = process.env.PGSCHEMA || 'systiva';
            const response: any = {
                storageMode,
                environment: process.env.NODE_ENV,
                schema,
                pgConfig: {
                    host: process.env.PGHOST,
                    port: process.env.PGPORT,
                    database: process.env.PGDATABASE,
                    user: process.env.PGUSER,
                },
            };

            if (storageMode === 'postgres') {
                try {
                    // Check database tables and data
                    const dbData = await withPg(async (c) => {
                        const tables = await c.query(
                            `
                            SELECT table_name
                            FROM information_schema.tables
                            WHERE table_schema = $1
                            ORDER BY table_name
                        `,
                            [schema],
                        );

                        const userTables = tables.rows.filter(
                            (row: any) =>
                                row.table_name.includes('user') ||
                                row.table_name.includes('fnd_user'),
                        );

                        const result: any = {
                            allTables: tables.rows.map(
                                (r: any) => r.table_name,
                            ),
                            userTables: userTables.map(
                                (r: any) => r.table_name,
                            ),
                            tableCounts: {},
                        };

                        // Check counts for user-related tables
                        for (const table of userTables) {
                            try {
                                const countRes = await c.query(
                                    `SELECT COUNT(*) FROM ${schema}.${table.table_name}`,
                                );
                                result.tableCounts[table.table_name] = parseInt(
                                    countRes.rows[0].count,
                                );
                            } catch (err) {
                                result.tableCounts[
                                    table.table_name
                                ] = `Error: ${
                                    err instanceof Error
                                        ? err.message
                                        : 'Unknown'
                                }`;
                            }
                        }

                        // Also check if fnd_users table exists and its structure
                        try {
                            const fndUsersStructure = await c.query(
                                `
                                SELECT column_name, data_type
                                FROM information_schema.columns
                                WHERE table_schema = $1 AND table_name = 'fnd_users'
                                ORDER BY ordinal_position
                            `,
                                [schema],
                            );
                            result.fnd_users_structure = fndUsersStructure.rows;

                            // Check constraints
                            const constraints = await c.query(
                                `
                                SELECT constraint_name, check_clause
                                FROM information_schema.check_constraints
                                WHERE constraint_schema = $1
                                AND constraint_name LIKE '%fnd_users%'
                            `,
                                [schema],
                            );
                            result.fnd_users_constraints = constraints.rows;
                        } catch (err) {
                            result.fnd_users_structure = 'Table does not exist';
                        }

                        return result;
                    });

                    response.postgresConnection = 'success';
                    response.database = dbData;

                    // Test user count with our method
                    const result = await users.listUsers({limit: 1});
                    response.apiUserCount = result.pagination.totalUsers;
                } catch (error) {
                    response.postgresConnection = 'failed';
                    response.postgresError =
                        error instanceof Error
                            ? error.message
                            : 'Unknown error';
                }
            } else {
                // No file storage - database only
                response.storageNote =
                    'Database storage only - no filesystem fallback';
            }

            return res.json(response);
        } catch (error: any) {
            return res.status(500).json({
                error: 'Debug info failed',
                message: error.message,
            });
        }
    }

    @Get('export')
    async exportUsers(
        @Res() res: any,
        @Query('format') format?: string,
        @Query('includeGroups') includeGroups?: string,
        @Query('status') status?: 'Active' | 'Inactive',
    ) {
        try {
            const query = status
                ? {
                      status: (status === 'Active' ? 'ACTIVE' : 'INACTIVE') as
                          | 'ACTIVE'
                          | 'INACTIVE',
                  }
                : {};
            const result = await users.listUsers(query);

            // Remove passwords from export
            const exportData = result.users.map((user) => {
                const {password, ...userWithoutPassword} = user;
                return userWithoutPassword;
            });

            const exportFormat = format || 'json';

            if (exportFormat === 'csv') {
                // Basic CSV generation (would need proper CSV library in real implementation)
                const headers = [
                    'id',
                    'firstName',
                    'lastName',
                    'emailAddress',
                    'status',
                    'technicalUser',
                    'createdAt',
                ];
                const csvData = [
                    headers.join(','),
                    ...exportData.map((user) =>
                        headers.map((h) => (user as any)[h] || '').join(','),
                    ),
                ].join('\n');

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader(
                    'Content-Disposition',
                    'attachment; filename=users.csv',
                );
                return res.send(csvData);
            }

            // Default JSON export
            res.setHeader('Content-Type', 'application/json');
            res.setHeader(
                'Content-Disposition',
                'attachment; filename=users.json',
            );
            return res.json({
                success: true,
                data: {
                    users: exportData,
                    exportedAt: new Date().toISOString(),
                    totalCount: result.pagination.totalUsers,
                },
            });
        } catch (error: any) {
            console.error('Error exporting users:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                success: false,
                error: 'Failed to export users',
            });
        }
    }
}

@Controller('api/user-groups')
class UserGroupsController {
    // Legacy endpoints for backward compatibility
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

    // Debug endpoint to check table structure
    @Get('debug/structure')
    async debugTableStructure() {
        return await userGroups.debugTableStructure();
    }

    // New Access Control User Groups Management APIs
    @Get()
    async listUserGroups(
        @Query('accountId') accountId?: string,
        @Query('enterpriseId') enterpriseId?: string,
    ) {
        return await userGroups.listUserGroups(accountId, enterpriseId);
    }

    @Post()
    async createUserGroup(@Body() body: any, @Res() res: any) {
        try {
            const userGroup = await userGroups.createUserGroup(body);
            return res.status(HttpStatus.CREATED).json(userGroup);
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Get(':id')
    async getUserGroup(@Param('id') id: string, @Res() res: any) {
        try {
            const userGroup = await userGroups.getUserGroup(id);
            if (!userGroup) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User group not found'});
            }
            return res.json(userGroup);
        } catch (error: any) {
            console.error('Error in getUserGroup endpoint:', error.message);
            console.error('Stack trace:', error.stack);
            return res
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .json({error: `getUserGroup error: ${error.message}`});
        }
    }

    @Put(':id')
    async updateUserGroup(
        @Param('id') id: string,
        @Body() body: any,
        @Res() res: any,
    ) {
        try {
            const updated = await userGroups.updateUserGroup(id, body);
            if (!updated) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'User group not found'});
            }
            return res.json(updated);
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Delete(':id')
    async deleteUserGroup(@Param('id') id: string, @Res() res: any) {
        try {
            await userGroups.deleteUserGroup(id);
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Get('search')
    async searchUserGroups(
        @Query('q') searchTerm: string,
        @Query('accountId') accountId?: string,
        @Query('enterpriseId') enterpriseId?: string,
    ) {
        if (!searchTerm) {
            return await userGroups.listUserGroups(accountId, enterpriseId);
        }
        return await userGroups.searchUserGroups(
            searchTerm,
            accountId,
            enterpriseId,
        );
    }

    // Role assignment endpoints
    @Post(':groupId/roles')
    async assignRoleToGroup(
        @Param('groupId') groupId: string,
        @Body() body: {roleId: string; roleName?: string},
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                await AccessControl_Service.assignRoleToGroup(
                    groupId,
                    body.roleId,
                );
                return res.status(HttpStatus.CREATED).json({
                    success: true,
                    message: 'Role assigned to group successfully',
                });
            } else {
                const assignment = await roles.assignRoleToGroup(
                    groupId,
                    body.roleId,
                    body.roleName || '',
                );
                return res.status(HttpStatus.CREATED).json(assignment);
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Delete(':groupId/roles/:roleId')
    async removeRoleFromGroup(
        @Param('groupId') groupId: string,
        @Param('roleId') roleId: string,
        @Res() res: any,
    ) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                await AccessControl_Service.removeRoleFromGroup(
                    groupId,
                    roleId,
                );
            } else {
                await roles.removeRoleFromGroup(groupId, roleId);
            }
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Get(':groupId/roles')
    async getGroupRoles(@Param('groupId') groupId: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                const groupRoles = await AccessControl_Service.getGroupRoles(
                    groupId,
                );
                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {roles: groupRoles},
                });
            } else {
                const groupRoles = await roles.getRolesForGroup(groupId);
                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {roles: groupRoles},
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .json({error: error.message});
        }
    }

    @Get(':groupId/users')
    async getGroupUsers(@Param('groupId') groupId: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                const users = await AccessControl_Service.getGroupUsers(
                    groupId,
                );
                return res.status(HttpStatus.OK).json({
                    success: true,
                    data: {users},
                });
            } else {
                // Legacy implementation would need to be added here
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'Group users listing not implemented for this storage mode',
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .json({error: error.message});
        }
    }

    // Test data seeding endpoint
    @Post('seed-test-data')
    async seedTestData(@Res() res: any) {
        if (storageMode !== 'dynamodb' || !AccessControl_Service) {
            return res.status(HttpStatus.BAD_REQUEST).json({
                error: 'Test data seeding only available in DynamoDB mode',
            });
        }

        try {
            console.log('🌱 Starting to seed test data...');

            // Test groups
            const testGroups = [
                {
                    name: 'Administrators',
                    description: 'System administrators with full access',
                },
                {name: 'HR Team', description: 'Human Resources team members'},
                {
                    name: 'Finance Team',
                    description: 'Finance and accounting team members',
                },
                {
                    name: 'IT Support',
                    description: 'Technical support team members',
                },
                {
                    name: 'Sales Team',
                    description: 'Sales and marketing team members',
                },
                {
                    name: 'Project Managers',
                    description: 'Project management team',
                },
            ];

            // Test roles
            const testRoles = [
                {
                    name: 'Super Admin',
                    description: 'Full system access and control',
                    permissions: ['*'],
                },
                {
                    name: 'User Manager',
                    description: 'Can manage users and groups',
                    permissions: [
                        'users:read',
                        'users:write',
                        'groups:read',
                        'groups:write',
                    ],
                },
                {
                    name: 'HR Manager',
                    description: 'Human resources management permissions',
                    permissions: [
                        'users:read',
                        'users:write',
                        'reports:hr',
                        'payroll:read',
                    ],
                },
                {
                    name: 'Finance Manager',
                    description: 'Financial data and reporting access',
                    permissions: [
                        'finance:read',
                        'finance:write',
                        'reports:finance',
                        'budgets:manage',
                    ],
                },
                {
                    name: 'Read Only',
                    description: 'View-only access to most resources',
                    permissions: ['users:read', 'groups:read', 'reports:read'],
                },
                {
                    name: 'Support Agent',
                    description: 'Customer support and ticket management',
                    permissions: [
                        'tickets:read',
                        'tickets:write',
                        'customers:read',
                        'knowledge:read',
                    ],
                },
            ];

            // Test services
            const testServices = [
                {
                    name: 'User Management',
                    description: 'User account and profile management service',
                },
                {
                    name: 'Financial Reporting',
                    description: 'Financial data and reporting service',
                },
                {
                    name: 'HR Portal',
                    description: 'Human resources management portal',
                },
                {
                    name: 'Project Tracking',
                    description: 'Project management and tracking system',
                },
                {
                    name: 'Customer Support',
                    description: 'Customer service and support system',
                },
                {
                    name: 'Analytics Dashboard',
                    description: 'Business intelligence and analytics',
                },
            ];

            const createdGroups = [];
            const createdRoles = [];
            const createdServices = [];

            // Create groups
            console.log('📋 Creating test user groups...');
            for (const groupData of testGroups) {
                const group = await AccessControl_Service.createGroup(
                    groupData,
                );
                createdGroups.push(group);
                console.log(`✅ Created group: ${group.name}`);
            }

            // Create roles
            console.log('🎭 Creating test roles...');
            for (const roleData of testRoles) {
                const role = await AccessControl_Service.createRole(roleData);
                createdRoles.push(role);
                console.log(`✅ Created role: ${role.name}`);
            }

            // Create services
            console.log('🔧 Creating test services...');
            for (const serviceData of testServices) {
                const service = await AccessControl_Service.createService(
                    serviceData,
                );
                createdServices.push(service);
                console.log(`✅ Created service: ${service.name}`);
            }

            // Create role-group assignments
            console.log('🔗 Creating role-group assignments...');
            const roleAssignments = [
                {groupName: 'Administrators', roleName: 'Super Admin'},
                {groupName: 'HR Team', roleName: 'HR Manager'},
                {groupName: 'Finance Team', roleName: 'Finance Manager'},
                {groupName: 'IT Support', roleName: 'Support Agent'},
                {groupName: 'Sales Team', roleName: 'Read Only'},
                {groupName: 'Project Managers', roleName: 'User Manager'},
            ];

            for (const assignment of roleAssignments) {
                const group = createdGroups.find(
                    (g) => g.name === assignment.groupName,
                );
                const role = createdRoles.find(
                    (r) => r.name === assignment.roleName,
                );

                if (group && role) {
                    await AccessControl_Service.assignRoleToGroup(
                        group.id,
                        role.id,
                    );
                    console.log(
                        `✅ Assigned role "${role.name}" to group "${group.name}"`,
                    );
                }
            }

            // Create service-group assignments
            console.log('🔗 Creating service-group assignments...');
            const serviceAssignments = [
                {groupName: 'Administrators', serviceName: 'User Management'},
                {
                    groupName: 'Administrators',
                    serviceName: 'Analytics Dashboard',
                },
                {groupName: 'HR Team', serviceName: 'HR Portal'},
                {groupName: 'HR Team', serviceName: 'User Management'},
                {groupName: 'Finance Team', serviceName: 'Financial Reporting'},
                {groupName: 'Finance Team', serviceName: 'Analytics Dashboard'},
                {groupName: 'IT Support', serviceName: 'Customer Support'},
                {groupName: 'IT Support', serviceName: 'User Management'},
                {
                    groupName: 'Project Managers',
                    serviceName: 'Project Tracking',
                },
                {
                    groupName: 'Project Managers',
                    serviceName: 'Analytics Dashboard',
                },
            ];

            for (const assignment of serviceAssignments) {
                const group = createdGroups.find(
                    (g) => g.name === assignment.groupName,
                );
                const service = createdServices.find(
                    (s) => s.name === assignment.serviceName,
                );

                if (group && service) {
                    await AccessControl_Service.assignServiceToGroup(
                        group.id,
                        service.id,
                    );
                    console.log(
                        `✅ Assigned service "${service.name}" to group "${group.name}"`,
                    );
                }
            }

            console.log('🎉 Test data seeding completed successfully!');

            return res.status(HttpStatus.OK).json({
                success: true,
                message: 'Test data seeded successfully',
                summary: {
                    groups: createdGroups.length,
                    roles: createdRoles.length,
                    services: createdServices.length,
                    roleAssignments: roleAssignments.length,
                    serviceAssignments: serviceAssignments.length,
                },
                data: {
                    groups: createdGroups,
                    roles: createdRoles,
                    services: createdServices,
                },
            });
        } catch (error: any) {
            console.error('❌ Error seeding test data:', error);
            return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
                error: 'Failed to seed test data',
                details: error.message,
            });
        }
    }
}

@Controller('api/roles')
class RolesController {
    @Get()
    async list(@Query('groupId') groupId?: string) {
        if (storageMode === 'dynamodb' && AccessControl_Service) {
            if (groupId) {
                return await AccessControl_Service.getGroupRoles(groupId);
            }
            return await AccessControl_Service.listRoles();
        } else {
            if (groupId) {
                return await roles.getRolesForGroup(groupId);
            }
            return await roles.list();
        }
    }

    @Get(':id')
    async get(@Param('id') id: string, @Res() res: any) {
        if (storageMode === 'dynamodb' && AccessControl_Service) {
            const role = await AccessControl_Service.getRole(id);
            if (!role) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'Role not found'});
            }
            return res.json(role);
        } else {
            const role = await roles.get(id);
            if (!role) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'Role not found'});
            }
            return res.json(role);
        }
    }

    @Post()
    async create(@Body() body: any, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                const role = await AccessControl_Service.createRole({
                    name: body.name,
                    description: body.description,
                    permissions: body.permissions || [],
                });
                return res.status(HttpStatus.CREATED).json(role);
            } else {
                const role = await roles.create(body);
                return res.status(HttpStatus.CREATED).json(role);
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                const updated = await AccessControl_Service.updateRole(
                    id,
                    body,
                );
                if (!updated) {
                    return res
                        .status(HttpStatus.NOT_FOUND)
                        .json({error: 'Role not found'});
                }
                return res.json(updated);
            } else {
                const updated = await roles.update(id, body);
                if (!updated) {
                    return res
                        .status(HttpStatus.NOT_FOUND)
                        .json({error: 'Role not found'});
                }
                return res.json(updated);
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Delete(':id')
    async delete(@Param('id') id: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                await AccessControl_Service.deleteRole(id);
            } else {
                await roles.delete(id);
            }
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    // Scope Configuration endpoints
    @Get(':id/scope')
    async getRoleScope(@Param('id') id: string, @Res() res: any) {
        try {
            if (storageMode === 'dynamodb' && AccessControl_Service) {
                const scopeConfig = await AccessControl_Service.getRoleScope(
                    id,
                );
                if (!scopeConfig) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'Role or scope configuration not found',
                    });
                }
                return res.json(scopeConfig);
            } else {
                // For file-based storage, we can extend the roles service later
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'Scope configuration only available with DynamoDB storage',
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Put(':id/scope')
    async updateRoleScope(
        @Param('id') id: string,
        @Body() scopeConfig: any,
        @Res() res: any,
    ) {
        try {
            console.log('🔄 Received scope update request for role:', id);

            if (storageMode === 'dynamodb' && AccessControl_Service) {
                // Validate the scope configuration structure
                const validatedConfig = {
                    accountSettings: scopeConfig.accountSettings || [],
                    accessControl: scopeConfig.accessControl || [],
                    securityGovernance: scopeConfig.securityGovernance || [],
                    pipelines: scopeConfig.pipelines || [],
                    builds: scopeConfig.builds || [],
                    configured: true,
                    createdAt:
                        scopeConfig.createdAt || new Date().toISOString(),
                };

                const updatedRole = await AccessControl_Service.updateRoleScope(
                    id,
                    validatedConfig,
                );

                if (!updatedRole) {
                    return res.status(HttpStatus.NOT_FOUND).json({
                        error: 'Role not found',
                    });
                }

                return res.json({
                    success: true,
                    message: 'Scope configuration updated successfully',
                    role: updatedRole,
                });
            } else {
                return res.status(HttpStatus.NOT_IMPLEMENTED).json({
                    error: 'Scope configuration only available with DynamoDB storage',
                });
            }
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }
}

@Controller('api/attributes')
class AttributesController {
    @Get()
    async list(@Query('roleId') roleId?: string) {
        if (roleId) {
            return await attributes.getAttributesForRole(roleId);
        }
        return await attributes.list();
    }

    @Get(':id')
    async get(@Param('id') id: string, @Res() res: any) {
        const attribute = await attributes.get(id);
        if (!attribute) {
            return res
                .status(HttpStatus.NOT_FOUND)
                .json({error: 'Attribute not found'});
        }
        return res.json(attribute);
    }

    @Post()
    async create(@Body() body: any, @Res() res: any) {
        try {
            const attribute = await attributes.create(body);
            return res.status(HttpStatus.CREATED).json(attribute);
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any, @Res() res: any) {
        try {
            const updated = await attributes.update(id, body);
            if (!updated) {
                return res
                    .status(HttpStatus.NOT_FOUND)
                    .json({error: 'Attribute not found'});
            }
            return res.json(updated);
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Delete(':id')
    async delete(@Param('id') id: string, @Res() res: any) {
        try {
            await attributes.delete(id);
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }

    @Put('roles/:roleId')
    async updateRoleAttributes(
        @Param('roleId') roleId: string,
        @Body() body: {attributes: any[]},
        @Res() res: any,
    ) {
        try {
            await attributes.updateRoleAttributes(roleId, body.attributes);
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error: any) {
            return res
                .status(HttpStatus.BAD_REQUEST)
                .json({error: error.message});
        }
    }
}

@Controller('api/breadcrumb')
class BreadcrumbController {
    @Get('context')
    async getContext() {
        // Return mock context data - in a real implementation, this would come from session/auth
        return {
            accountId: '3',
            enterpriseId: '1',
            accountName: 'Default Account',
            enterpriseName: 'Default Enterprise',
        };
    }
}

@Controller('api/groups')
class GroupsController {
    @Get()
    async list(@Query('search') search?: string) {
        if (storageMode === 'dynamodb' && AccessControl_Service) {
            const allGroups = await AccessControl_Service.listGroups();
            if (!search) return allGroups;
            const searchLower = search.toLowerCase();
            return allGroups.filter(
                (group) =>
                    group.name.toLowerCase().includes(searchLower) ||
                    (group.description &&
                        group.description.toLowerCase().includes(searchLower)),
            );
        } else {
            return groups.list(search);
        }
    }

    @Post()
    async create(@Body() body: any, @Res() res: any) {
        if (storageMode === 'dynamodb' && AccessControl_Service) {
            const created = await AccessControl_Service.createGroup({
                name: body?.name,
                description: body?.description,
            });
            return res.status(HttpStatus.CREATED).json(created);
        } else {
            const created = groups.create({
                name: body?.name,
                description: body?.description,
            });
            return res.status(HttpStatus.CREATED).json(created);
        }
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
        if (storageMode === 'dynamodb') {
            // For DynamoDB, return detailed information with names
            const linkages = await enterpriseProductsServices.list();
            const detailedLinkages = [];

            for (const linkage of linkages) {
                // Get enterprise, product, and service names
                const [enterprise, product, ...serviceList] = await Promise.all(
                    [
                        enterprises.get(linkage.enterpriseId),
                        products.get(linkage.productId),
                        ...linkage.serviceIds.map((serviceId: string) =>
                            services.get(serviceId),
                        ),
                    ],
                );

                detailedLinkages.push({
                    id: linkage.id,
                    enterpriseId: linkage.enterpriseId,
                    productId: linkage.productId,
                    serviceIds: linkage.serviceIds,
                    enterprise: {
                        id: linkage.enterpriseId,
                        name: enterprise?.name || 'Unknown Enterprise',
                    },
                    product: {
                        id: linkage.productId,
                        name: product?.name || 'Unknown Product',
                    },
                    services: serviceList.map((svc, index) => ({
                        id: linkage.serviceIds[index],
                        name: svc?.name || 'Unknown Service',
                    })),
                    createdAt: linkage.createdAt,
                    updatedAt: linkage.updatedAt,
                });
            }

            return detailedLinkages;
        } else {
            // For PostgreSQL, return basic information
            return await enterpriseProductsServices.list();
        }
    }

    @Get(':id')
    async get(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            return await enterpriseProductsServices.get(id); // String ID for DynamoDB
        } else {
            return await enterpriseProductsServices.get(parseInt(id)); // Number ID for PostgreSQL
        }
    }

    @Post()
    async create(@Body() body: any) {
        // Use createOrUpdate by default to prevent duplicates
        return await enterpriseProductsServices.createOrUpdate(body);
    }

    @Post('create-or-update')
    async createOrUpdate(@Body() body: any) {
        return await enterpriseProductsServices.createOrUpdate(body);
    }

    @Post('force-create')
    async forceCreate(@Body() body: any) {
        // Force create without checking for existing records
        return await enterpriseProductsServices.create(body);
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() body: any, @Res() res: any) {
        try {
            let result;
            if (storageMode === 'dynamodb') {
                result = await enterpriseProductsServices.update(id, body); // String ID for DynamoDB
            } else {
                result = await enterpriseProductsServices.update(
                    parseInt(id),
                    body,
                ); // Number ID for PostgreSQL
            }

            if (!result) {
                return res.status(404).json({error: 'Record not found'});
            }

            return res.json(result);
        } catch (error: any) {
            console.error(
                'Error updating enterprise-products-services:',
                error.message,
            );

            return res.status(500).json({
                error: 'Internal server error',
                message: error.message,
                details:
                    process.env.NODE_ENV === 'development'
                        ? error.stack
                        : undefined,
            });
        }
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        if (storageMode === 'dynamodb') {
            await enterpriseProductsServices.remove(id); // String ID for DynamoDB
        } else {
            await enterpriseProductsServices.remove(parseInt(id)); // Number ID for PostgreSQL
        }
        return {};
    }

    // Get all linkages for a specific enterprise
    @Get('enterprise/:enterpriseId')
    async getByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        if (storageMode === 'dynamodb') {
            return await enterpriseProductsServices.getByEnterprise(
                enterpriseId,
            ); // String ID for DynamoDB
        } else {
            return await enterpriseProductsServices.getByEnterprise(
                parseInt(enterpriseId),
            ); // Number ID for PostgreSQL
        }
    }

    // Get detailed information with names for a specific enterprise
    @Get('enterprise/:enterpriseId/detailed')
    async getDetailedByEnterprise(@Param('enterpriseId') enterpriseId: string) {
        if (storageMode === 'dynamodb') {
            return await enterpriseProductsServices.getDetailedByEnterprise(
                enterpriseId,
            ); // String ID for DynamoDB
        } else {
            return await enterpriseProductsServices.getDetailedByEnterprise(
                parseInt(enterpriseId),
            ); // Number ID for PostgreSQL
        }
    }

    // Find by enterprise and product
    @Get('enterprise/:enterpriseId/product/:productId')
    async findByEnterpriseAndProduct(
        @Param('enterpriseId') enterpriseId: string,
        @Param('productId') productId: string,
    ) {
        return await enterpriseProductsServices.findByEnterpriseAndProduct(
            parseInt(enterpriseId),
            parseInt(productId),
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

    // Consolidate duplicate records
    @Post('consolidate-duplicates')
    async consolidateDuplicates() {
        await enterpriseProductsServices.consolidateDuplicates();
        return {message: 'Duplicate records consolidated successfully'};
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
        RolesController,
        AttributesController,
        BreadcrumbController,
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

        // Load environment variables from config.env file
        dotenv.config({path: 'config.env'});
        dotenv.config(); // Also load from .env if it exists

        storageMode = process.env.STORAGE_MODE || 'postgres';
        console.log('Loaded Storage Mode:', storageMode);
        console.log(
            'Use In-Memory DynamoDB:',
            process.env.USE_IN_MEMORY_DYNAMODB,
        );

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
        } else if (storageMode === 'dynamodb') {
            console.log('Testing DynamoDB connection...');
            const dynamoConnected = await testDynamoDBConnection();
            if (!dynamoConnected) {
                console.error(
                    'Failed to connect to DynamoDB. Please check your AWS configuration and table setup.',
                );
                console.error('Required environment variables:');
                console.error('- AWS_REGION (default: us-east-1)');
                console.error('- AWS_ACCESS_KEY_ID (if not using IAM roles)');
                console.error(
                    '- AWS_SECRET_ACCESS_KEY (if not using IAM roles)',
                );
                console.error(
                    '- DYNAMODB_ENTERPRISE_TABLE (default: EnterpriseConfig)',
                );
                console.error(
                    '- DYNAMODB_ENDPOINT (optional, for local DynamoDB)',
                );
                process.exit(1);
            }
            console.log('DynamoDB connection successful!');
        }

        // Initialize services based on storage mode after environment variables are loaded
        console.log('Initializing services for storage mode:', storageMode);

        if (storageMode === 'dynamodb') {
            enterprises = new EnterprisesDynamoDBService(STORAGE_DIR);
            services = new ServicesDynamoDBService(STORAGE_DIR);
            products = new ProductsDynamoDBService(STORAGE_DIR);
            enterpriseProductsServices =
                new EnterpriseProductsServicesDynamoDBService(STORAGE_DIR);
            // Initialize AccessControl DynamoDB service
            AccessControl_Service = new AccessControl_DynamoDBService();
            console.log('AccessControl DynamoDB service initialized');
        } else {
            enterprises = new EnterprisesService(STORAGE_DIR);
            services = new ServicesService(STORAGE_DIR);
            products = new ProductsService(STORAGE_DIR);
            enterpriseProductsServices = new EnterpriseProductsServicesService(
                STORAGE_DIR,
            );
            // For non-DynamoDB modes, we'll still use legacy services
            console.log(
                'Using legacy AccessControl services (PostgreSQL/filesystem)',
            );
        }

        console.log('Services initialized successfully!');

        const app = await NestFactory.create(AppModule, {cors: true});

        // Skip seeding - using existing fnd_ tables
        console.log('Using existing database schema with fnd_ tables...');

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
