import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ComplaintStatus, ComplaintType } from '@prisma/client';
import { ComplaintsService } from './complaints.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('complaints')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post()
  @Permissions(PermissionCodes.COMPLAINTS_CREATE)
  create(
    @Body()
    body: {
      facilityId: string;
      submittedById?: string;
      type: ComplaintType;
      priority?: string;
      description: string;
      attachments?: unknown[];
    },
  ) {
    return this.complaintsService.create(body);
  }

  @Get()
  @Permissions(PermissionCodes.COMPLAINTS_VIEW)
  list(@Query('facilityId') facilityId?: string) {
    return this.complaintsService.list(facilityId);
  }

  @Patch(':id/status')
  @Permissions(PermissionCodes.COMPLAINTS_UPDATE_STATUS)
  updateStatus(
    @Param('id') id: string,
    @Body()
    body: {
      status: ComplaintStatus;
      assignedToId?: string;
      resolutionNotes?: string;
    },
  ) {
    return this.complaintsService.updateStatus(
      id,
      body.status,
      body.assignedToId,
      body.resolutionNotes,
    );
  }
}
