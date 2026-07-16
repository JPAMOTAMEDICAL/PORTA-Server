import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CollectionStatus } from '@prisma/client';
import { CollectionsService } from './collections.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('collections')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  @Permissions(PermissionCodes.COLLECTIONS_CREATE)
  create(
    @Body()
    body: {
      facilityId: string;
      driverId: string;
      weightKg: number;
      binCount?: number;
      wasteType: string;
      manifestNo: string;
      routeId?: string;
      collectionTime?: string;
      signatureUrl?: string;
      notes?: string;
      photoUrls?: string[];
      gpsLocation?: string;
      deviceInfo?: string;
      clientReference?: string;
      status?: CollectionStatus;
    },
  ) {
    return this.collectionsService.create(body);
  }

  @Get()
  @Permissions(PermissionCodes.COLLECTIONS_VIEW)
  findAll(
    @Query('facilityId') facilityId?: string,
    @Query('routeId') routeId?: string,
  ) {
    return this.collectionsService.findAll(facilityId, routeId);
  }

  @Get('monthly-total')
  @Permissions(PermissionCodes.COLLECTIONS_MONTHLY_TOTAL_VIEW)
  getMonthlyTotal(
    @Query('facilityId') facilityId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.collectionsService.getMonthlyKgTotal(
      facilityId,
      Number(month),
      Number(year),
    );
  }

  @Post('offline-sync')
  @Permissions(PermissionCodes.COLLECTIONS_OFFLINE_SYNC)
  syncOfflineCollections(
    @Body()
    body: {
      collections: Array<{
        facilityId: string;
        driverId: string;
        weightKg: number;
        binCount?: number;
        wasteType: string;
        manifestNo: string;
        signatureUrl?: string;
        notes?: string;
        photoUrls?: string[];
        gpsLocation?: string;
        deviceInfo?: string;
        clientReference: string;
      }>;
    },
  ) {
    return this.collectionsService.syncOfflineCollections(body.collections);
  }
}
