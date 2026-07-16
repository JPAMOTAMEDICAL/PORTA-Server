import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccessControlService } from '../access-control/access-control.service';
import { MailService } from '../mail/mail.service';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmail: jest.Mock;
    findById: jest.Mock;
    findByIdentifier: jest.Mock;
    createUser: jest.Mock;
    updateLastLogin: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findByIdentifier: jest.fn(),
      createUser: jest.fn(),
      updateLastLogin: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: usersService,
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            passwordResetToken: {
              updateMany: jest.fn(),
              create: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            user: {
              findFirst: jest.fn(),
            },
          },
        },
        {
          provide: AccessControlService,
          useValue: {
            getUserPermissionCodes: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: MailService,
          useValue: {
            sendMail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('forces public registrations to create hospital admin accounts', async () => {
    usersService.findByEmail.mockResolvedValue(null);
    usersService.createUser.mockResolvedValue({
      id: 'user-1',
      role: Role.HOSPITAL_ADMIN,
    });

    await service.register({
      email: 'facility@example.com',
      password: 'SafePass123!',
      fullName: 'Facility Admin',
      facilityId: 'facility-1',
    });

    expect(usersService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'facility@example.com',
        role: Role.HOSPITAL_ADMIN,
      }),
    );
  });
});
