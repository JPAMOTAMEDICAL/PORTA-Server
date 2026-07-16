import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { BillingType, CollectionFrequency, FacilityType } from '@prisma/client';
import { FacilitiesService } from './facilities.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('facilities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FacilitiesController {
  constructor(private readonly facilitiesService: FacilitiesService) {}

  @Post()
  @Permissions(PermissionCodes.FACILITIES_CREATE)
  create(
    @Body()
    body: {
      name: string;
      code: string;
      type: FacilityType;
      address: string;
      city?: string;
      state?: string;
      lga?: string;
      gpsCoordinates?: string;
      logoUrl?: string;
      billingType?: BillingType;
      ratePerKg?: number;
      fixedMonthlyRate?: number;
      invoiceCycle?: string;
      collectionFrequency?: CollectionFrequency;
      contactPerson: string;
      phone: string;
      email: string;
    },
  ) {
    return this.facilitiesService.create({
      name: body.name,
      code: body.code,
      type: body.type,
      address: body.address,
      city: body.city,
      state: body.state,
      lga: body.lga,
      gpsCoordinates: body.gpsCoordinates,
      logoUrl: body.logoUrl,
      billingType: body.billingType ?? BillingType.KG_BASED,
      ratePerKg: body.ratePerKg,
      fixedMonthlyRate: body.fixedMonthlyRate,
      invoiceCycle: body.invoiceCycle,
      collectionFrequency:
        body.collectionFrequency ?? CollectionFrequency.WEEKLY,
      contactPerson: body.contactPerson,
      phone: body.phone,
      email: body.email,
    });
  }

  @Get()
  @Permissions(PermissionCodes.FACILITIES_VIEW)
  findAll() {
    return this.facilitiesService.findAll({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Get(':id')
  @Permissions(PermissionCodes.FACILITIES_VIEW)
  findOne(@Param('id') id: string) {
    return this.facilitiesService.findOne(id);
  }

  @Get(':id/timeline')
  @Permissions(PermissionCodes.FACILITIES_VIEW_TIMELINE)
  getTimeline(@Param('id') id: string) {
    return this.facilitiesService.getTimeline(id);
  }

  @Get(':id/service-monitoring')
  @Permissions(PermissionCodes.FACILITIES_VIEW_SERVICE_MONITORING)
  getServiceMonitoring(@Param('id') id: string) {
    return this.facilitiesService.getServiceMonitoring(id);
  }

  @Patch(':id')
  @Permissions(PermissionCodes.FACILITIES_UPDATE)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      lga?: string;
      gpsCoordinates?: string;
      logoUrl?: string;
      ratePerKg?: number;
      fixedMonthlyRate?: number;
      invoiceCycle?: string;
      collectionFrequency?: CollectionFrequency;
      contactPerson?: string;
      phone?: string;
      email?: string;
      status?: string;
    },
  ) {
    return this.facilitiesService.update(id, body);
  }

  @Delete(':id')
  @Permissions(PermissionCodes.FACILITIES_DELETE)
  remove(@Param('id') id: string) {
    return this.facilitiesService.softDelete(id);
  }
}
