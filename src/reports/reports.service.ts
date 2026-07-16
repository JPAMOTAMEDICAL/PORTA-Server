import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type ReportRange = 'daily' | 'weekly' | 'monthly' | 'yearly';

type DailyRecord = {
  hospital: string;
  date: string;
  time: string;
  kg: number;
  wasteType: string;
  collectionStaff: string;
  driver: string;
  vehicle: string;
  manifestNumber: string;
  invoiceNumber: string;
  paymentStatus: string;
  remarks: string;
};

type WeeklyRecord = {
  hospital: string;
  totalKg: number;
  totalCollections: number;
  totalRevenue: number;
  outstandingBalance: number;
  trend: string;
};

type MonthlyRecord = {
  hospital: string;
  totalKg: number;
  totalCollections: number;
  totalRevenue: number;
  totalPayments: number;
  outstandingBalance: number;
  complaints: number;
  lastCollectionDate: string | null;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardSummary() {
    const [facilities, collections, openInvoices, payments] = await Promise.all(
      [
        this.prisma.facility.count({ where: { deletedAt: null } }),
        this.prisma.collection.aggregate({
          _sum: { weightKg: true },
          where: { deletedAt: null },
        }),
        this.prisma.invoice.count({
          where: {
            deletedAt: null,
            status: {
              in: [
                InvoiceStatus.DRAFT,
                InvoiceStatus.SENT,
                InvoiceStatus.OVERDUE,
              ],
            },
          },
        }),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { deletedAt: null },
        }),
      ],
    );

    return {
      facilities,
      totalCollectedKg: collections._sum.weightKg ?? 0,
      openInvoices,
      totalPayments: payments._sum.amount ?? 0,
    };
  }

  async getOperationalReport(
    range: ReportRange,
    startDate?: string,
    endDate?: string,
  ) {
    const { since, until, previousSince, previousUntil } =
      this.resolveReportWindow(range, startDate, endDate);

    const [collections, previousCollections, visits, payments, invoices, complaints] =
      await Promise.all([
        this.prisma.collection.findMany({
          where: {
            deletedAt: null,
            collectionTime: { gte: since, lte: until },
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
          orderBy: { collectionTime: 'asc' },
        }),
        range === 'weekly'
          ? this.prisma.collection.findMany({
              where: {
                deletedAt: null,
                collectionTime: { gte: previousSince, lte: previousUntil },
              },
              include: { facility: true },
            })
          : Promise.resolve([]),
        this.prisma.facilityVisit.findMany({
          where: {
            deletedAt: null,
            createdAt: { gte: since, lte: until },
          },
          include: { facility: true, staff: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.payment.findMany({
          where: {
            deletedAt: null,
            paymentDate: { gte: since, lte: until },
          },
          include: {
            invoice: {
              include: {
                facility: true,
                payments: true,
              },
            },
            verifiedBy: true,
          },
          orderBy: { paymentDate: 'desc' },
        }),
        this.prisma.invoice.findMany({
          where: {
            deletedAt: null,
            OR: [
              {
                createdAt: { gte: since, lte: until },
              },
              {
                periodStart: { lte: until },
                periodEnd: { gte: since },
              },
            ],
          },
          include: {
            facility: true,
            generatedBy: true,
            payments: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.complaint.findMany({
          where: {
            deletedAt: null,
            createdAt: { gte: since, lte: until },
          },
          include: { facility: true, assignedTo: true, submittedBy: true },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    const totalCollectedKg = collections.reduce(
      (sum, collection) => sum + Number(collection.weightKg),
      0,
    );
    const totalPayments = payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const totalInvoiced = invoices.reduce(
      (sum, invoice) => sum + Number(invoice.amountDue),
      0,
    );
    const overdueInvoices = invoices.filter(
      (invoice) => invoice.status === InvoiceStatus.OVERDUE,
    ).length;
    const dailyRecords = this.buildDailyRecords(collections, invoices);
    const weeklyRecords = this.buildWeeklyRecords(
      collections,
      previousCollections,
      invoices,
    );
    const monthlyRecords = this.buildMonthlyRecords(
      collections,
      invoices,
      payments,
      complaints,
    );

    return {
      range,
      generatedAt: new Date(),
      since,
      until,
      totals: {
        totalCollectedKg,
        collections: collections.length,
        visits: visits.length,
        payments: payments.length,
        invoices: invoices.length,
        complaints: complaints.length,
        totalPayments,
        totalInvoiced,
        overdueInvoices,
      },
      collections,
      visits,
      payments,
      invoices,
      complaints,
      dailyRecords,
      weeklyRecords,
      monthlyRecords,
    };
  }

  async getFinanceSummary() {
    const [invoices, payments, facilities, visits] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { deletedAt: null },
        include: { facility: true, payments: true },
      }),
      this.prisma.payment.findMany({
        where: { deletedAt: null },
        include: {
          invoice: {
            include: {
              facility: true,
            },
          },
          verifiedBy: true,
        },
      }),
      this.prisma.facility.findMany({
        where: { deletedAt: null },
      }),
      this.prisma.facilityVisit.findMany({
        where: { deletedAt: null },
        include: { facility: true, staff: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    const grouped = facilities.map((facility) => {
      const facilityInvoices = invoices.filter(
        (invoice) => invoice.facilityId === facility.id,
      );
      const facilityPayments = payments.filter(
        (payment) =>
          payment.invoice?.facilityId === facility.id &&
          payment.status === 'VERIFIED',
      );
      const lastVisit = visits.find(
        (visit) => visit.facilityId === facility.id,
      );

      return {
        facilityId: facility.id,
        facilityName: facility.name,
        outstandingAmount: Number(facility.outstandingBalance ?? 0),
        openInvoices: facilityInvoices.filter(
          (invoice) => invoice.status !== InvoiceStatus.PAID,
        ).length,
        totalPaid: facilityPayments.reduce(
          (sum, payment) => sum + Number(payment.amount),
          0,
        ),
        lastPayment: facilityPayments[0]?.paymentDate ?? null,
        lastVisit: lastVisit?.createdAt ?? null,
        riskLevel:
          Number(facility.outstandingBalance ?? 0) > 500000
            ? 'HIGH'
            : Number(facility.outstandingBalance ?? 0) > 100000
              ? 'MEDIUM'
              : 'LOW',
        followUpStatus:
          Number(facility.outstandingBalance ?? 0) > 0
            ? 'FOLLOW_UP_REQUIRED'
            : 'CLEAR',
      };
    });

    return {
      generatedAt: new Date(),
      totals: {
        facilities: grouped.length,
        outstandingAmount: grouped.reduce(
          (sum, item) => sum + item.outstandingAmount,
          0,
        ),
        openInvoices: grouped.reduce((sum, item) => sum + item.openInvoices, 0),
      },
      accounts: grouped.sort(
        (left, right) => right.outstandingAmount - left.outstandingAmount,
      ),
    };
  }

  private buildDailyRecords(
    collections: Array<{
      collectionTime: Date;
      weightKg: unknown;
      wasteType: string;
      manifestNo: string;
      notes: string | null;
      facility: { name: string } | null;
      driver: { fullName: string } | null;
      route:
        | {
            vehicle: { plateNumber: string } | null;
            createdBy: { fullName: string } | null;
            status: string;
          }
        | null;
    }>,
    invoices: Array<{
      invoiceNo: string;
      facilityId: string;
      periodStart: Date;
      periodEnd: Date;
      status: InvoiceStatus;
      facility: { name: string } | null;
      payments: Array<{ status: string }>;
    }>,
  ): DailyRecord[] {
    return collections.map((collection) => {
      const relatedInvoice =
        invoices.find(
          (invoice) =>
            invoice.facility?.name === collection.facility?.name &&
            collection.collectionTime >= invoice.periodStart &&
            collection.collectionTime <= invoice.periodEnd,
        ) ?? null;

      return {
        hospital: collection.facility?.name ?? 'Unknown facility',
        date: collection.collectionTime.toISOString(),
        time: collection.collectionTime.toISOString(),
        kg: Number(collection.weightKg ?? 0),
        wasteType: collection.wasteType,
        collectionStaff:
          collection.route?.createdBy?.fullName ??
          collection.driver?.fullName ??
          'System',
        driver: collection.driver?.fullName ?? 'Unassigned',
        vehicle: collection.route?.vehicle?.plateNumber ?? 'Unassigned',
        manifestNumber: collection.manifestNo,
        invoiceNumber: relatedInvoice?.invoiceNo ?? 'Not generated',
        paymentStatus: relatedInvoice
          ? this.resolveInvoicePaymentStatus(relatedInvoice)
          : 'NOT_INVOICED',
        remarks: collection.notes ?? collection.route?.status ?? 'N/A',
      };
    });
  }

  private buildWeeklyRecords(
    collections: Array<{
      facilityId: string;
      weightKg: unknown;
      facility: { name: string; outstandingBalance?: unknown } | null;
    }>,
    previousCollections: Array<{
      facilityId: string;
      weightKg: unknown;
    }>,
    invoices: Array<{
      facilityId: string;
      amountDue: unknown;
      facility: { name: string; outstandingBalance?: unknown } | null;
    }>,
  ): WeeklyRecord[] {
    const records = new Map<
      string,
      {
        hospital: string;
        totalKg: number;
        totalCollections: number;
        totalRevenue: number;
        outstandingBalance: number;
      }
    >();

    for (const collection of collections) {
      const current = records.get(collection.facilityId) ?? {
        hospital: collection.facility?.name ?? 'Unknown facility',
        totalKg: 0,
        totalCollections: 0,
        totalRevenue: 0,
        outstandingBalance: Number(collection.facility?.outstandingBalance ?? 0),
      };
      current.totalKg += Number(collection.weightKg ?? 0);
      current.totalCollections += 1;
      records.set(collection.facilityId, current);
    }

    for (const invoice of invoices) {
      const current = records.get(invoice.facilityId) ?? {
        hospital: invoice.facility?.name ?? 'Unknown facility',
        totalKg: 0,
        totalCollections: 0,
        totalRevenue: 0,
        outstandingBalance: Number(invoice.facility?.outstandingBalance ?? 0),
      };
      current.totalRevenue += Number(invoice.amountDue ?? 0);
      current.outstandingBalance = Number(
        invoice.facility?.outstandingBalance ?? current.outstandingBalance,
      );
      records.set(invoice.facilityId, current);
    }

    const previousTotals = previousCollections.reduce<Record<string, number>>(
      (accumulator, collection) => {
        accumulator[collection.facilityId] =
          (accumulator[collection.facilityId] ?? 0) +
          Number(collection.weightKg ?? 0);
        return accumulator;
      },
      {},
    );

    return [...records.entries()]
      .map(([facilityId, item]) => ({
        hospital: item.hospital,
        totalKg: Number(item.totalKg.toFixed(2)),
        totalCollections: item.totalCollections,
        totalRevenue: Number(item.totalRevenue.toFixed(2)),
        outstandingBalance: Number(item.outstandingBalance.toFixed(2)),
        trend: this.buildTrendLabel(previousTotals[facilityId] ?? 0, item.totalKg),
      }))
      .sort((left, right) => right.totalKg - left.totalKg);
  }

  private buildMonthlyRecords(
    collections: Array<{
      facilityId: string;
      collectionTime: Date;
      weightKg: unknown;
      facility: { name: string; outstandingBalance?: unknown } | null;
    }>,
    invoices: Array<{
      facilityId: string;
      amountDue: unknown;
      facility: { name: string; outstandingBalance?: unknown } | null;
    }>,
    payments: Array<{
      amount: unknown;
      status: string;
      invoice: { facilityId: string } | null;
    }>,
    complaints: Array<{
      facilityId: string;
    }>,
  ): MonthlyRecord[] {
    const records = new Map<
      string,
      {
        hospital: string;
        totalKg: number;
        totalCollections: number;
        totalRevenue: number;
        totalPayments: number;
        outstandingBalance: number;
        complaints: number;
        lastCollectionDate: string | null;
      }
    >();

    for (const collection of collections) {
      const current = records.get(collection.facilityId) ?? {
        hospital: collection.facility?.name ?? 'Unknown facility',
        totalKg: 0,
        totalCollections: 0,
        totalRevenue: 0,
        totalPayments: 0,
        outstandingBalance: Number(collection.facility?.outstandingBalance ?? 0),
        complaints: 0,
        lastCollectionDate: null,
      };
      current.totalKg += Number(collection.weightKg ?? 0);
      current.totalCollections += 1;
      current.lastCollectionDate = collection.collectionTime.toISOString();
      records.set(collection.facilityId, current);
    }

    for (const invoice of invoices) {
      const current = records.get(invoice.facilityId) ?? {
        hospital: invoice.facility?.name ?? 'Unknown facility',
        totalKg: 0,
        totalCollections: 0,
        totalRevenue: 0,
        totalPayments: 0,
        outstandingBalance: Number(invoice.facility?.outstandingBalance ?? 0),
        complaints: 0,
        lastCollectionDate: null,
      };
      current.totalRevenue += Number(invoice.amountDue ?? 0);
      current.outstandingBalance = Number(
        invoice.facility?.outstandingBalance ?? current.outstandingBalance,
      );
      records.set(invoice.facilityId, current);
    }

    for (const payment of payments) {
      if (!payment.invoice?.facilityId) {
        continue;
      }

      const current = records.get(payment.invoice.facilityId);
      if (!current) {
        continue;
      }

      current.totalPayments += Number(payment.amount ?? 0);
    }

    for (const complaint of complaints) {
      const current = records.get(complaint.facilityId);
      if (!current) {
        continue;
      }

      current.complaints += 1;
    }

    return [...records.values()]
      .map((item) => ({
        hospital: item.hospital,
        totalKg: Number(item.totalKg.toFixed(2)),
        totalCollections: item.totalCollections,
        totalRevenue: Number(item.totalRevenue.toFixed(2)),
        totalPayments: Number(item.totalPayments.toFixed(2)),
        outstandingBalance: Number(item.outstandingBalance.toFixed(2)),
        complaints: item.complaints,
        lastCollectionDate: item.lastCollectionDate,
      }))
      .sort((left, right) => right.totalRevenue - left.totalRevenue);
  }

  private resolveInvoicePaymentStatus(invoice: {
    status: InvoiceStatus;
    payments: Array<{ status: string }>;
  }) {
    if (invoice.payments.some((payment) => payment.status === 'VERIFIED')) {
      return 'PAID';
    }

    if (invoice.status === InvoiceStatus.OVERDUE) {
      return 'OVERDUE';
    }

    if (invoice.status === InvoiceStatus.PAID) {
      return 'PAID';
    }

    if (invoice.status === InvoiceStatus.SENT) {
      return 'PENDING';
    }

    return invoice.status;
  }

  private buildTrendLabel(previousKg: number, currentKg: number) {
    if (previousKg === 0 && currentKg > 0) {
      return 'NEW_ACTIVITY';
    }

    if (currentKg > previousKg) {
      return 'UP';
    }

    if (currentKg < previousKg) {
      return 'DOWN';
    }

    return 'STABLE';
  }

  private resolveReportWindow(
    range: ReportRange,
    startDate?: string,
    endDate?: string,
  ) {
    const now = new Date();

    if (startDate || endDate) {
      const since = this.startOfDay(startDate ? new Date(startDate) : now);
      const until = this.endOfDay(endDate ? new Date(endDate) : since);
      const lengthMs = until.getTime() - since.getTime();

      return {
        since,
        until,
        previousSince: new Date(since.getTime() - lengthMs - 1),
        previousUntil: new Date(since.getTime() - 1),
      };
    }

    if (range === 'daily') {
      const since = this.startOfDay(now);
      const until = this.endOfDay(now);
      return {
        since,
        until,
        previousSince: this.startOfDay(this.addDays(now, -1)),
        previousUntil: this.endOfDay(this.addDays(now, -1)),
      };
    }

    if (range === 'weekly') {
      const since = this.startOfWeek(now);
      const until = this.endOfWeek(now);
      const previousWeek = this.addDays(since, -7);
      return {
        since,
        until,
        previousSince: this.startOfWeek(previousWeek),
        previousUntil: this.endOfWeek(previousWeek),
      };
    }

    if (range === 'monthly') {
      const since = this.startOfMonth(now);
      const until = this.endOfMonth(now);
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        since,
        until,
        previousSince: this.startOfMonth(previousMonth),
        previousUntil: this.endOfMonth(previousMonth),
      };
    }

    const since = new Date(now.getFullYear(), 0, 1);
    const until = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    const previousYear = new Date(now.getFullYear() - 1, 0, 1);
    return {
      since,
      until,
      previousSince: new Date(previousYear.getFullYear(), 0, 1),
      previousUntil: new Date(previousYear.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }

  private startOfDay(date: Date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      0,
      0,
      0,
      0,
    );
  }

  private endOfDay(date: Date) {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      23,
      59,
      59,
      999,
    );
  }

  private startOfWeek(date: Date) {
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    return this.startOfDay(this.addDays(date, diff));
  }

  private endOfWeek(date: Date) {
    return this.endOfDay(this.addDays(this.startOfWeek(date), 6));
  }

  private startOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  }

  private endOfMonth(date: Date) {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  private addDays(date: Date, amount: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + amount);
    return next;
  }
}
