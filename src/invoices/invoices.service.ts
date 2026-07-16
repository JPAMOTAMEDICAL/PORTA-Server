import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  InvoiceStatus,
  NotificationChannel,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  async list(facilityId?: string) {
    return this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        facilityId,
      },
      include: {
        facility: true,
        payments: true,
        generatedBy: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        facility: true,
        payments: {
          include: {
            verifiedBy: true,
          },
          orderBy: { paymentDate: 'desc' },
        },
        generatedBy: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    return invoice;
  }

  async create(data: {
    facilityId: string;
    dueDate: string;
    periodStart: string;
    periodEnd: string;
    generatedById?: string;
    status?: InvoiceStatus;
  }) {
    const preview = await this.previewGeneration(data);

    const existing = await this.prisma.invoice.findFirst({
      where: {
        facilityId: data.facilityId,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        deletedAt: null,
      },
      select: {
        id: true,
        invoiceNo: true,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Invoice ${existing.invoiceNo} already exists for the selected billing period.`,
      );
    }

    const settings = await this.prisma.systemSetting.findFirst();
    const invoiceNo = this.buildInvoiceNumber(settings?.invoicePrefix);
    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          facilityId: data.facilityId,
          invoiceNo,
          periodStart: new Date(data.periodStart),
          periodEnd: new Date(data.periodEnd),
          amountDue: new Prisma.Decimal(preview.amountDue),
          totalWeight: new Prisma.Decimal(preview.totalWeight),
          tax: new Prisma.Decimal(preview.tax),
          dueDate: new Date(data.dueDate),
          generatedById: data.generatedById,
          status: data.status ?? InvoiceStatus.DRAFT,
        },
        include: {
          facility: true,
        },
      });

      await tx.facility.update({
        where: { id: created.facilityId },
        data: {
          outstandingBalance: {
            increment: new Prisma.Decimal(created.amountDue),
          },
        },
      });

      return created;
    });

    await this.notificationsService.createForRoles(
      [Role.SUPER_ADMIN, Role.ACCOUNTANT, Role.CLIENT_SERVICE_OFFICER],
      {
        title: 'Invoice generated',
        message: `${invoice.invoiceNo} was created for ${invoice.facility?.name ?? 'facility'}.`,
        type: 'INVOICE_CREATED',
        facilityId: invoice.facilityId,
        metadata: {
          invoiceId: invoice.id,
          amountDue: Number(invoice.amountDue),
        },
      },
    );

    return invoice;
  }

  async previewGeneration(data: {
    facilityId: string;
    periodStart: string;
    periodEnd: string;
    dueDate?: string;
  }) {
    const facility = await this.prisma.facility.findFirst({
      where: {
        id: data.facilityId,
        deletedAt: null,
      },
    });

    if (!facility) {
      throw new NotFoundException('Facility not found.');
    }

    const settings = await this.prisma.systemSetting.findFirst();
    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);
    const collections = await this.prisma.collection.findMany({
      where: {
        facilityId: data.facilityId,
        deletedAt: null,
        collectionTime: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        weightKg: true,
      },
    });

    const totalWeight = collections.reduce(
      (sum, collection) => sum + Number(collection.weightKg ?? 0),
      0,
    );
    const ratePerKg = Number(facility.ratePerKg ?? settings?.kgRate ?? 0);
    const fixedMonthlyRate = Number(facility.fixedMonthlyRate ?? 0);
    const subTotal =
      facility.billingType === 'FIXED'
        ? fixedMonthlyRate
        : totalWeight * ratePerKg;
    const tax = 0;

    return {
      facilityId: facility.id,
      facilityName: facility.name,
      billingType: facility.billingType,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      dueDate: data.dueDate ?? null,
      totalWeight,
      ratePerKg,
      fixedMonthlyRate,
      subTotal,
      tax,
      amountDue: subTotal + tax,
      invoiceNo: this.buildInvoiceNumber(settings?.invoicePrefix),
    };
  }

  async update(
    id: string,
    data: {
      amountDue?: number;
      totalWeight?: number;
      tax?: number;
      dueDate?: string;
      periodStart?: string;
      periodEnd?: string;
      status?: InvoiceStatus;
    },
  ) {
    const existing = await this.findOne(id);
    const previousAmount = Number(existing.amountDue);
    const nextAmount = data.amountDue ?? previousAmount;
    const difference = nextAmount - previousAmount;

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: {
        amountDue:
          data.amountDue !== undefined
            ? new Prisma.Decimal(data.amountDue)
            : undefined,
        totalWeight:
          data.totalWeight !== undefined
            ? new Prisma.Decimal(data.totalWeight)
            : undefined,
        tax: data.tax !== undefined ? new Prisma.Decimal(data.tax) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        periodStart: data.periodStart ? new Date(data.periodStart) : undefined,
        periodEnd: data.periodEnd ? new Date(data.periodEnd) : undefined,
        status: data.status,
      },
      include: {
        facility: true,
        payments: true,
      },
    });

    if (difference !== 0) {
      await this.prisma.facility.update({
        where: { id: invoice.facilityId },
        data: {
          outstandingBalance: {
            increment: new Prisma.Decimal(difference),
          },
        },
      });
    }

    return invoice;
  }

  async send(
    id: string,
    payload: {
      subject: string;
      message: string;
      recipientEmail?: string;
      generate?: boolean;
      saveDraft?: boolean;
    },
  ) {
    const invoice = await this.findOne(id);
    const recipientEmail =
      payload.recipientEmail ?? invoice.facility?.email ?? null;
    const status =
      payload.saveDraft || !payload.generate
        ? InvoiceStatus.DRAFT
        : InvoiceStatus.SENT;

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status,
        lastSentAt: payload.saveDraft ? invoice.lastSentAt : new Date(),
        lastSentTo: recipientEmail,
        deliveryChannels: {
          email: recipientEmail,
          subject: payload.subject,
          preview: payload.message,
          savedAsDraft: payload.saveDraft ?? false,
          generated: payload.generate ?? false,
          lastUpdatedAt: new Date().toISOString(),
        } as never,
      },
      include: {
        facility: true,
        payments: true,
      },
    });

    if (!payload.saveDraft) {
      if (recipientEmail) {
        await this.mailService.sendMail({
          to: recipientEmail,
          subject: payload.subject,
          text: [
            `Invoice ${updated.invoiceNo} is ready for ${updated.facility?.name ?? 'your facility'}.`,
            payload.message,
            `Amount due: NGN ${Number(updated.amountDue).toFixed(2)}.`,
            `Billing period: ${updated.periodStart.toISOString()} to ${updated.periodEnd.toISOString()}.`,
            `Due date: ${updated.dueDate.toISOString()}.`,
          ].join('\n'),
          html: `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
    <h2>${this.escapeHtml(payload.subject)}</h2>
    <p>Invoice <strong>${this.escapeHtml(updated.invoiceNo)}</strong> is ready for <strong>${this.escapeHtml(updated.facility?.name ?? 'your facility')}</strong>.</p>
    <p>${this.escapeHtml(payload.message)}</p>
    <ul>
      <li>Amount due: NGN ${Number(updated.amountDue).toFixed(2)}</li>
      <li>Billing period: ${updated.periodStart.toISOString()} to ${updated.periodEnd.toISOString()}</li>
      <li>Due date: ${updated.dueDate.toISOString()}</li>
    </ul>
  </body>
</html>`,
        });
      }

      await this.notificationsService.createForFacilityUsers(
        updated.facilityId,
        {
          title: 'Invoice sent',
          message: `${updated.invoiceNo} has been sent to ${recipientEmail ?? 'the finance contact'}.`,
          type: 'INVOICE_SENT',
          metadata: {
            invoiceId: updated.id,
            invoiceNo: updated.invoiceNo,
            recipientEmail,
          },
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        },
      );

      await this.notificationsService.createForRoles(
        [Role.SUPER_ADMIN, Role.ACCOUNTANT, Role.CLIENT_SERVICE_OFFICER],
        {
          title: 'Invoice dispatch completed',
          message: `${updated.invoiceNo} was dispatched for ${updated.facility?.name ?? 'facility'}.`,
          type: 'INVOICE_SENT',
          facilityId: updated.facilityId,
          metadata: {
            invoiceId: updated.id,
            invoiceNo: updated.invoiceNo,
            recipientEmail,
          },
        },
      );
    }

    return updated;
  }

  async updateStatus(id: string, status: InvoiceStatus) {
    return this.prisma.invoice.update({
      where: { id },
      data: { status },
    });
  }

  private buildInvoiceNumber(prefix?: string | null) {
    return `${prefix ?? 'INV-'}${Date.now()}`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
