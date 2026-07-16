import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async list() {
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        role: Role.DRIVER,
      },
      include: {
        routes: {
          where: {
            deletedAt: null,
          },
          include: {
            vehicle: true,
            createdBy: true,
            collections: true,
          },
          orderBy: {
            plannedDate: 'desc',
          },
        },
      },
      orderBy: {
        fullName: 'asc',
      },
    });
  }

  async create(data: {
    email: string;
    employeeId?: string;
    phone?: string;
    address?: string;
    photoUrl?: string;
    licenseNumber?: string;
    password: string;
    fullName: string;
  }) {
    return this.usersService.createUser({
      ...data,
      username: data.employeeId?.toLowerCase(),
      role: Role.DRIVER,
    });
  }

  async update(
    id: string,
    data: {
      email?: string;
      employeeId?: string;
      phone?: string;
      address?: string;
      photoUrl?: string;
      licenseNumber?: string;
      fullName?: string;
      status?: string;
    },
  ) {
    const driver = await this.prisma.user.findFirst({
      where: {
        id,
        role: Role.DRIVER,
        deletedAt: null,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found.');
    }

    return this.usersService.updateProfile(id, data);
  }

  async getDriverRoutes(id: string) {
    const driver = await this.prisma.user.findFirst({
      where: {
        id,
        role: Role.DRIVER,
        deletedAt: null,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found.');
    }

    return this.prisma.route.findMany({
      where: {
        deletedAt: null,
        driverId: id,
      },
      include: {
        vehicle: true,
        createdBy: true,
        collections: {
          where: {
            deletedAt: null,
          },
        },
      },
      orderBy: {
        plannedDate: 'desc',
      },
    });
  }

  async groupRoutesByOfficer() {
    const routes = await this.prisma.route.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        driver: true,
        vehicle: true,
        createdBy: true,
        collections: {
          where: {
            deletedAt: null,
          },
        },
      },
      orderBy: {
        plannedDate: 'desc',
      },
    });

    const grouped = new Map<
      string,
      {
        officerId: string;
        officerName: string;
        routes: typeof routes;
      }
    >();

    for (const route of routes) {
      const officerId = route.createdById ?? 'unassigned';
      const officerName = route.createdBy?.fullName ?? 'Unassigned Officer';
      const existing = grouped.get(officerId);

      if (existing) {
        existing.routes.push(route);
        continue;
      }

      grouped.set(officerId, {
        officerId,
        officerName,
        routes: [route],
      });
    }

    return Array.from(grouped.values()).map((group) => ({
      officerId: group.officerId,
      officerName: group.officerName,
      routeCount: group.routes.length,
      routes: group.routes,
    }));
  }
}
