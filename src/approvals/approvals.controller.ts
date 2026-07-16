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
import { ApprovalStatus } from '@prisma/client';
import { ApprovalsService } from './approvals.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post()
  @Permissions(PermissionCodes.APPROVALS_CREATE)
  create(
    @Body()
    body: {
      type: string;
      entityName: string;
      entityId: string;
      requestedById: string;
      facilityId?: string;
      invoiceId?: string;
      oldValues?: unknown;
      newValues?: unknown;
      reason: string;
    },
  ) {
    return this.approvalsService.create(body);
  }

  @Get()
  @Permissions(PermissionCodes.APPROVALS_VIEW)
  list(@Query('status') status?: ApprovalStatus) {
    return this.approvalsService.list(status);
  }

  @Patch(':id/review')
  @Permissions(PermissionCodes.APPROVALS_REVIEW)
  review(
    @Param('id') id: string,
    @Body()
    body: {
      reviewedById: string;
      decision: ApprovalStatus;
      reviewNotes?: string;
    },
  ) {
    return this.approvalsService.review(
      id,
      body.reviewedById,
      body.decision,
      body.reviewNotes,
    );
  }
}
