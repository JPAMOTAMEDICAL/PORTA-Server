import { Injectable } from '@nestjs/common';
import {
  ComplaintStatus,
  ComplaintType,
  NotificationChannel,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { serializeStoredDocumentReferences } from '../documents/document-reference';

@Injectable()
export class ComplaintsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(data: {
    facilityId: string;
    submittedById?: string;
    type: ComplaintType;
    priority?: string;
    description: string;
    attachments?: unknown[];
  }) {
    const complaint = await this.prisma.complaint.create({
      data: {
        facilityId: data.facilityId,
        submittedById: data.submittedById,
        type: data.type,
        priority: data.priority ?? 'MEDIUM',
        description: data.description,
        attachments: serializeStoredDocumentReferences(data.attachments ?? []),
        reference: `CMP-${Date.now()}`,
      },
      include: {
        facility: true,
        submittedBy: true,
      },
    });

    await this.notificationsService.createForRoles(
      [Role.SUPER_ADMIN, Role.OPERATIONS_MANAGER, Role.CLIENT_SERVICE_OFFICER],
      {
        title: 'New complaint submitted',
        message: `${complaint.facility?.name ?? 'Facility'} submitted ${complaint.type.toLowerCase()} complaint ${complaint.reference}.`,
        type: 'COMPLAINT_CREATED',
        facilityId: complaint.facilityId,
        metadata: {
          complaintId: complaint.id,
          priority: complaint.priority,
        },
      },
    );

    await this.notificationsService.createForFacilityUsers(
      complaint.facilityId,
      {
        title: 'Complaint logged',
        message: `Complaint ${complaint.reference} has been logged and is awaiting review.`,
        type: 'COMPLAINT_CREATED',
        metadata: {
          complaintId: complaint.id,
          priority: complaint.priority,
        },
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      },
    );

    return complaint;
  }

  async list(facilityId?: string) {
    return this.prisma.complaint.findMany({
      where: {
        deletedAt: null,
        facilityId,
      },
      include: {
        facility: true,
        assignedTo: true,
        submittedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(
    id: string,
    status: ComplaintStatus,
    assignedToId?: string,
    resolutionNotes?: string,
  ) {
    const complaint = await this.prisma.complaint.update({
      where: { id },
      data: {
        status,
        assignedToId,
        resolutionNotes,
        resolvedAt:
          status === ComplaintStatus.RESOLVED ||
          status === ComplaintStatus.CLOSED
            ? new Date()
            : undefined,
      },
      include: {
        facility: true,
        assignedTo: true,
      },
    });

    await this.notificationsService.createForFacilityUsers(
      complaint.facilityId,
      {
        title: 'Complaint updated',
        message: `Complaint ${complaint.reference} is now ${complaint.status.toLowerCase().replaceAll('_', ' ')}.`,
        type: 'COMPLAINT_UPDATED',
        metadata: {
          complaintId: complaint.id,
          assignedToId: complaint.assignedToId,
        },
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      },
    );

    await this.notificationsService.createForRoles(
      [Role.SUPER_ADMIN, Role.OPERATIONS_MANAGER, Role.CLIENT_SERVICE_OFFICER],
      {
        title: 'Complaint workflow updated',
        message: `${complaint.reference} moved to ${complaint.status.toLowerCase().replaceAll('_', ' ')}.`,
        type: 'COMPLAINT_UPDATED',
        facilityId: complaint.facilityId,
        metadata: {
          complaintId: complaint.id,
          assignedToId: complaint.assignedToId,
        },
      },
    );

    return complaint;
  }
}
