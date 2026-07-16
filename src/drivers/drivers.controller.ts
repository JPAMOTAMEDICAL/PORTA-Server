import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';
import { DriversService } from './drivers.service';

@Controller('drivers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  @Permissions(PermissionCodes.DRIVERS_VIEW)
  list() {
    return this.driversService.list();
  }

  @Post()
  @Permissions(PermissionCodes.DRIVERS_CREATE)
  create(
    @Body()
    body: {
      email: string;
      employeeId?: string;
      phone?: string;
      address?: string;
      photoUrl?: string;
      licenseNumber?: string;
      password: string;
      fullName: string;
    },
  ) {
    return this.driversService.create(body);
  }

  @Patch(':id')
  @Permissions(PermissionCodes.DRIVERS_UPDATE)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      email?: string;
      employeeId?: string;
      phone?: string;
      address?: string;
      photoUrl?: string;
      licenseNumber?: string;
      fullName?: string;
      status?: string;
    },
  ) {
    return this.driversService.update(id, body);
  }

  @Get(':id/routes')
  @Permissions(PermissionCodes.DRIVERS_VIEW_ROUTES)
  getDriverRoutes(@Param('id') id: string) {
    return this.driversService.getDriverRoutes(id);
  }

  @Get('officer-groups/all')
  @Permissions(PermissionCodes.DRIVERS_GROUP_BY_OFFICER)
  groupRoutesByOfficer() {
    return this.driversService.groupRoutesByOfficer();
  }
}
