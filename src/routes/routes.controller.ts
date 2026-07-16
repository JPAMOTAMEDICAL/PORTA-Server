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
import { RoutesService } from './routes.service';

@Controller('routes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  @Get()
  @Permissions(PermissionCodes.ROUTES_VIEW)
  list() {
    return this.routesService.list();
  }

  @Get(':id')
  @Permissions(PermissionCodes.ROUTES_VIEW)
  findOne(@Param('id') id: string) {
    return this.routesService.findOne(id);
  }

  @Post('plan')
  @Permissions(PermissionCodes.ROUTES_PLAN)
  planRoute(
    @Body()
    body: {
      driverId: string;
      createdById?: string;
      plannedDate: string;
    },
  ) {
    return this.routesService.planRoute(body);
  }

  @Patch(':id/status')
  @Permissions(PermissionCodes.ROUTES_UPDATE_STATUS)
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.routesService.updateStatus(id, body.status);
  }
}
