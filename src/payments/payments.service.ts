import {
  BadRequestException,
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
import { serializeStoredDocumentReference } from '../documents/document-reference';
import { MailService } from '../mail/mail.service';

type BankAccountRecord = {
  id: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  isDefault: boolean;
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  async list(facilityId?: string) {
    return this.prisma.payment.findMany({
      where: facilityId
        ? {
            deletedAt: null,
            invoice: { facilityId },
          }
        : { deletedAt: null },
      include: {
        invoice: {
          include: {
            facility: true,
          },
        },
        verifiedBy: true,
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async listReceipts(facilityId?: string) {
    return this.prisma.payment.findMany({
      where: {
        deletedAt: null,
        receiptNumber: { not: null },
        ...(facilityId ? { invoice: { facilityId } } : {}),
      },
      include: {
        invoice: {
          include: {
            facility: true,
          },
        },
        verifiedBy: true,
      },
      orderBy: { paymentDate: 'desc' },
    });
  }

  async create(data: {
    invoiceId: string;
    amount: number;
    method: string;
    notes?: string;
    reference?: string;
    proofOfPayment?: unknown;
  }) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: data.invoiceId,
        deletedAt: null,
      },
      include: {
        facility: true,
        payments: {
          where: {
            deletedAt: null,
            status: 'VERIFIED',
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        'Payment amount must be greater than zero.',
      );
    }

    const verifiedTotal = invoice.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const remainingBalance = Math.max(
      0,
      Number(invoice.amountDue) - verifiedTotal,
    );

    if (amount > remainingBalance) {
      throw new BadRequestException(
        `Payment amount exceeds the remaining invoice balance of NGN ${remainingBalance.toFixed(2)}.`,
      );
    }

    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: data.invoiceId,
        amount: new Prisma.Decimal(amount),
        method: data.method,
        notes: data.notes,
        proofOfPayment: serializeStoredDocumentReference(data.proofOfPayment),
        reference: data.reference ?? `PAY-${Date.now()}`,
        status: 'PENDING',
      },
      include: {
        invoice: {
          include: {
            facility: true,
          },
        },
      },
    });

    await this.notificationsService.createForFacilityUsers(
      payment.invoice.facilityId,
      {
        title: 'Payment submitted',
        message: `${payment.reference} was submitted and is awaiting verification.`,
        type: 'PAYMENT_PENDING',
        metadata: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
        },
        channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
      },
    );

    await this.notificationsService.createForRoles(
      [Role.SUPER_ADMIN, Role.ACCOUNTANT],
      {
        title: 'Payment pending verification',
        message: `${payment.invoice.facility?.name ?? 'Facility'} submitted payment ${payment.reference}.`,
        type: 'PAYMENT_PENDING',
        facilityId: payment.invoice.facilityId,
        metadata: {
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
        },
      },
    );

    return payment;
  }

  async initializePaystack(data: {
    invoiceId: string;
    amount: number;
    callbackUrl?: string;
    notes?: string;
  }) {
    const payment = await this.create({
      invoiceId: data.invoiceId,
      amount: data.amount,
      method: 'PAYSTACK',
      notes: data.notes,
      reference: `PSTK-${Date.now()}`,
    });

    return {
      payment,
      authorizationUrl:
        data.callbackUrl ?? `https://paystack.com/pay/${payment.reference}`,
      accessCode: payment.reference,
    };
  }

  async verifyPaystack(reference: string, verifiedById: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        reference,
        deletedAt: null,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment reference not found.');
    }

    return this.review(payment.id, {
      decision: 'APPROVE',
      verifiedById,
      reason: 'Paystack verification completed.',
    });
  }

  async review(
    id: string,
    data: {
      verifiedById: string;
      decision: 'APPROVE' | 'REJECT' | 'REQUEST_CONFIRMATION';
      reason?: string;
    },
  ) {
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        invoice: true,
      },
    });

    if (!existingPayment) {
      throw new NotFoundException('Payment not found.');
    }

    if (data.decision === 'APPROVE') {
      const totalPaid = await this.prisma.payment.aggregate({
        _sum: {
          amount: true,
        },
        where: {
          invoiceId: existingPayment.invoiceId,
          status: 'VERIFIED',
          id: {
            not: id,
          },
        },
      });

      const alreadyVerified = Number(totalPaid._sum.amount ?? 0);
      const invoiceTotal = Number(existingPayment.invoice.amountDue);
      const approvalTotal = alreadyVerified + Number(existingPayment.amount);

      if (approvalTotal > invoiceTotal) {
        const remainingBalance = Math.max(0, invoiceTotal - alreadyVerified);
        throw new BadRequestException(
          `Approving this payment would exceed the invoice balance. Remaining approvable balance is NGN ${remainingBalance.toFixed(2)}.`,
        );
      }
    }

    const payment = await this.prisma.payment.update({
      where: { id },
      data: {
        status:
          data.decision === 'APPROVE'
            ? 'VERIFIED'
            : data.decision === 'REJECT'
              ? 'REJECTED'
              : 'CONFIRMATION_REQUIRED',
        verifiedById: data.verifiedById,
        receiptNumber:
          data.decision === 'APPROVE' ? `RCT-${Date.now()}` : undefined,
        notes: [paymentNotePrefix(data.decision), data.reason]
          .filter(Boolean)
          .join(' '),
      },
      include: {
        invoice: {
          include: {
            facility: true,
          },
        },
      },
    });

    if (data.decision === 'APPROVE') {
      const totalPaid = await this.prisma.payment.aggregate({
        _sum: {
          amount: true,
        },
        where: {
          invoiceId: payment.invoiceId,
          status: 'VERIFIED',
        },
      });

      const paidAmount = Number(totalPaid._sum.amount ?? 0);
      const invoiceTotal = Number(payment.invoice.amountDue);

      await this.prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          status:
            paidAmount >= invoiceTotal
              ? InvoiceStatus.PAID
              : InvoiceStatus.SENT,
        },
      });

      await this.prisma.facility.update({
        where: { id: payment.invoice.facilityId },
        data: {
          outstandingBalance: {
            decrement: new Prisma.Decimal(payment.amount),
          },
        },
      });

      await this.notificationsService.createForFacilityUsers(
        payment.invoice.facilityId,
        {
          title: 'Payment approved',
          message: `Payment ${payment.reference} was approved and receipt ${payment.receiptNumber} is ready.`,
          type: 'PAYMENT_APPROVED',
          metadata: {
            paymentId: payment.id,
            receiptNumber: payment.receiptNumber,
          },
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        },
      );

      await this.notificationsService.createForRoles(
        [Role.SUPER_ADMIN, Role.ACCOUNTANT, Role.CLIENT_SERVICE_OFFICER],
        {
          title: 'Receipt generated',
          message: `Receipt ${payment.receiptNumber} was generated for ${payment.invoice.facility?.name ?? 'facility'}.`,
          type: 'RECEIPT_GENERATED',
          facilityId: payment.invoice.facilityId,
          metadata: {
            paymentId: payment.id,
            receiptNumber: payment.receiptNumber,
          },
        },
      );
    } else {
      await this.notificationsService.createForFacilityUsers(
        payment.invoice.facilityId,
        {
          title:
            data.decision === 'REJECT'
              ? 'Payment rejected'
              : 'Payment needs confirmation',
          message:
            data.decision === 'REJECT'
              ? `Payment ${payment.reference} was rejected. ${data.reason ?? 'Please contact finance.'}`
              : `Payment ${payment.reference} requires confirmation. ${data.reason ?? 'Finance needs more information.'}`,
          type:
            data.decision === 'REJECT' ? 'PAYMENT_REJECTED' : 'PAYMENT_PENDING',
          metadata: {
            paymentId: payment.id,
            decision: data.decision,
          },
          channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        },
      );
    }

    return payment;
  }

  async sendReceipt(
    id: string,
    data: {
      audiences: string[];
      channels?: NotificationChannel[];
      message?: string;
    },
  ) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            facility: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found.');
    }

    const message =
      data.message ??
      `Receipt ${payment.receiptNumber ?? 'pending'} is available for invoice ${payment.invoice.invoiceNo}.`;

    if (
      data.audiences.includes('FACILITY') &&
      (data.channels ?? []).includes(NotificationChannel.EMAIL) &&
      payment.invoice.facility?.email
    ) {
      await this.mailService.sendMail({
        to: payment.invoice.facility.email,
        subject: `Receipt ${payment.receiptNumber ?? payment.reference}`,
        text: [
          `Receipt ${payment.receiptNumber ?? payment.reference} is available for invoice ${payment.invoice.invoiceNo}.`,
          message,
          `Amount received: NGN ${Number(payment.amount).toFixed(2)}.`,
          `Payment reference: ${payment.reference}.`,
        ].join('\n'),
        html: `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
    <h2>Receipt ${this.escapeHtml(payment.receiptNumber ?? payment.reference)}</h2>
    <p>${this.escapeHtml(message)}</p>
    <ul>
      <li>Invoice: ${this.escapeHtml(payment.invoice.invoiceNo)}</li>
      <li>Amount received: NGN ${Number(payment.amount).toFixed(2)}</li>
      <li>Payment reference: ${this.escapeHtml(payment.reference)}</li>
    </ul>
  </body>
</html>`,
      });
    }

    if (data.audiences.includes('FACILITY')) {
      await this.notificationsService.createForFacilityUsers(
        payment.invoice.facilityId,
        {
          title: 'Receipt sent',
          message,
          type: 'RECEIPT_SENT',
          metadata: {
            paymentId: payment.id,
            receiptNumber: payment.receiptNumber,
          },
          channels: data.channels ?? [
            NotificationChannel.IN_APP,
            NotificationChannel.EMAIL,
          ],
        },
      );
    }

    const roleMap: Record<string, Role> = {
      DRIVER: Role.DRIVER,
      CLIENT_SERVICE_OFFICER: Role.CLIENT_SERVICE_OFFICER,
      OPERATIONS_MANAGER: Role.OPERATIONS_MANAGER,
      ACCOUNTANT: Role.ACCOUNTANT,
      SUPER_ADMIN: Role.SUPER_ADMIN,
    };

    const roles = data.audiences
      .map((audience) => roleMap[audience])
      .filter(Boolean);

    if (roles.length > 0) {
      await this.notificationsService.createForRoles(roles, {
        title: 'Receipt shared',
        message,
        type: 'RECEIPT_SENT',
        facilityId: payment.invoice.facilityId,
        metadata: {
          paymentId: payment.id,
          receiptNumber: payment.receiptNumber,
        },
        channel: data.channels?.[0] ?? NotificationChannel.IN_APP,
      });
    }

    return this.prisma.payment.update({
      where: { id },
      data: {
        receiptDelivery: {
          audiences: data.audiences,
          channels: data.channels ?? [NotificationChannel.IN_APP],
          status: 'SENT',
          updatedAt: new Date().toISOString(),
        } as never,
      },
      include: {
        invoice: {
          include: {
            facility: true,
          },
        },
      },
    });
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }


  async listBankAccounts() {
    const settings = await this.prisma.systemSetting.findFirst();
    return (
      (settings?.bankAccounts as BankAccountRecord[] | null) ?? []
    ).filter(Boolean);
  }

  async saveBankAccount(data: {
    id?: string;
    bankName: string;
    accountName: string;
    accountNumber: string;
    isDefault?: boolean;
  }) {
    const settings = await this.ensureSettings();
    const accounts = (
      (settings.bankAccounts as BankAccountRecord[] | null) ?? []
    ).filter(Boolean);
    const accountId = data.id ?? `bank-${Date.now()}`;
    const nextAccounts = accounts
      .filter((account) => account.id !== accountId)
      .map((account) => ({
        ...account,
        isDefault: data.isDefault ? false : account.isDefault,
      }));

    nextAccounts.unshift({
      id: accountId,
      bankName: data.bankName,
      accountName: data.accountName,
      accountNumber: data.accountNumber,
      isDefault: data.isDefault ?? accounts.length === 0,
    });

    const updated = await this.prisma.systemSetting.update({
      where: { id: settings.id },
      data: {
        bankAccounts: nextAccounts as never,
      },
    });

    return (updated.bankAccounts as BankAccountRecord[] | null) ?? [];
  }

  async deleteBankAccount(id: string) {
    const settings = await this.ensureSettings();
    const accounts = (
      (settings.bankAccounts as BankAccountRecord[] | null) ?? []
    ).filter(Boolean);
    const nextAccounts = accounts.filter((account) => account.id !== id);
    const normalized =
      nextAccounts.some((account) => account.isDefault) ||
      nextAccounts.length === 0
        ? nextAccounts
        : nextAccounts.map((account, index) => ({
            ...account,
            isDefault: index === 0,
          }));

    const updated = await this.prisma.systemSetting.update({
      where: { id: settings.id },
      data: {
        bankAccounts: normalized as never,
      },
    });

    return (updated.bankAccounts as BankAccountRecord[] | null) ?? [];
  }

  async setDefaultBankAccount(id: string) {
    const settings = await this.ensureSettings();
    const accounts = (
      (settings.bankAccounts as BankAccountRecord[] | null) ?? []
    ).filter(Boolean);
    const updated = await this.prisma.systemSetting.update({
      where: { id: settings.id },
      data: {
        bankAccounts: accounts.map((account) => ({
          ...account,
          isDefault: account.id === id,
        })) as never,
      },
    });

    return (updated.bankAccounts as BankAccountRecord[] | null) ?? [];
  }

  private async ensureSettings() {
    const existing = await this.prisma.systemSetting.findFirst();
    if (existing) {
      return existing;
    }

    return this.prisma.systemSetting.create({
      data: {
        companyName: 'JP Amota Medical Waste Operations',
        address: 'Lagos, Nigeria',
        bankAccounts: [] as never,
      },
    });
  }
}

function paymentNotePrefix(
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_CONFIRMATION',
) {
  if (decision === 'APPROVE') {
    return '[APPROVED]';
  }

  if (decision === 'REJECT') {
    return '[REJECTED]';
  }

  return '[CONFIRMATION REQUIRED]';
}
