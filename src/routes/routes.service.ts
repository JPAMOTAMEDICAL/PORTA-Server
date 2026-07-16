import { Injectable, NotFoundException } from '@nestjs/common';
import { CollectionFrequency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type PlannedStop = {
  facilityId: string;
  facilityName: string;
  sequence: number;
  reason: 'DUE_TODAY' | 'MISSED_COLLECTION' | 'FOLLOW_UP_VISIT';
  gpsCoordinates?: string | null;
};

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.route.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        driver: true,
        createdBy: true,
        vehicle: true,
        collections: {
          where: {
            deletedAt: null,
          },
          include: {
            facility: true,
          },
        },
      },
      orderBy: {
        plannedDate: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const route = await this.prisma.route.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        driver: true,
        createdBy: true,
        vehicle: true,
        collections: {
          where: {
            deletedAt: null,
          },
          include: {
            facility: true,
          },
          orderBy: {
            collectionTime: 'asc',
          },
        },
      },
    });

    if (!route) {
      throw new NotFoundException('Route not found.');
    }

    return route;
  }

  async planRoute(data: {
    driverId: string;
    createdById?: string;
    plannedDate: string;
  }) {
    const plannedDate = new Date(data.plannedDate);
    const facilityCandidates =
      await this.collectCandidateFacilities(plannedDate);

    if (!facilityCandidates.length) {
      throw new NotFoundException(
        'No facilities are due for route planning today.',
      );
    }

    const sortedStops = facilityCandidates
      .sort(
        (left, right) =>
          this.coordinateScore(left.gpsCoordinates) -
          this.coordinateScore(right.gpsCoordinates),
      )
      .map((facility, index) => ({
        facilityId: facility.id,
        facilityName: facility.name,
        sequence: index + 1,
        reason: facility.reason,
        gpsCoordinates: facility.gpsCoordinates,
      })) satisfies PlannedStop[];

    const vehicle = await this.ensureVehicle();
    const metrics = this.calculateRouteMetrics(sortedStops);

    return this.prisma.route.create({
      data: {
        driverId: data.driverId,
        createdById: data.createdById,
        vehicleId: vehicle.id,
        plannedDate,
        stops: sortedStops as never,
        optimizedDist: new Prisma.Decimal(metrics.distanceKm),
        estimatedTravelTimeMinutes: metrics.travelTimeMinutes,
        estimatedFuelLitres: new Prisma.Decimal(metrics.estimatedFuelLitres),
        googleMapsUrl: this.buildGoogleMapsUrl(sortedStops),
        status: 'PLANNED',
      },
      include: {
        driver: true,
        createdBy: true,
        vehicle: true,
        collections: true,
      },
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.route.update({
      where: { id },
      data: { status },
    });
  }

  private async collectCandidateFacilities(plannedDate: Date) {
    const facilities = await this.prisma.facility.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
      },
      include: {
        collections: {
          where: {
            deletedAt: null,
          },
          orderBy: {
            collectionTime: 'desc',
          },
          take: 1,
        },
        visits: {
          where: {
            deletedAt: null,
            followUpRequired: true,
            OR: [
              { followUpDate: null },
              { followUpDate: { lte: plannedDate } },
            ],
          },
          orderBy: {
            followUpDate: 'asc',
          },
          take: 1,
        },
      },
    });

    const results: Array<{
      id: string;
      name: string;
      gpsCoordinates?: string | null;
      reason: PlannedStop['reason'];
    }> = [];

    for (const facility of facilities) {
      const lastCollection = facility.collections[0];
      const expectedDays = this.expectedDays(facility.collectionFrequency);
      const daysSinceCollection = lastCollection
        ? Math.floor(
            (plannedDate.getTime() - lastCollection.collectionTime.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 999;

      if (!lastCollection || daysSinceCollection > expectedDays) {
        results.push({
          id: facility.id,
          name: facility.name,
          gpsCoordinates: facility.gpsCoordinates,
          reason: lastCollection ? 'MISSED_COLLECTION' : 'DUE_TODAY',
        });
        continue;
      }

      if (daysSinceCollection >= Math.max(1, expectedDays - 1)) {
        results.push({
          id: facility.id,
          name: facility.name,
          gpsCoordinates: facility.gpsCoordinates,
          reason: 'DUE_TODAY',
        });
        continue;
      }

      if (facility.visits.length > 0) {
        results.push({
          id: facility.id,
          name: facility.name,
          gpsCoordinates: facility.gpsCoordinates,
          reason: 'FOLLOW_UP_VISIT',
        });
      }
    }

    const seen = new Set<string>();
    return results.filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
  }

  private expectedDays(frequency: CollectionFrequency) {
    switch (frequency) {
      case CollectionFrequency.DAILY:
        return 1;
      case CollectionFrequency.TWICE_WEEKLY:
        return 3;
      case CollectionFrequency.WEEKLY:
        return 7;
      case CollectionFrequency.BI_WEEKLY:
        return 14;
      case CollectionFrequency.MONTHLY:
        return 30;
      case CollectionFrequency.QUARTERLY:
        return 90;
      case CollectionFrequency.ANNUAL:
        return 365;
      default:
        return 7;
    }
  }

  private async ensureVehicle() {
    const existing = await this.prisma.vehicle.findFirst({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.vehicle.create({
      data: {
        plateNumber: `AUTO-${Date.now().toString().slice(-6)}`,
        capacityKg: new Prisma.Decimal(2500),
        status: 'ACTIVE',
      },
    });
  }

  private coordinateScore(value?: string | null) {
    const coordinates = this.parseCoordinates(value);
    if (!coordinates) {
      return Number.MAX_SAFE_INTEGER;
    }
    return coordinates.lat * 100 + coordinates.lng;
  }

  private parseCoordinates(value?: string | null) {
    if (!value) {
      return null;
    }

    const [latRaw, lngRaw] = value.split(',').map((item) => item.trim());
    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return null;
    }

    return { lat, lng };
  }

  private calculateRouteMetrics(stops: PlannedStop[]) {
    let distanceKm = 0;

    for (let index = 1; index < stops.length; index += 1) {
      const previous = this.parseCoordinates(stops[index - 1].gpsCoordinates);
      const current = this.parseCoordinates(stops[index].gpsCoordinates);

      if (!previous || !current) {
        continue;
      }

      distanceKm += this.haversine(
        previous.lat,
        previous.lng,
        current.lat,
        current.lng,
      );
    }

    const travelTimeMinutes = Math.max(20, Math.round((distanceKm / 35) * 60));
    const estimatedFuelLitres = Number((distanceKm / 6).toFixed(1));

    return {
      distanceKm: Number(distanceKm.toFixed(1)),
      travelTimeMinutes,
      estimatedFuelLitres,
    };
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  }

  private buildGoogleMapsUrl(stops: PlannedStop[]) {
    const coordinates = stops
      .map((stop) => stop.gpsCoordinates)
      .filter((value): value is string => Boolean(value));

    if (!coordinates.length) {
      return '';
    }

    if (coordinates.length === 1) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates[0])}`;
    }

    const origin = encodeURIComponent(coordinates[0]);
    const destination = encodeURIComponent(coordinates[coordinates.length - 1]);
    const waypoints = encodeURIComponent(coordinates.slice(1, -1).join('|'));

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving&waypoints=${waypoints}`;
  }
}
