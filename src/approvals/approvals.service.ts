import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(data: {
    type: string;
    entityName: string;
    entityId: string;
    requestedById: string;
    facilityId?: string;
    invoiceId?: string;
    oldValues?: unknown;
    newValues?: unknown;
    reason: string;
  }) {
    return this.prisma.approvalRequest.create({
      data: {
        type: data.type,
        entityName: data.entityName,
        entityId: data.entityId,
        requestedById: data.requestedById,
        facilityId: data.facilityId,
        invoiceId: data.invoiceId,
        oldValues: data.oldValues as never,
        newValues: data.newValues as never,
        reason: data.reason,
        status: ApprovalStatus.PENDING_APPROVAL,
      },
    });
  }

  async list(status?: ApprovalStatus) {
    return this.prisma.approvalRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        facility: true,
        invoice: true,
        requestedBy: true,
        reviewedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async review(
    id: string,
    reviewedById: string,
    decision: ApprovalStatus,
    reviewNotes?: string,
  ) {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: { id },
    });

    if (!approval) {
      throw new NotFoundException('Approval request not found.');
    }

    if (approval.status !== ApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only pending approvals can be reviewed.');
    }

    const updated = await this.prisma.approvalRequest.update({
      where: { id },
      data: {
        status: decision,
        reviewedById,
        reviewedAt: new Date(),
        reviewNotes,
      },
    });

    if (
      decision === ApprovalStatus.APPROVED &&
      approval.entityName === 'facility-pricing' &&
      approval.facilityId
    ) {
      const newValues = (approval.newValues ?? {}) as Record<string, unknown>;
      await this.prisma.facility.update({
        where: { id: approval.facilityId },
        data: {
          ratePerKg:
            typeof newValues.ratePerKg === 'number'
              ? newValues.ratePerKg
              : undefined,
          fixedMonthlyRate:
            typeof newValues.fixedMonthlyRate === 'number'
              ? newValues.fixedMonthlyRate
              : undefined,
        },
      });
    }

    await this.notificationsService.createNotification({
      recipientId: approval.requestedById,
      facilityId: approval.facilityId ?? undefined,
      title: 'Approval updated',
      message: `${approval.type} has been ${decision.toLowerCase().replaceAll('_', ' ')}.${reviewNotes ? ` ${reviewNotes}` : ''}`,
      type: 'APPROVAL_COMPLETED',
    });

    return updated;
  }
}
