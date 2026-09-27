import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permission, type RoleDto, type UserDto } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators.js';
import { CreateRoleDto, CreateUserDto, UpdateRoleDto, UpdateUserDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Usuarios y roles')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @RequirePermissions(Permission.USERS_READ)
  list(): Promise<UserDto[]> {
    return this.users.listUsers();
  }

  @Post('users')
  @RequirePermissions(Permission.USERS_WRITE)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser): Promise<UserDto> {
    return this.users.createUser(dto, actor);
  }

  @Patch('users/:id')
  @RequirePermissions(Permission.USERS_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserDto> {
    return this.users.updateUser(id, dto, actor);
  }

  @Delete('users/:id')
  @RequirePermissions(Permission.USERS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.users.deleteUser(id, actor);
  }

  @Get('roles')
  @RequirePermissions(Permission.ROLES_READ)
  listRoles(): Promise<RoleDto[]> {
    return this.users.listRoles();
  }

  @Post('roles')
  @RequirePermissions(Permission.ROLES_WRITE)
  createRole(
    @Body() dto: CreateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RoleDto> {
    return this.users.createRole(dto, actor);
  }

  @Patch('roles/:id')
  @RequirePermissions(Permission.ROLES_WRITE)
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<RoleDto> {
    return this.users.updateRole(id, dto, actor);
  }

  @Delete('roles/:id')
  @RequirePermissions(Permission.ROLES_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    await this.users.deleteRole(id, actor);
  }
}
