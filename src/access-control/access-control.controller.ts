import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { AccessControlService } from './access-control.service';
import { PermissionCodes } from './permission-codes';

@Controller('access-control')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccessControlController {
  constructor(private readonly accessControlService: AccessControlService) {}

  @Get('roles')
  @Permissions(PermissionCodes.ACCESS_ROLES_VIEW)
  listRoles() {
    return this.accessControlService.listRoles();
  }

  @Post('roles')
  @Permissions(PermissionCodes.ACCESS_ROLES_MANAGE)
  createRole(
    @Body() body: { name: string; description?: string; isSystem?: boolean },
  ) {
    return this.accessControlService.createRole(body);
  }

  @Patch('roles/:id')
  @Permissions(PermissionCodes.ACCESS_ROLES_MANAGE)
  updateRole(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.accessControlService.updateRole(id, body);
  }

  @Delete('roles/:id')
  @Permissions(PermissionCodes.ACCESS_ROLES_MANAGE)
  deleteRole(@Param('id') id: string) {
    return this.accessControlService.deleteRole(id);
  }

  @Get('permissions')
  @Permissions(PermissionCodes.ACCESS_PERMISSIONS_VIEW)
  listPermissions(@Query('module') module?: string) {
    return this.accessControlService.listPermissions(module);
  }

  @Patch('roles/:id/permissions')
  @Permissions(PermissionCodes.ACCESS_ROLE_PERMISSIONS_MANAGE)
  updateRolePermissions(
    @Param('id') id: string,
    @Body() body: { permissionCodes: string[] },
  ) {
    return this.accessControlService.setRolePermissions(
      id,
      body.permissionCodes ?? [],
    );
  }

  @Patch('users/:id/roles')
  @Permissions(PermissionCodes.ACCESS_USER_ROLES_MANAGE)
  updateUserRoles(
    @Param('id') id: string,
    @Body() body: { roleIds: string[] },
  ) {
    return this.accessControlService.setUserRoles(id, body.roleIds ?? []);
  }
}
