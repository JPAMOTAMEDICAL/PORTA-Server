import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  BillingType,
  CollectionFrequency,
  Facility,
  InvoiceStatus,
  NotificationChannel,
  Prisma,
  Role,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';

type OnboardingFacilityInput = {
  name: string;
  type: Prisma.FacilityUncheckedCreateInput['type'];
  address: string;
  state?: string;
  lga?: string;
  city?: string;
  contactPerson: string;
  phone: string;
  email: string;
  billingType?: BillingType;
  ratePerKg?: number;
  fixedMonthlyRate?: number;
  invoiceCycle?: string;
  collectionFrequency?: CollectionFrequency;
  gpsCoordinates?: string;
  logoUrl?: string;
  password?: string;
  confirmPassword?: string;
  notes?: string;
  initialOutstandingBalance?: number;
  previousDebt?: number;
  previousUnpaidInvoice?: number;
  outstandingReason?: string;
  invoiceDueDate?: string;
  outstandingNotes?: string;
};

type FinancialActionInput = {
  action:
    | 'ADD_OUTSTANDING_BALANCE'
    | 'GENERATE_INVOICE'
    | 'ADJUST_BALANCE'
    | 'WRITE_OFF';
  amount: number;
  reason: string;
  dueDate?: string;
  description?: string;
  adminPassword: string;
};

@Injectable()
export class FacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async create(data: Prisma.FacilityCreateInput): Promise<Facility> {
    return this.prisma.facility.create({
      data,
    });
  }

  async createOnboardingFacility(
    data: OnboardingFacilityInput,
    createdById?: string,
  ) {
    const normalizedEmail = this.normalizeEmail(data.email);
    const password = (data.password?.trim() || this.generateTemporaryPassword())
      .trim();

    if (
      data.password &&
      (data.confirmPassword === undefined ||
        data.password !== data.confirmPassword)
    ) {
      throw new BadRequestException(
        'Password and confirm password must match.',
      );
    }

    this.assertStrongEnoughPassword(password);

    const startingBalance = this.calculateStartingBalance(data);
    const invoiceDueDate = this.resolveDueDate(data.invoiceDueDate);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const passwordHash = await bcrypt.hash(password, 10);
        const settings = await this.prisma.systemSetting.findFirst({
          select: {
            invoicePrefix: true,
          },
        });

        const result = await this.prisma.$transaction(async (tx) => {
          await this.assertFacilityEmailIsAvailable(normalizedEmail, tx);

          const generatedCode = await this.generateFacilityCode(data.name, tx);
          const facility = await tx.facility.create({
            data: {
              name: data.name.trim(),
              code: generatedCode,
              type: data.type,
              address: data.address.trim(),
              city: data.city?.trim() || undefined,
              state: data.state?.trim() || undefined,
              lga: data.lga?.trim() || undefined,
              gpsCoordinates: data.gpsCoordinates?.trim() || undefined,
              logoUrl: data.logoUrl || undefined,
              billingType: data.billingType ?? BillingType.KG_BASED,
              ratePerKg:
                data.ratePerKg !== undefined && data.ratePerKg !== null
                  ? new Prisma.Decimal(data.ratePerKg)
                  : undefined,
              fixedMonthlyRate:
                data.fixedMonthlyRate !== undefined &&
                data.fixedMonthlyRate !== null
                  ? new Prisma.Decimal(data.fixedMonthlyRate)
                  : undefined,
              invoiceCycle: data.invoiceCycle?.trim() || 'MONTHLY',
              collectionFrequency:
                data.collectionFrequency ?? CollectionFrequency.WEEKLY,
              contactPerson: data.contactPerson.trim(),
              phone: data.phone.trim(),
              email: normalizedEmail,
            },
          });

          const account = await tx.user.create({
            data: {
              email: normalizedEmail,
              username: generatedCode.toLowerCase(),
              passwordHash,
              fullName: data.contactPerson.trim(),
              role: Role.HOSPITAL_ADMIN,
              facilityId: facility.id,
              phone: data.phone.trim(),
              status: 'PASSWORD_CHANGE_REQUIRED',
            },
          });

          await this.assignAccessRole(tx, account.id, Role.HOSPITAL_ADMIN);

          let onboardingInvoice: {
            id: string;
            invoiceNo: string;
            amountDue: Prisma.Decimal;
            dueDate: Date;
          } | null = null;

          if (startingBalance > 0) {
            onboardingInvoice = await this.createManualInvoice(tx, {
              facilityId: facility.id,
              amount: startingBalance,
              dueDate: invoiceDueDate,
              generatedById: createdById,
              reason:
                data.outstandingReason?.trim() ||
                'Outstanding balance recorded during onboarding.',
              description: this.buildOutstandingDescription(data),
              invoicePrefix: settings?.invoicePrefix,
            });
          }

          if (createdById) {
            await tx.auditLog.create({
              data: {
                userId: createdById,
                activityType: 'FACILITY_CREATED',
                entityName: 'Facility',
                entityId: facility.id,
                newValues: {
                  facilityId: facility.id,
                  facilityName: facility.name,
                  facilityCode: facility.code,
                  loginUsername: account.username,
                  onboardingInvoiceId: onboardingInvoice?.id ?? null,
                  onboardingInvoiceNo: onboardingInvoice?.invoiceNo ?? null,
                  startingBalance,
                } as never,
                reason: data.notes?.trim() || 'Facility onboarded by admin.',
              },
            });
          }

          return {
            facility,
            account: this.sanitizeUser(account),
            generatedCode,
            onboardingInvoice,
          };
        });

        await this.sendOnboardingEmail({
          facilityName: result.facility.name,
          facilityEmail: result.facility.email,
          contactPerson: result.facility.contactPerson,
          loginUrl:
            this.configService.get<string>('FRONTEND_FACILITY_URL') ||
            'https://portal-facility.vercel.app/login',
          username: result.generatedCode,
          password,
          onboardingInvoice: result.onboardingInvoice
            ? {
                invoiceNo: result.onboardingInvoice.invoiceNo,
                amountDue: Number(result.onboardingInvoice.amountDue),
                dueDate: result.onboardingInvoice.dueDate,
              }
            : null,
        });

        await this.notificationsService.createForRoles(
          [Role.SUPER_ADMIN, Role.OPERATIONS_MANAGER, Role.ACCOUNTANT],
          {
            title: 'Facility onboarded',
            message: `${result.facility.name} was onboarded successfully with facility code ${result.generatedCode}.`,
            type: 'FACILITY_CREATED',
            facilityId: result.facility.id,
            metadata: {
              facilityId: result.facility.id,
              facilityCode: result.generatedCode,
              onboardingInvoiceId: result.onboardingInvoice?.id ?? null,
            },
          },
        );

        return {
          facility: result.facility,
          account: result.account,
          generatedCode: result.generatedCode,
          onboardingInvoice: result.onboardingInvoice,
          generatedPassword: data.password ? undefined : password,
        };
      } catch (error) {
        if (this.isUniqueConstraintError(error)) {
          continue;
        }

        throw error;
      }
    }

    throw new ConflictException(
      'Unable to generate a unique facility code. Please try again.',
    );
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    cursor?: Prisma.FacilityWhereUniqueInput;
    where?: Prisma.FacilityWhereInput;
    orderBy?: Prisma.FacilityOrderByWithRelationInput;
  }): Promise<Facility[]> {
    const { skip, take, cursor, where, orderBy } = params;
    return this.prisma.facility.findMany({
      skip,
      take,
      cursor,
      where: {
        ...where,
        deletedAt: null, // Soft delete filter
      },
      orderBy,
    });
  }

  async findOne(id: string): Promise<Facility> {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
    });
    if (!facility || facility.deletedAt) {
      throw new NotFoundException(`Facility with ID ${id} not found`);
    }
    return facility;
  }

  async update(
    id: string,
    data: Prisma.FacilityUpdateInput,
  ): Promise<Facility> {
    return this.prisma.facility.update({
      where: { id },
      data,
    });
  }

  async softDelete(id: string): Promise<Facility> {
    return this.prisma.facility.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async createFromSignup(data: {
    name: string;
    type: Prisma.FacilityUncheckedCreateInput['type'];
    address: string;
    state: string;
    lga: string;
    city?: string;
    contactPerson: string;
    phone: string;
    email: string;
    code: string;
  }): Promise<Facility> {
    const result = await this.createOnboardingFacility({
      name: data.name,
      type: data.type,
      address: data.address,
      state: data.state,
      lga: data.lga,
      city: data.city,
      contactPerson: data.contactPerson,
      phone: data.phone,
      email: data.email,
      billingType: BillingType.KG_BASED,
      collectionFrequency: CollectionFrequency.WEEKLY,
      ratePerKg: 400,
      invoiceCycle: 'MONTHLY',
      password: this.generateTemporaryPassword(),
      confirmPassword: undefined,
    });

    return result.facility;
  }

  async createFinancialAction(
    facilityId: string,
    adminUserId: string,
    data: FinancialActionInput,
  ) {
    const facility = await this.findOne(facilityId);
    const adminUser = await this.usersService.findById(adminUserId);

    if (!adminUser) {
      throw new NotFoundException('Admin user not found.');
    }

    if (!data.reason?.trim()) {
      throw new BadRequestException('A reason is required.');
    }

    if (!data.adminPassword) {
      throw new BadRequestException(
        'Admin password confirmation is required.',
      );
    }

    const passwordMatches = await bcrypt.compare(
      data.adminPassword,
      adminUser.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'Admin password confirmation is invalid.',
      );
    }

    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount === 0) {
      throw new BadRequestException('Amount must be a valid non-zero number.');
    }

    const dueDate = this.resolveDueDate(data.dueDate);
    const settings = await this.prisma.systemSetting.findFirst({
      select: {
        invoicePrefix: true,
      },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const currentFacility = await tx.facility.findUnique({
        where: {
          id: facilityId,
        },
      });

      if (!currentFacility || currentFacility.deletedAt) {
        throw new NotFoundException(`Facility with ID ${facilityId} not found`);
      }

      const balanceBefore = Number(currentFacility.outstandingBalance ?? 0);
      let balanceAfter = balanceBefore;
      let invoice: {
        id: string;
        invoiceNo: string;
        amountDue: Prisma.Decimal;
        dueDate: Date;
      } | null = null;

      if (
        data.action === 'ADD_OUTSTANDING_BALANCE' ||
        data.action === 'GENERATE_INVOICE' ||
        (data.action === 'ADJUST_BALANCE' && amount > 0)
      ) {
        if (amount <= 0) {
          throw new BadRequestException(
            'Positive invoice amounts are required for this action.',
          );
        }

        invoice = await this.createManualInvoice(tx, {
          facilityId,
          amount,
          dueDate,
          generatedById: adminUserId,
          reason: data.reason.trim(),
          description: data.description?.trim(),
          invoicePrefix: settings?.invoicePrefix,
        });
        balanceAfter += amount;
      } else {
        const deduction = Math.abs(amount);
        if (deduction > balanceBefore) {
          throw new BadRequestException(
            'Adjustment amount exceeds the current outstanding balance.',
          );
        }

        const updatedFacility = await tx.facility.update({
          where: {
            id: facilityId,
          },
          data: {
            outstandingBalance: {
              decrement: new Prisma.Decimal(deduction),
            },
          },
        });
        balanceAfter = Number(updatedFacility.outstandingBalance ?? 0);
      }

      const audit = await tx.auditLog.create({
        data: {
          userId: adminUserId,
          activityType: data.action,
          entityName: 'Facility',
          entityId: facilityId,
          oldValues: {
            outstandingBalance: balanceBefore,
          } as never,
          newValues: {
            outstandingBalance: balanceAfter,
            amount,
            reason: data.reason.trim(),
            description: data.description?.trim() || null,
            invoiceId: invoice?.id ?? null,
            invoiceNo: invoice?.invoiceNo ?? null,
            adminName: adminUser.fullName,
          } as never,
          reason: data.reason.trim(),
        },
      });

      const refreshedFacility = await tx.facility.findUnique({
        where: {
          id: facilityId,
        },
      });

      return {
        facility: refreshedFacility,
        invoice,
        audit,
        balanceBefore,
        balanceAfter,
      };
    });

    if (result.invoice) {
      await this.sendFinancialActionEmail({
        facilityName: facility.name,
        facilityEmail: facility.email,
        contactPerson: facility.contactPerson,
        invoiceNo: result.invoice.invoiceNo,
        amount: Number(result.invoice.amountDue),
        dueDate: result.invoice.dueDate,
        action: data.action,
        reason: data.reason.trim(),
        description: data.description?.trim(),
      });
    }

    return {
      ...result,
      performedBy: adminUser.fullName,
      performedAt: result.audit.createdAt,
    };
  }

  async getTimeline(id: string) {
    await this.findOne(id);

    const [collections, visits, invoices, complaints, approvals] =
      await Promise.all([
        this.prisma.collection.findMany({
          where: { facilityId: id, deletedAt: null },
          orderBy: { collectionTime: 'desc' },
          take: 10,
        }),
        this.prisma.facilityVisit.findMany({
          where: { facilityId: id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.invoice.findMany({
          where: { facilityId: id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.complaint.findMany({
          where: { facilityId: id, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.approvalRequest.findMany({
          where: { facilityId: id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    return { collections, visits, invoices, complaints, approvals };
  }

  async getServiceMonitoring(id: string) {
    const facility = await this.findOne(id);
    const lastCollection = await this.prisma.collection.findFirst({
      where: {
        facilityId: id,
        deletedAt: null,
      },
      orderBy: { collectionTime: 'desc' },
    });

    const now = new Date();
    const expectedDays = this.getExpectedDays(facility.collectionFrequency);
    const lastCollectionDate =
      lastCollection?.collectionTime ?? facility.createdAt;
    const daysSinceLastCollection = Math.floor(
      (now.getTime() - lastCollectionDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const missedCollections =
      expectedDays > 0 && daysSinceLastCollection > expectedDays ? 1 : 0;
    const complianceRate =
      expectedDays > 0
        ? Math.max(
            0,
            Math.min(
              100,
              Math.round(
                (expectedDays / Math.max(daysSinceLastCollection, 1)) * 100,
              ),
            ),
          )
        : 100;

    return {
      facilityId: facility.id,
      slaScore: complianceRate,
      complianceRate,
      missedCollections,
      collectionFrequency: facility.collectionFrequency,
      lastCollectionDate,
      serviceStatus:
        complianceRate >= 80 ? 'GREEN' : complianceRate >= 50 ? 'AMBER' : 'RED',
      outstandingBalance: facility.outstandingBalance,
    };
  }

  private getExpectedDays(frequency: CollectionFrequency) {
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
        return 0;
    }
  }

  private async createManualInvoice(
    tx: Prisma.TransactionClient,
    data: {
      facilityId: string;
      amount: number;
      dueDate: Date;
      generatedById?: string;
      reason: string;
      description?: string;
      invoicePrefix?: string | null;
    },
  ) {
    const invoice = await tx.invoice.create({
      data: {
        facilityId: data.facilityId,
        invoiceNo: this.buildInvoiceNumber(data.invoicePrefix),
        periodStart: new Date(),
        periodEnd: new Date(),
        amountDue: new Prisma.Decimal(data.amount),
        totalWeight: new Prisma.Decimal(0),
        tax: new Prisma.Decimal(0),
        dueDate: data.dueDate,
        generatedById: data.generatedById,
        status: InvoiceStatus.SENT,
        deliveryChannels: {
          source: 'MANUAL_FINANCIAL_ACTION',
          reason: data.reason,
          description: data.description ?? null,
        } as never,
      },
      select: {
        id: true,
        invoiceNo: true,
        amountDue: true,
        dueDate: true,
      },
    });

    await tx.facility.update({
      where: {
        id: data.facilityId,
      },
      data: {
        outstandingBalance: {
          increment: new Prisma.Decimal(data.amount),
        },
      },
    });

    return invoice;
  }

  private async assignAccessRole(
    tx: Prisma.TransactionClient,
    userId: string,
    roleName: Role,
  ) {
    const role = await tx.accessRole.findFirst({
      where: {
        name: roleName,
        isSystem: true,
      },
      select: {
        id: true,
      },
    });

    if (!role) {
      return;
    }

    await tx.userAccessRole.create({
      data: {
        userId,
        roleId: role.id,
      },
    });
  }

  private async assertFacilityEmailIsAvailable(
    email: string,
    tx: Prisma.TransactionClient | PrismaService,
  ) {
    const [existingFacility, existingUser] = await Promise.all([
      tx.facility.findFirst({
        where: {
          email,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      }),
      tx.user.findFirst({
        where: {
          email,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      }),
    ]);

    if (existingFacility) {
      throw new ConflictException(
        'A facility with this email already exists.',
      );
    }

    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }
  }

  private async generateFacilityCode(
    facilityName: string,
    tx: Prisma.TransactionClient | PrismaService,
  ) {
    const normalizedName = facilityName
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase();
    const nameSegment = (normalizedName.slice(0, 3) || 'FAC').padEnd(3, 'X');
    const codes = await tx.facility.findMany({
      where: {
        code: {
          startsWith: 'JPA-',
        },
      },
      select: {
        code: true,
      },
    });
    const nextSequence = codes.reduce((max, record) => {
      const match = record.code.match(/-(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

    return `JPA-${nameSegment}-${String(nextSequence + 1).padStart(4, '0')}`;
  }

  private buildInvoiceNumber(prefix?: string | null) {
    return `${prefix ?? 'INV-'}${Date.now()}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;
  }

  private normalizeEmail(email: string) {
    const normalized = email?.trim().toLowerCase();
    if (!normalized) {
      throw new BadRequestException('Facility email is required.');
    }

    return normalized;
  }

  private calculateStartingBalance(data: OnboardingFacilityInput) {
    const values = [
      data.initialOutstandingBalance,
      data.previousDebt,
      data.previousUnpaidInvoice,
    ].map((value) => this.normalizeMoney(value));

    return values.reduce((sum, value) => sum + value, 0);
  }

  private normalizeMoney(value?: number) {
    if (value === undefined || value === null || value === ('' as never)) {
      return 0;
    }

    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new BadRequestException(
        'Financial amounts must be valid positive numbers.',
      );
    }

    return normalized;
  }

  private resolveDueDate(value?: string) {
    if (!value) {
      return new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    }

    const dueDate = new Date(value);
    if (Number.isNaN(dueDate.getTime())) {
      throw new BadRequestException('Invoice due date is invalid.');
    }

    return dueDate;
  }

  private buildOutstandingDescription(data: OnboardingFacilityInput) {
    const lines = [
      data.initialOutstandingBalance
        ? `Outstanding balance: NGN ${Number(data.initialOutstandingBalance).toFixed(2)}`
        : null,
      data.previousDebt
        ? `Previous debt: NGN ${Number(data.previousDebt).toFixed(2)}`
        : null,
      data.previousUnpaidInvoice
        ? `Previous unpaid invoice: NGN ${Number(data.previousUnpaidInvoice).toFixed(2)}`
        : null,
      data.outstandingReason?.trim()
        ? `Reason: ${data.outstandingReason.trim()}`
        : null,
      data.outstandingNotes?.trim()
        ? `Notes: ${data.outstandingNotes.trim()}`
        : null,
    ].filter(Boolean);

    return lines.join('\n');
  }

  private generateTemporaryPassword() {
    return `JPA@${Math.random().toString(36).slice(-4).toUpperCase()}${Math.floor(
      1000 + Math.random() * 9000,
    )}`;
  }

  private assertStrongEnoughPassword(password: string) {
    if (!password || password.trim().length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long.',
      );
    }
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private sanitizeUser<T extends { passwordHash: string }>(
    user: T,
  ): Omit<T, 'passwordHash'> {
    const { passwordHash, ...safeUser } = user;
    void passwordHash;
    return safeUser;
  }

  private async sendOnboardingEmail(data: {
    facilityName: string;
    facilityEmail: string;
    contactPerson: string;
    loginUrl: string;
    username: string;
    password: string;
    onboardingInvoice:
      | {
          invoiceNo: string;
          amountDue: number;
          dueDate: Date;
        }
      | null;
  }) {
    await this.mailService.sendMail({
      to: data.facilityEmail,
      subject: `Welcome to the JP Amota Facility Portal - ${data.facilityName}`,
      text: [
        `Hello ${data.contactPerson},`,
        '',
        `${data.facilityName} has been onboarded successfully.`,
        `Facility code / username: ${data.username}`,
        `Temporary password: ${data.password}`,
        `Portal login URL: ${data.loginUrl}`,
        data.onboardingInvoice
          ? `Outstanding invoice ${data.onboardingInvoice.invoiceNo} for NGN ${data.onboardingInvoice.amountDue.toFixed(
              2,
            )} is due on ${data.onboardingInvoice.dueDate.toISOString()}.`
          : null,
        '',
        'For security, you must change this password immediately after your first login.',
      ]
        .filter(Boolean)
        .join('\n'),
      html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border:1px solid #d1d5db;border-radius:24px;overflow:hidden;">
        <div style="background:#0b5d3b;color:#ffffff;padding:24px 28px;">
          <h1 style="margin:0;font-size:24px;">Facility Portal Access Ready</h1>
          <p style="margin:8px 0 0;font-size:14px;opacity:0.92;">JP Amota Medical Waste Management</p>
        </div>
        <div style="padding:28px;">
          <p style="margin:0 0 16px;">Hello ${this.escapeHtml(data.contactPerson)},</p>
          <p style="margin:0 0 16px;"><strong>${this.escapeHtml(
            data.facilityName,
          )}</strong> has been created successfully and can now access the facility portal.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr><td style="padding:10px 0;color:#6b7280;">Facility Name</td><td style="padding:10px 0;font-weight:700;">${this.escapeHtml(
              data.facilityName,
            )}</td></tr>
            <tr><td style="padding:10px 0;color:#6b7280;">Username</td><td style="padding:10px 0;font-weight:700;">${this.escapeHtml(
              data.username,
            )}</td></tr>
            <tr><td style="padding:10px 0;color:#6b7280;">Temporary Password</td><td style="padding:10px 0;font-weight:700;">${this.escapeHtml(
              data.password,
            )}</td></tr>
            <tr><td style="padding:10px 0;color:#6b7280;">Portal Login URL</td><td style="padding:10px 0;"><a href="${this.escapeHtml(
              data.loginUrl,
            )}" style="color:#0b5d3b;">${this.escapeHtml(data.loginUrl)}</a></td></tr>
          </table>
          ${
            data.onboardingInvoice
              ? `<div style="margin-top:18px;padding:18px;border-radius:18px;background:#fff7ed;border:1px solid #fdba74;">
          <p style="margin:0 0 8px;font-weight:700;color:#9a3412;">Outstanding Balance Recorded</p>
          <p style="margin:0 0 6px;">Invoice <strong>${this.escapeHtml(
            data.onboardingInvoice.invoiceNo,
          )}</strong> has been created for NGN ${data.onboardingInvoice.amountDue.toFixed(
            2,
          )}.</p>
          <p style="margin:0;">Due date: ${this.escapeHtml(
            data.onboardingInvoice.dueDate.toISOString(),
          )}</p>
        </div>`
              : ''
          }
          <div style="margin-top:20px;padding:18px;border-radius:18px;background:#ecfdf5;border:1px solid #a7f3d0;">
            <p style="margin:0;font-weight:700;color:#065f46;">Security Notice</p>
            <p style="margin:8px 0 0;">You will be required to change this password immediately after your first successful login.</p>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`,
    });
  }

  private async sendFinancialActionEmail(data: {
    facilityName: string;
    facilityEmail: string;
    contactPerson: string;
    invoiceNo: string;
    amount: number;
    dueDate: Date;
    action: FinancialActionInput['action'];
    reason: string;
    description?: string;
  }) {
    await this.mailService.sendMail({
      to: data.facilityEmail,
      subject: `New invoice for ${data.facilityName} - ${data.invoiceNo}`,
      text: [
        `Hello ${data.contactPerson},`,
        '',
        `A ${data.action.toLowerCase().replaceAll('_', ' ')} has been recorded for ${data.facilityName}.`,
        `Invoice number: ${data.invoiceNo}`,
        `Amount: NGN ${data.amount.toFixed(2)}`,
        `Due date: ${data.dueDate.toISOString()}`,
        `Reason: ${data.reason}`,
        data.description ? `Description: ${data.description}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,sans-serif;color:#1f2937;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border:1px solid #d1d5db;border-radius:24px;padding:28px;">
        <h2 style="margin:0 0 16px;color:#0b5d3b;">New financial update</h2>
        <p>Hello ${this.escapeHtml(data.contactPerson)},</p>
        <p>A financial update has been posted for <strong>${this.escapeHtml(
          data.facilityName,
        )}</strong>.</p>
        <ul>
          <li>Invoice number: ${this.escapeHtml(data.invoiceNo)}</li>
          <li>Amount: NGN ${data.amount.toFixed(2)}</li>
          <li>Due date: ${this.escapeHtml(data.dueDate.toISOString())}</li>
          <li>Reason: ${this.escapeHtml(data.reason)}</li>
        </ul>
        ${
          data.description
            ? `<p>${this.escapeHtml(data.description)}</p>`
            : ''
        }
      </div>
    </div>
  </body>
</html>`,
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
}
