import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: { id: string } }) {
    return this.usersService.findSelfProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(
    @Req() req: { user: { id: string } },
    @Body()
    body: {
      fullName?: string;
      email?: string;
      phone?: string;
      address?: string;
      photoUrl?: string;
    },
  ) {
    return this.usersService.updateSelfProfile(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PermissionCodes.USERS_VIEW)
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PermissionCodes.USERS_CREATE)
  @Post()
  create(
    @Body()
    body: {
      email: string;
      username?: string;
      employeeId?: string;
      phone?: string;
      address?: string;
      photoUrl?: string;
      department?: string;
      position?: string;
      employmentDate?: string;
      licenseNumber?: string;
      password: string;
      fullName: string;
      role?: Role;
      facilityId?: string;
      status?: string;
    },
  ) {
    return this.usersService.createUser(body);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PermissionCodes.USERS_UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      username?: string;
      employeeId?: string;
      phone?: string;
      address?: string;
      photoUrl?: string;
      department?: string;
      position?: string;
      employmentDate?: Date;
      licenseNumber?: string;
      role?: Role;
      status?: string;
      facilityId?: string;
      password?: string;
    },
  ) {
    return this.usersService.updateProfile(id, body);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PermissionCodes.USERS_SET_STATUS)
  @Patch(':id/status')
  setStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.usersService.setStatus(id, body.status);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PermissionCodes.USERS_DELETE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.softDelete(id);
  }
}
