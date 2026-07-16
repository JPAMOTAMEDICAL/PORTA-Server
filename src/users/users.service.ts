import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(data: {
    email: string;
    username?: string;
    employeeId?: string;
    phone?: string;
    address?: string;
    photoUrl?: string;
    department?: string;
    position?: string;
    employmentDate?: string;
    licenseNumber?: string;
    password: string;
    fullName: string;
    role?: Role;
    facilityId?: string;
    status?: string;
  }): Promise<Omit<User, 'passwordHash'>> {
    const email = data.email.trim().toLowerCase();
    const username = data.username?.trim().toLowerCase() || undefined;
    const employeeId =
      data.employeeId?.trim() || (await this.generateEmployeeId());

    await this.assertUniqueUserFields({
      email,
      username,
      employeeId,
    });

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        employeeId,
        phone: data.phone,
        address: data.address,
        photoUrl: data.photoUrl,
        department: data.department,
        position: data.position,
        employmentDate: data.employmentDate
          ? new Date(data.employmentDate)
          : undefined,
        licenseNumber: data.licenseNumber,
        passwordHash,
        fullName: data.fullName,
        role: data.role ?? Role.HOSPITAL_ADMIN,
        facilityId: data.facilityId,
        status: data.status ?? 'ACTIVE',
      },
    });

    await this.syncLegacyRoleAssignment(user.id, user.role);

    return this.sanitizeUser(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        username,
        deletedAt: null,
      },
    });
  }

  async findByIdentifier(identifier: string): Promise<User | null> {
    const normalized = identifier.trim().toLowerCase();

    const directMatch = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: [{ email: normalized }, { username: normalized }],
      },
    });

    if (directMatch) {
      return directMatch;
    }

    const facility = await this.prisma.facility.findFirst({
      where: {
        code: identifier.trim().toUpperCase(),
        deletedAt: null,
      },
      include: {
        users: {
          where: {
            deletedAt: null,
            role: Role.HOSPITAL_ADMIN,
          },
          take: 1,
        },
      },
    });

    return facility?.users[0] ?? null;
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });
  }

  async findSelfProfile(id: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        facility: {
          select: {
            id: true,
            code: true,
            name: true,
            billingType: true,
            outstandingBalance: true,
            ratePerKg: true,
            fixedMonthlyRate: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return this.sanitizeUser(user);
  }

  async findAll(): Promise<Array<Omit<User, 'passwordHash'>>> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
      },
      include: {
        accessRoles: {
          include: {
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return users.map((user) => this.sanitizeUser(user));
  }

  async findByRoles(roles: Role[]): Promise<Array<Omit<User, 'passwordHash'>>> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        role: { in: roles },
      },
      orderBy: {
        fullName: 'asc',
      },
    });

    return users.map((user) => this.sanitizeUser(user));
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.ensureUserExists(id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    await this.ensureUserExists(id);
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });
  }

  async updateProfile(
    id: string,
    data: Partial<
      Pick<
        User,
        | 'fullName'
        | 'email'
        | 'username'
        | 'employeeId'
        | 'phone'
        | 'address'
        | 'photoUrl'
        | 'department'
        | 'position'
        | 'employmentDate'
        | 'licenseNumber'
        | 'role'
        | 'status'
        | 'facilityId'
      >
    > & { password?: string },
  ): Promise<Omit<User, 'passwordHash'>> {
    const existingUser = await this.ensureUserExists(id);

    const email = data.email?.trim().toLowerCase();
    const username = data.username?.trim().toLowerCase();
    const employeeId = data.employeeId?.trim();

    await this.assertUniqueUserFields(
      {
        email,
        username,
        employeeId,
      },
      id,
    );

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: data.fullName,
        email,
        username,
        employeeId,
        phone: data.phone,
        address: data.address,
        photoUrl: data.photoUrl,
        department: data.department,
        position: data.position,
        employmentDate: data.employmentDate,
        licenseNumber: data.licenseNumber,
        role: data.role,
        status: data.status,
        facilityId: data.facilityId,
        ...(data.password
          ? { passwordHash: await bcrypt.hash(data.password, 10) }
          : {}),
      },
    });

    if (data.role && data.role !== existingUser.role) {
      await this.syncLegacyRoleAssignment(
        user.id,
        data.role,
        existingUser.role,
      );
    }

    return this.sanitizeUser(user);
  }

  async updateSelfProfile(
    id: string,
    data: {
      fullName?: string;
      email?: string;
      phone?: string;
      address?: string;
      photoUrl?: string;
    },
  ) {
    const existingUser = await this.ensureUserExists(id);
    const email = data.email?.trim().toLowerCase();

    await this.assertUniqueUserFields(
      {
        email,
      },
      id,
    );

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName:
          typeof data.fullName === 'string' ? data.fullName.trim() : undefined,
        email,
        phone: typeof data.phone === 'string' ? data.phone.trim() : undefined,
        address:
          typeof data.address === 'string' ? data.address.trim() : undefined,
        photoUrl:
          typeof data.photoUrl === 'string' ? data.photoUrl.trim() : undefined,
      },
      include: {
        facility: {
          select: {
            id: true,
            code: true,
            name: true,
            billingType: true,
            outstandingBalance: true,
            ratePerKg: true,
            fixedMonthlyRate: true,
          },
        },
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    return this.sanitizeUser(user);
  }

  async setStatus(
    id: string,
    status: string,
  ): Promise<Omit<User, 'passwordHash'>> {
    await this.ensureUserExists(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status },
    });

    return this.sanitizeUser(user);
  }

  private async assertUniqueUserFields(
    fields: {
      email?: string;
      username?: string;
      employeeId?: string;
    },
    excludeUserId?: string,
  ) {
    const orFilters: Prisma.UserWhereInput[] = [];

    if (fields.email) {
      orFilters.push({ email: fields.email });
    }

    if (fields.username) {
      orFilters.push({ username: fields.username });
    }

    if (fields.employeeId) {
      orFilters.push({ employeeId: fields.employeeId });
    }

    if (!orFilters.length) {
      return;
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        OR: orFilters,
        ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
      },
    });

    if (!existing) {
      return;
    }

    if (fields.email && existing.email === fields.email) {
      throw new ConflictException('A user with this email already exists.');
    }

    if (fields.username && existing.username === fields.username) {
      throw new ConflictException('This username is already in use.');
    }

    if (fields.employeeId && existing.employeeId === fields.employeeId) {
      throw new ConflictException('This staff ID is already assigned.');
    }
  }

  private async generateEmployeeId() {
    const year = new Date().getFullYear().toString().slice(-2);
    const latest = await this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        employeeId: {
          startsWith: `STAFF-${year}-`,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const latestSequence = latest?.employeeId
      ? Number(latest.employeeId.split('-').at(-1))
      : 0;

    return `STAFF-${year}-${String((latestSequence || 0) + 1).padStart(4, '0')}`;
  }

  private async ensureUserExists(id: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  private async syncLegacyRoleAssignment(
    userId: string,
    nextRole: Role,
    previousRole?: Role,
  ) {
    if (previousRole && previousRole !== nextRole) {
      await this.prisma.userAccessRole.deleteMany({
        where: {
          userId,
          role: {
            isSystem: true,
            name: previousRole,
          },
        },
      });
    }

    const mappedRole = await this.prisma.accessRole.findFirst({
      where: {
        name: nextRole,
        isSystem: true,
      },
      select: { id: true },
    });

    if (!mappedRole) {
      return;
    }

    const existingAssignment = await this.prisma.userAccessRole.findFirst({
      where: {
        userId,
        roleId: mappedRole.id,
      },
      select: { userId: true },
    });

    if (existingAssignment) {
      return;
    }

    await this.prisma.userAccessRole.create({
      data: {
        userId,
        roleId: mappedRole.id,
      },
    });
  }

  private sanitizeUser<T extends { passwordHash: string }>(
    user: T,
  ): Omit<T, 'passwordHash'> {
    const { passwordHash, ...safeUser } = user;
    void passwordHash;
    return safeUser;
  }
}
