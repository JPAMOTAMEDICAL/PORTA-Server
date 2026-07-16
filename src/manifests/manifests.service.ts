import { Injectable, NotFoundException } from '@nestjs/common';
import { CollectionStatus, NotificationChannel } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ManifestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list() {
    return this.prisma.collection.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        facility: true,
        driver: true,
        route: {
          include: {
            vehicle: true,
            createdBy: true,
          },
        },
      },
      orderBy: {
        collectionTime: 'desc',
      },
    });
  }

  async findOne(manifestNo: string) {
    const manifest = await this.prisma.collection.findFirst({
      where: {
        manifestNo,
        deletedAt: null,
      },
      include: {
        facility: true,
        driver: true,
        route: {
          include: {
            vehicle: true,
            createdBy: true,
            collections: {
              where: {
                deletedAt: null,
              },
              include: {
                facility: true,
              },
            },
          },
        },
      },
    });

    if (!manifest) {
      throw new NotFoundException('Manifest not found.');
    }

    return manifest;
  }

  async verify(
    manifestNo: string,
    payload?: { verifiedById?: string; reason?: string },
  ) {
    const manifest = await this.findOne(manifestNo);
    const verifiedAt = new Date();

    const updatedManifest = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.collection.update({
        where: {
          id: manifest.id,
        },
        data: {
          status: CollectionStatus.COMPLETED,
          syncStatus: 'COMPLETED',
          syncedAt: verifiedAt,
          notes: payload?.reason
            ? [manifest.notes, `Verification: ${payload.reason}`]
                .filter(Boolean)
                .join('\n')
            : manifest.notes,
        },
        include: {
          facility: true,
          driver: true,
          route: {
            include: {
              vehicle: true,
              createdBy: true,
              collections: {
                where: {
                  deletedAt: null,
                },
                select: {
                  status: true,
                },
              },
            },
          },
        },
      });

      if (
        updated.routeId &&
        updated.route?.collections.every(
          (collection) => collection.status === CollectionStatus.COMPLETED,
        )
      ) {
        await tx.route.update({
          where: { id: updated.routeId },
          data: {
            status: 'COMPLETED',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: payload?.verifiedById,
          activityType: 'MANIFEST_VERIFIED',
          entityName: 'CollectionManifest',
          entityId: updated.id,
          oldValues: {
            status: manifest.status,
            syncStatus: manifest.syncStatus,
          } as never,
          newValues: {
            status: updated.status,
            syncStatus: updated.syncStatus,
            verifiedAt: verifiedAt.toISOString(),
            verifiedById: payload?.verifiedById ?? null,
          } as never,
          reason: payload?.reason,
        },
      });

      return updated;
    });

    await this.notificationsService.createForFacilityUsers(
      updatedManifest.facilityId,
      {
        title: 'Manifest verified',
        message: `${updatedManifest.manifestNo} was verified on ${verifiedAt.toLocaleString()}.`,
        type: 'MANIFEST_VERIFIED',
        metadata: {
          manifestNo: updatedManifest.manifestNo,
          manifestId: updatedManifest.id,
          verifiedById: payload?.verifiedById ?? null,
          verifiedAt: verifiedAt.toISOString(),
        },
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      },
    );

    return updatedManifest;
  }
}
