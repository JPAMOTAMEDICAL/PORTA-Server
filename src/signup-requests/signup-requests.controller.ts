import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FacilityType } from '@prisma/client';
import { SignupRequestsService } from './signup-requests.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('signup-requests')
export class SignupRequestsController {
  constructor(private readonly signupRequestsService: SignupRequestsService) {}

  @Post()
  create(
    @Body()
    body: {
      facilityName: string;
      facilityType: FacilityType;
      address: string;
      contactPerson: string;
      phone: string;
      email: string;
      state: string;
      lga: string;
    },
  ) {
    return this.signupRequestsService.create(body);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PermissionCodes.SIGNUP_REQUESTS_VIEW)
  list() {
    return this.signupRequestsService.list();
  }

  @Patch(':id/review')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions(PermissionCodes.SIGNUP_REQUESTS_REVIEW)
  review(
    @Param('id') id: string,
    @Body()
    body: {
      reviewedById: string;
      decision: 'APPROVE' | 'REJECT' | 'REQUEST_MODIFICATION';
      notes?: string;
    },
  ) {
    return this.signupRequestsService.review(
      id,
      body.reviewedById,
      body.decision,
      body.notes,
    );
  }
}
