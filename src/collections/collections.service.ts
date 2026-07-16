import { Injectable } from '@nestjs/common';
import { Prisma, Collection, CollectionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
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
    syncStatus?: 'PENDING_SYNC' | 'SYNCING' | 'COMPLETED' | 'FAILED_SYNC';
    status?: CollectionStatus;
  }): Promise<Collection> {
    const created = await this.prisma.collection.create({
      data: {
        facilityId: data.facilityId,
        driverId: data.driverId,
        weightKg: new Prisma.Decimal(data.weightKg),
        binCount: data.binCount ?? 0,
        collectionTime: data.collectionTime
          ? new Date(data.collectionTime)
          : undefined,
        wasteType: data.wasteType,
        manifestNo: data.manifestNo,
        routeId: data.routeId,
        signatureUrl: data.signatureUrl,
        notes: data.notes,
        photoUrls: data.photoUrls ?? [],
        gpsLocation: data.gpsLocation,
        deviceInfo: data.deviceInfo,
        clientReference: data.clientReference,
        syncStatus: data.syncStatus ?? 'COMPLETED',
        syncedAt:
          data.syncStatus === 'COMPLETED' || !data.syncStatus
            ? new Date()
            : undefined,
        status: data.status ?? CollectionStatus.COMPLETED,
      },
    });

    if (data.routeId) {
      await this.refreshRouteProgress(data.routeId);
    }

    return created;
  }

  async findAll(facilityId?: string, routeId?: string) {
    return this.prisma.collection.findMany({
      where: {
        deletedAt: null,
        facilityId,
        routeId,
      },
      include: {
        facility: true,
        driver: true,
        route: true,
      },
      orderBy: {
        collectionTime: 'desc',
      },
    });
  }

  async getMonthlyKgTotal(facilityId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const aggregate = await this.prisma.collection.aggregate({
      _sum: {
        weightKg: true,
      },
      where: {
        facilityId,
        deletedAt: null,
        collectionTime: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    return {
      facilityId,
      month,
      year,
      totalKg: aggregate._sum.weightKg ?? new Prisma.Decimal(0),
    };
  }

  async syncOfflineCollections(
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
    }>,
  ) {
    const results: Array<{
      clientReference: string;
      status: 'DUPLICATE' | 'SYNCED';
      collection: Collection;
    }> = [];

    for (const item of collections) {
      const existing = await this.prisma.collection.findFirst({
        where: {
          OR: [
            { manifestNo: item.manifestNo },
            { clientReference: item.clientReference },
          ],
        },
      });

      if (existing) {
        results.push({
          clientReference: item.clientReference,
          status: 'DUPLICATE',
          collection: existing,
        });
        continue;
      }

      const created = await this.create({
        ...item,
        syncStatus: 'COMPLETED',
      });
      results.push({
        clientReference: item.clientReference,
        status: 'SYNCED',
        collection: created,
      });
    }

    return results;
  }

  private async refreshRouteProgress(routeId: string) {
    const route = await this.prisma.route.findFirst({
      where: {
        id: routeId,
        deletedAt: null,
      },
      include: {
        collections: {
          where: {
            deletedAt: null,
          },
        },
      },
    });

    if (!route) {
      return;
    }

    const stops = Array.isArray(route.stops) ? route.stops : [];
    const plannedStops = stops.length;
    const completedStops = route.collections.length;
    const nextStatus =
      completedStops === 0
        ? 'PLANNED'
        : completedStops >= plannedStops && plannedStops > 0
          ? 'COMPLETED'
          : 'IN_PROGRESS';

    await this.prisma.route.update({
      where: { id: routeId },
      data: {
        status: nextStatus,
      },
    });
  }
}
