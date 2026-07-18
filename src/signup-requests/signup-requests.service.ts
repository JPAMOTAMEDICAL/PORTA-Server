import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacilityType, Role, SignupStatus } from '@prisma/client';
import { FacilitiesService } from '../facilities/facilities.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SignupRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly facilitiesService: FacilitiesService,
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
    const onboardingResult = await this.facilitiesService.createOnboardingFacility(
      {
        name: request.facilityName,
        type: request.facilityType,
        address: request.address,
        state: request.state,
        lga: request.lga,
        contactPerson: request.contactPerson,
        phone: request.phone,
        email: request.email,
        password: generatedPassword,
        confirmPassword: generatedPassword,
      },
      reviewedById,
    );

    const updatedRequest = await this.prisma.signupRequest.update({
      where: { id },
      data: {
        status: SignupStatus.APPROVED,
        reviewedById,
        reviewedAt: new Date(),
        createdFacilityId: onboardingResult.facility.id,
        generatedUsername: onboardingResult.generatedCode,
        generatedPassword: null,
      },
    });

    return {
      request: updatedRequest,
      facility: onboardingResult.facility,
      account: onboardingResult.account,
      credentials: {
        email: request.email,
        username: onboardingResult.generatedCode,
        password: generatedPassword,
        facilityCode: onboardingResult.generatedCode,
      },
    };
  }
}
