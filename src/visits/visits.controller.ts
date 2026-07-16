import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VisitPurpose, VisitStatus } from '@prisma/client';
import { VisitsService } from './visits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('visits')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class VisitsController {
  constructor(private readonly visitsService: VisitsService) {}

  @Post()
  @Permissions(PermissionCodes.VISITS_CREATE)
  create(
    @Body()
    body: {
      facilityId: string;
      staffId: string;
      purpose: VisitPurpose;
      outcome?: string;
      notes?: string;
      photos?: string[];
      gpsCoordinates?: string;
      durationMinutes?: number;
      followUpRequired?: boolean;
      followUpDate?: string;
      clientReference?: string;
      status?: VisitStatus;
    },
  ) {
    return this.visitsService.create(body);
  }

  @Get()
  @Permissions(PermissionCodes.VISITS_VIEW)
  list(@Query('facilityId') facilityId?: string) {
    return this.visitsService.list(facilityId);
  }

  @Post(':id/complete')
  @Permissions(PermissionCodes.VISITS_COMPLETE)
  complete(@Param('id') id: string, @Body() body: { notes?: string }) {
    return this.visitsService.complete(id, body.notes);
  }

  @Post('offline-sync')
  @Permissions(PermissionCodes.VISITS_OFFLINE_SYNC)
  syncOfflineVisits(
    @Body()
    body: {
      visits: Array<{
        facilityId: string;
        staffId: string;
        purpose: VisitPurpose;
        outcome?: string;
        notes?: string;
        photos?: string[];
        gpsCoordinates?: string;
        durationMinutes?: number;
        followUpRequired?: boolean;
        followUpDate?: string;
        clientReference: string;
        status?: VisitStatus;
      }>;
    },
  ) {
    return this.visitsService.syncOfflineVisits(body.visits);
  }
}
