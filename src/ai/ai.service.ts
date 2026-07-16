import { Injectable } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AiService {
  constructor(private prisma: PrismaService) {}

  /**
   * Mock implementation of Route Optimization.
   * In a production environment, this would call a Python microservice
   * or a library like Google OR-Tools.
   */
  async optimizeRoute(facilityIds: string[]) {
    const facilities = await this.prisma.facility.findMany({
      where: {
        id: { in: facilityIds },
      },
    });

    // Simple nearest-neighbor mock logic
    const optimized = facilities.sort(() => {
      // Logic would go here to calculate distances based on gpsCoordinates
      return 0;
    });

    return optimized.map((f, index) => ({
      facilityId: f.id,
      sequence: index + 1,
    }));
  }

  /**
   * Predicts waste volume for a facility based on history.
   */
  async predictWasteVolume(facilityId: string) {
    const history = await this.prisma.collection.findMany({
      where: { facilityId },
      orderBy: { collectionTime: 'desc' },
      take: 10,
    });

    if (history.length === 0) return 0;

    const sum = history.reduce((acc, curr) => acc + Number(curr.weightKg), 0);
    return sum / history.length; // Simple moving average prediction
  }

  async detectMissingCollections() {
    const facilities = await this.prisma.facility.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
    });

    const results: Array<{
      facilityId: string;
      facilityName: string;
      daysSinceCollection: number;
      threshold: number;
      status: string;
    }> = [];
    for (const facility of facilities) {
      const lastCollection = await this.prisma.collection.findFirst({
        where: { facilityId: facility.id, deletedAt: null },
        orderBy: { collectionTime: 'desc' },
      });

      const daysSinceCollection = lastCollection
        ? Math.floor(
            (Date.now() - lastCollection.collectionTime.getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : 999;

      const threshold =
        facility.collectionFrequency === 'TWICE_WEEKLY'
          ? 3
          : facility.collectionFrequency === 'WEEKLY'
            ? 7
            : facility.collectionFrequency === 'BI_WEEKLY'
              ? 14
              : 30;

      if (daysSinceCollection > threshold) {
        results.push({
          facilityId: facility.id,
          facilityName: facility.name,
          daysSinceCollection,
          threshold,
          status: 'OVERDUE',
        });
      }
    }

    return results;
  }

  async monitorInvoices() {
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const facilities = await this.prisma.facility.findMany({
      where: { deletedAt: null },
      include: {
        invoices: {
          where: {
            periodStart: { gte: periodStart },
            deletedAt: null,
          },
        },
      },
    });

    return facilities
      .filter((facility) => facility.invoices.length === 0)
      .map((facility) => ({
        facilityId: facility.id,
        facilityName: facility.name,
        issue: 'MISSING_CURRENT_PERIOD_INVOICE',
      }));
  }

  async monitorPayments() {
    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        dueDate: { lt: new Date() },
        status: {
          in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.DRAFT],
        },
      },
      include: {
        facility: true,
      },
    });

    return overdueInvoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      facilityName: invoice.facility.name,
      amountDue: invoice.amountDue,
      dueDate: invoice.dueDate,
    }));
  }

  async detectRiskFacilities() {
    const facilities = await this.prisma.facility.findMany({
      where: { deletedAt: null },
    });

    const riskResults: Array<{
      facilityId: string;
      facilityName: string;
      predictedWeight: number;
      currentWeight: number;
      deviation: number;
      riskLevel: string;
    }> = [];
    for (const facility of facilities) {
      const prediction = Number(await this.predictWasteVolume(facility.id));
      const latest = await this.prisma.collection.findFirst({
        where: { facilityId: facility.id, deletedAt: null },
        orderBy: { collectionTime: 'desc' },
      });

      if (!latest) {
        continue;
      }

      const currentWeight = Number(latest.weightKg);
      const deviation =
        prediction === 0
          ? 0
          : Math.abs(currentWeight - prediction) / prediction;

      if (deviation >= 0.5) {
        riskResults.push({
          facilityId: facility.id,
          facilityName: facility.name,
          predictedWeight: prediction,
          currentWeight,
          deviation,
          riskLevel: deviation >= 1 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    return riskResults;
  }

  async dailyAssistant() {
    return this.buildAssistantReport('daily');
  }

  async weeklyAssistant() {
    return this.buildAssistantReport('weekly');
  }

  async monthlyAssistant() {
    return this.buildAssistantReport('monthly');
  }

  private async buildAssistantReport(period: 'daily' | 'weekly' | 'monthly') {
    const [overdueCollections, overduePayments, missingInvoices] =
      await Promise.all([
        this.detectMissingCollections(),
        this.monitorPayments(),
        this.monitorInvoices(),
      ]);

    const collectionsWindowDays =
      period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const visitsWindowDays =
      period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const sinceDate = new Date(
      Date.now() - collectionsWindowDays * 24 * 60 * 60 * 1000,
    );

    const [recentCollections, recentVisits, openComplaints] = await Promise.all(
      [
        this.prisma.collection.findMany({
          where: {
            deletedAt: null,
            collectionTime: { gte: sinceDate },
          },
          include: {
            facility: true,
          },
          orderBy: { collectionTime: 'desc' },
        }),
        this.prisma.facilityVisit.findMany({
          where: {
            deletedAt: null,
            createdAt: {
              gte: new Date(
                Date.now() - visitsWindowDays * 24 * 60 * 60 * 1000,
              ),
            },
          },
          include: {
            facility: true,
            staff: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.complaint.findMany({
          where: {
            deletedAt: null,
            status: { in: ['OPEN', 'IN_PROGRESS', 'ESCALATED'] },
          },
          include: {
            facility: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
      ],
    );

    return {
      period,
      date: new Date(),
      overdueCollections,
      overduePayments,
      missingInvoices,
      totals: {
        collections: recentCollections.length,
        visits: recentVisits.length,
        openComplaints: openComplaints.length,
      },
      recentCollections,
      recentVisits,
      openComplaints,
    };
  }
}
