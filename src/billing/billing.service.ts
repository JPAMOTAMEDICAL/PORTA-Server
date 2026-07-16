import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, BillingType } from '@prisma/client';

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async generateMonthlyInvoices(month: number, year: number) {
    const facilities = await this.prisma.facility.findMany({
      where: { deletedAt: null },
    });

    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    for (const facility of facilities) {
      let amountDue = new Prisma.Decimal(0);
      let totalWeight = new Prisma.Decimal(0);

      if (facility.billingType === BillingType.KG_BASED) {
        const collections = await this.prisma.collection.findMany({
          where: {
            facilityId: facility.id,
            collectionTime: {
              gte: periodStart,
              lte: periodEnd,
            },
            status: 'COMPLETED',
          },
        });

        totalWeight = collections.reduce(
          (sum, c) => sum.add(c.weightKg),
          new Prisma.Decimal(0),
        );

        // Get current KG rate from settings
        const settings = await this.prisma.systemSetting.findFirst();
        const rate = settings?.kgRate || new Prisma.Decimal(400);
        amountDue = totalWeight.mul(rate);
      } else {
        // FIXED billing
        amountDue = facility.fixedMonthlyRate || new Prisma.Decimal(0);
      }

      const tax = amountDue.mul(0.075); // Example 7.5% tax
      const totalWithTax = amountDue.add(tax);

      await this.prisma.invoice.create({
        data: {
          facilityId: facility.id,
          invoiceNo: `INV-${facility.id.substring(0, 4)}-${Date.now()}`,
          periodStart,
          periodEnd,
          totalWeight,
          amountDue: totalWithTax,
          tax,
          status: 'DRAFT',
          dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
        },
      });
    }
  }
}
