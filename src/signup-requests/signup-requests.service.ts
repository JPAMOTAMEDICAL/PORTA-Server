import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacilityType, Role, SignupStatus } from '@prisma/client';
import { FacilitiesService } from '../facilities/facilities.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SignupRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facilitiesService: FacilitiesService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(data: {
    facilityName: string;
    facilityType: FacilityType;
    address: string;
    contactPerson: string;
    phone: string;
    email: string;
    state: string;
    lga: string;
  }) {
    const request = await this.prisma.signupRequest.create({
      data: {
        ...data,
        status: SignupStatus.SUBMITTED,
      },
    });

    await this.notificationsService.createForRoles(
      [Role.SUPER_ADMIN, Role.OPERATIONS_MANAGER, Role.CLIENT_SERVICE_OFFICER],
      {
        title: 'New client onboarding request',
        message: `${data.facilityName} submitted a new onboarding request.`,
        type: 'ONBOARDING_REQUEST',
      },
    );

    return request;
  }

  async list() {
    return this.prisma.signupRequest.findMany({
      include: {
        reviewedBy: true,
        createdFacility: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async review(
    id: string,
    reviewedById: string,
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_MODIFICATION',
    notes?: string,
  ) {
    const request = await this.prisma.signupRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Signup request not found.');
    }

    if (decision === 'REQUEST_MODIFICATION') {
      return this.prisma.signupRequest.update({
        where: { id },
        data: {
          status: SignupStatus.UNDER_REVIEW,
          reviewedById,
          reviewedAt: new Date(),
          rejectionReason: notes ?? 'Modification requested by reviewer.',
        },
      });
    }

    if (decision === 'REJECT') {
      return this.prisma.signupRequest.update({
        where: { id },
        data: {
          status: SignupStatus.REJECTED,
          reviewedById,
          reviewedAt: new Date(),
          rejectionReason: notes ?? 'Onboarding request rejected.',
        },
      });
    }

    const generatedPassword = `Welcome@${Math.floor(1000 + Math.random() * 9000)}`;
    const generatedUsername = request.email.split('@')[0].toLowerCase();
    const facilityCode = `FAC-${request.facilityName
      .replace(/[^A-Za-z0-9]/g, '')
      .slice(0, 5)
      .toUpperCase()}-${String(Date.now()).slice(-4)}`;

    const facility = await this.facilitiesService.createFromSignup({
      name: request.facilityName,
      type: request.facilityType,
      address: request.address,
      state: request.state,
      lga: request.lga,
      contactPerson: request.contactPerson,
      phone: request.phone,
      email: request.email,
      code: facilityCode,
    });

    const account = await this.usersService.createUser({
      email: request.email,
      username: generatedUsername,
      phone: request.phone,
      password: generatedPassword,
      fullName: request.contactPerson,
      role: Role.HOSPITAL_ADMIN,
      facilityId: facility.id,
    });

    await this.notificationsService.createNotification({
      recipientId: account.id,
      facilityId: facility.id,
      title: 'Welcome to JPMWOMS',
      message: `Your facility account has been approved. Username: ${generatedUsername}, password: ${generatedPassword}`,
      type: 'WELCOME',
      channel: 'EMAIL',
    });

    const updatedRequest = await this.prisma.signupRequest.update({
      where: { id },
      data: {
        status: SignupStatus.APPROVED,
        reviewedById,
        reviewedAt: new Date(),
        createdFacilityId: facility.id,
        generatedUsername,
        generatedPassword,
      },
    });

    return {
      request: updatedRequest,
      facility,
      account,
      credentials: {
        email: request.email,
        username: generatedUsername,
        password: generatedPassword,
        facilityCode,
      },
    };
  }
}
