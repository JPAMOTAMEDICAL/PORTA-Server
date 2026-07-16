import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      create: jest.Mock<
        unknown,
        [
          {
            data: {
              employeeId?: string;
            };
          },
        ]
      >;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock<
        unknown,
        [
          {
            data: {
              passwordHash?: string;
            };
          },
        ]
      >;
    };
    facility: {
      findFirst: jest.Mock;
    };
    accessRole: {
      findFirst: jest.Mock;
    };
    userAccessRole: {
      findFirst: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        create: jest.fn<
          unknown,
          [
            {
              data: {
                employeeId?: string;
              };
            },
          ]
        >(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn<
          unknown,
          [
            {
              data: {
                passwordHash?: string;
              };
            },
          ]
        >(),
      },
      facility: {
        findFirst: jest.fn(),
      },
      accessRole: {
        findFirst: jest.fn(),
      },
      userAccessRole: {
        findFirst: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('auto-generates a staff ID and strips the password hash from createUser responses', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.accessRole.findFirst.mockResolvedValue({ id: 'role-ops' });
    prisma.userAccessRole.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'nurse@example.com',
      username: 'nurse.one',
      employeeId: 'STAFF-26-0001',
      passwordHash: await bcrypt.hash('SafePass123!', 10),
      fullName: 'Nurse One',
      role: 'OPERATIONS_MANAGER',
      facilityId: null,
      address: null,
      photoUrl: null,
      department: 'Operations',
      position: 'Supervisor',
      employmentDate: null,
      licenseNumber: null,
      status: 'ACTIVE',
      lastLoginAt: null,
      phone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const result = await service.createUser({
      email: 'nurse@example.com',
      username: 'nurse.one',
      password: 'SafePass123!',
      fullName: 'Nurse One',
      role: 'OPERATIONS_MANAGER',
      department: 'Operations',
      position: 'Supervisor',
    });

    const createArgs = prisma.user.create.mock.calls[0]?.[0];
    expect(createArgs).toBeDefined();
    expect(createArgs?.data.employeeId).toBe('STAFF-26-0001');
    expect(prisma.userAccessRole.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        roleId: 'role-ops',
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        employeeId: 'STAFF-26-0001',
        fullName: 'Nurse One',
      }),
    );
    expect(result).not.toHaveProperty('passwordHash');
  });

  it('hashes a replacement password during profile updates', async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce({
        id: 'user-1',
        role: 'ACCOUNTANT',
      })
      .mockResolvedValueOnce(null);
    prisma.user.update.mockResolvedValue({
      id: 'user-1',
      email: 'updated@example.com',
      username: 'updated.user',
      employeeId: 'STAFF-26-0042',
      passwordHash: await bcrypt.hash('NextPass123!', 10),
      fullName: 'Updated User',
      role: 'ACCOUNTANT',
      facilityId: null,
      address: null,
      photoUrl: null,
      department: 'Finance',
      position: 'Lead Accountant',
      employmentDate: null,
      licenseNumber: null,
      status: 'ACTIVE',
      lastLoginAt: null,
      phone: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    await service.updateProfile('user-1', {
      email: 'updated@example.com',
      username: 'updated.user',
      password: 'NextPass123!',
    });

    const updateArgs = prisma.user.update.mock.calls[0]?.[0];
    expect(updateArgs).toBeDefined();
    expect(updateArgs?.data.passwordHash).toEqual(expect.any(String));
  });
});
