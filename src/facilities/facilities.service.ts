import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionFrequency, Prisma, Facility } from '@prisma/client';

@Injectable()
export class FacilitiesService {
  constructor(private prisma: PrismaService) {}

  async create(data: Prisma.FacilityCreateInput): Promise<Facility> {
    return this.prisma.facility.create({
      data,
    });
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
    return this.prisma.facility.create({
      data: {
        name: data.name,
        type: data.type,
        address: data.address,
        state: data.state,
        lga: data.lga,
        city: data.city,
        contactPerson: data.contactPerson,
        phone: data.phone,
        email: data.email,
        code: data.code,
        billingType: 'KG_BASED',
        collectionFrequency: CollectionFrequency.WEEKLY,
        ratePerKg: 400,
        invoiceCycle: 'MONTHLY',
      },
    });
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
}
