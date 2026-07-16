import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VisitPurpose, VisitStatus } from '@prisma/client';

@Injectable()
export class VisitsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: {
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
  }) {
    return this.prisma.facilityVisit.create({
      data: {
        facilityId: data.facilityId,
        staffId: data.staffId,
        purpose: data.purpose,
        outcome: data.outcome,
        notes: data.notes,
        photos: data.photos ?? [],
        gpsCoordinates: data.gpsCoordinates,
        durationMinutes: data.durationMinutes,
        followUpRequired: data.followUpRequired ?? false,
        followUpDate: data.followUpDate
          ? new Date(data.followUpDate)
          : undefined,
        clientReference: data.clientReference,
        status: data.status ?? VisitStatus.COMPLETED,
      },
    });
  }

  async list(facilityId?: string) {
    return this.prisma.facilityVisit.findMany({
      where: {
        deletedAt: null,
        facilityId,
      },
      include: {
        facility: true,
        staff: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async complete(id: string, notes?: string) {
    return this.prisma.facilityVisit.update({
      where: { id },
      data: {
        status: VisitStatus.COMPLETED,
        notes,
      },
    });
  }

  async syncOfflineVisits(
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
    }>,
  ) {
    const results: Array<{
      clientReference: string;
      status: 'DUPLICATE' | 'SYNCED';
      visit: Awaited<ReturnType<typeof this.create>>;
    }> = [];

    for (const item of visits) {
      const existing = await this.prisma.facilityVisit.findFirst({
        where: {
          clientReference: item.clientReference,
        },
      });

      if (existing) {
        results.push({
          clientReference: item.clientReference,
          status: 'DUPLICATE',
          visit: existing,
        });
        continue;
      }

      const created = await this.create(item);
      results.push({
        clientReference: item.clientReference,
        status: 'SYNCED',
        visit: created,
      });
    }

    return results;
  }
}
