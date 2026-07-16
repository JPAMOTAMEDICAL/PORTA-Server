import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';
import { PermissionCodes, type PermissionCode } from './permission-codes';

type RoleSeed = {
  name: string;
  description: string;
  permissions: PermissionCode[];
  legacyRole?: Role;
};

const permissionCatalog: Array<{
  code: PermissionCode;
  label: string;
  module: string;
  description?: string;
}> = [
  {
    code: PermissionCodes.SETTINGS_VIEW,
    label: 'View settings',
    module: 'SETTINGS',
  },
  {
    code: PermissionCodes.SETTINGS_UPSERT,
    label: 'Update settings',
    module: 'SETTINGS',
  },
  { code: PermissionCodes.USERS_VIEW, label: 'View users', module: 'USERS' },
  {
    code: PermissionCodes.USERS_CREATE,
    label: 'Create users',
    module: 'USERS',
  },
  {
    code: PermissionCodes.USERS_UPDATE,
    label: 'Update users',
    module: 'USERS',
  },
  {
    code: PermissionCodes.USERS_SET_STATUS,
    label: 'Update user status',
    module: 'USERS',
  },
  {
    code: PermissionCodes.USERS_DELETE,
    label: 'Delete users',
    module: 'USERS',
  },
  {
    code: PermissionCodes.DOCUMENTS_VIEW,
    label: 'View documents',
    module: 'DOCUMENTS',
  },
  {
    code: PermissionCodes.DOCUMENTS_UPLOAD,
    label: 'Upload documents',
    module: 'DOCUMENTS',
  },
  {
    code: PermissionCodes.DOCUMENTS_UPLOAD_DELETE,
    label: 'Delete uploads',
    module: 'DOCUMENTS',
  },
  {
    code: PermissionCodes.DOCUMENTS_FILE_VIEW,
    label: 'Preview stored files',
    module: 'DOCUMENTS',
  },
  {
    code: PermissionCodes.DOCUMENTS_FILE_DOWNLOAD,
    label: 'Download stored files',
    module: 'DOCUMENTS',
  },
  {
    code: PermissionCodes.INVOICE_DOC_VIEW,
    label: 'Preview invoice documents',
    module: 'DOCUMENTS',
  },
  {
    code: PermissionCodes.INVOICE_DOC_DOWNLOAD,
    label: 'Download invoice documents',
    module: 'DOCUMENTS',
  },
  {
    code: PermissionCodes.RECEIPT_DOC_VIEW,
    label: 'Preview receipt documents',
    module: 'DOCUMENTS',
  },
  {
    code: PermissionCodes.RECEIPT_DOC_DOWNLOAD,
    label: 'Download receipt documents',
    module: 'DOCUMENTS',
  },
  {
    code: PermissionCodes.VISITS_CREATE,
    label: 'Create visits',
    module: 'VISITS',
  },
  { code: PermissionCodes.VISITS_VIEW, label: 'View visits', module: 'VISITS' },
  {
    code: PermissionCodes.VISITS_COMPLETE,
    label: 'Complete visits',
    module: 'VISITS',
  },
  {
    code: PermissionCodes.VISITS_OFFLINE_SYNC,
    label: 'Sync visits',
    module: 'VISITS',
  },
  { code: PermissionCodes.ROUTES_VIEW, label: 'View routes', module: 'ROUTES' },
  { code: PermissionCodes.ROUTES_PLAN, label: 'Plan routes', module: 'ROUTES' },
  {
    code: PermissionCodes.ROUTES_UPDATE_STATUS,
    label: 'Update route status',
    module: 'ROUTES',
  },
  {
    code: PermissionCodes.DRIVERS_VIEW,
    label: 'View drivers',
    module: 'DRIVERS',
  },
  {
    code: PermissionCodes.DRIVERS_CREATE,
    label: 'Create drivers',
    module: 'DRIVERS',
  },
  {
    code: PermissionCodes.DRIVERS_UPDATE,
    label: 'Update drivers',
    module: 'DRIVERS',
  },
  {
    code: PermissionCodes.DRIVERS_VIEW_ROUTES,
    label: 'View driver routes',
    module: 'DRIVERS',
  },
  {
    code: PermissionCodes.DRIVERS_GROUP_BY_OFFICER,
    label: 'View driver officer groups',
    module: 'DRIVERS',
  },
  {
    code: PermissionCodes.FACILITIES_CREATE,
    label: 'Create facilities',
    module: 'FACILITIES',
  },
  {
    code: PermissionCodes.FACILITIES_VIEW,
    label: 'View facilities',
    module: 'FACILITIES',
  },
  {
    code: PermissionCodes.FACILITIES_VIEW_TIMELINE,
    label: 'View facility timeline',
    module: 'FACILITIES',
  },
  {
    code: PermissionCodes.FACILITIES_VIEW_SERVICE_MONITORING,
    label: 'View service monitoring',
    module: 'FACILITIES',
  },
  {
    code: PermissionCodes.FACILITIES_UPDATE,
    label: 'Update facilities',
    module: 'FACILITIES',
  },
  {
    code: PermissionCodes.FACILITIES_DELETE,
    label: 'Delete facilities',
    module: 'FACILITIES',
  },
  {
    code: PermissionCodes.INVOICES_VIEW,
    label: 'View invoices',
    module: 'INVOICES',
  },
  {
    code: PermissionCodes.INVOICES_CREATE,
    label: 'Create invoices',
    module: 'INVOICES',
  },
  {
    code: PermissionCodes.INVOICES_UPDATE,
    label: 'Update invoices',
    module: 'INVOICES',
  },
  {
    code: PermissionCodes.INVOICES_UPDATE_STATUS,
    label: 'Update invoice status',
    module: 'INVOICES',
  },
  {
    code: PermissionCodes.INVOICES_SEND,
    label: 'Send invoices',
    module: 'INVOICES',
  },
  {
    code: PermissionCodes.PAYMENTS_VIEW,
    label: 'View payments',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.PAYMENTS_CREATE,
    label: 'Create payments',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.PAYMENTS_REVIEW,
    label: 'Review payments',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.PAYMENTS_VERIFY,
    label: 'Verify payments',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.RECEIPTS_VIEW,
    label: 'View receipts',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.RECEIPTS_SEND,
    label: 'Send receipts',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.BANK_ACCOUNTS_VIEW,
    label: 'View bank accounts',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.BANK_ACCOUNTS_UPSERT,
    label: 'Manage bank accounts',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.BANK_ACCOUNTS_SET_DEFAULT,
    label: 'Set default bank account',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.BANK_ACCOUNTS_DELETE,
    label: 'Delete bank accounts',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.PAYSTACK_INIT,
    label: 'Initialize Paystack',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.PAYSTACK_VERIFY,
    label: 'Verify Paystack',
    module: 'PAYMENTS',
  },
  {
    code: PermissionCodes.MANIFESTS_VIEW,
    label: 'View manifests',
    module: 'MANIFESTS',
  },
  {
    code: PermissionCodes.MANIFESTS_VERIFY,
    label: 'Verify manifests',
    module: 'MANIFESTS',
  },
  {
    code: PermissionCodes.COLLECTIONS_CREATE,
    label: 'Create collections',
    module: 'COLLECTIONS',
  },
  {
    code: PermissionCodes.COLLECTIONS_VIEW,
    label: 'View collections',
    module: 'COLLECTIONS',
  },
  {
    code: PermissionCodes.COLLECTIONS_MONTHLY_TOTAL_VIEW,
    label: 'View monthly totals',
    module: 'COLLECTIONS',
  },
  {
    code: PermissionCodes.COLLECTIONS_OFFLINE_SYNC,
    label: 'Sync collections',
    module: 'COLLECTIONS',
  },
  {
    code: PermissionCodes.COMPLAINTS_CREATE,
    label: 'Create complaints',
    module: 'COMPLAINTS',
  },
  {
    code: PermissionCodes.COMPLAINTS_VIEW,
    label: 'View complaints',
    module: 'COMPLAINTS',
  },
  {
    code: PermissionCodes.COMPLAINTS_UPDATE_STATUS,
    label: 'Update complaint status',
    module: 'COMPLAINTS',
  },
  {
    code: PermissionCodes.APPROVALS_CREATE,
    label: 'Create approvals',
    module: 'APPROVALS',
  },
  {
    code: PermissionCodes.APPROVALS_VIEW,
    label: 'View approvals',
    module: 'APPROVALS',
  },
  {
    code: PermissionCodes.APPROVALS_REVIEW,
    label: 'Review approvals',
    module: 'APPROVALS',
  },
  {
    code: PermissionCodes.NOTIFICATIONS_VIEW,
    label: 'View notifications',
    module: 'NOTIFICATIONS',
  },
  {
    code: PermissionCodes.NOTIFICATIONS_CREATE,
    label: 'Create notifications',
    module: 'NOTIFICATIONS',
  },
  {
    code: PermissionCodes.NOTIFICATIONS_MARK_READ,
    label: 'Mark notification read',
    module: 'NOTIFICATIONS',
  },
  {
    code: PermissionCodes.REPORTS_DASHBOARD_SUMMARY,
    label: 'Dashboard reports',
    module: 'REPORTS',
  },
  {
    code: PermissionCodes.REPORTS_OPERATIONAL,
    label: 'Operational reports',
    module: 'REPORTS',
  },
  {
    code: PermissionCodes.REPORTS_FINANCE_SUMMARY,
    label: 'Finance summary',
    module: 'REPORTS',
  },
  {
    code: PermissionCodes.AI_OPTIMIZE_ROUTE,
    label: 'Optimize routes with AI',
    module: 'AI',
  },
  {
    code: PermissionCodes.AI_PREDICT_WASTE,
    label: 'Predict waste volumes',
    module: 'AI',
  },
  {
    code: PermissionCodes.AI_MISSING_COLLECTIONS,
    label: 'Detect missing collections',
    module: 'AI',
  },
  {
    code: PermissionCodes.AI_INVOICE_MONITORING,
    label: 'Monitor invoices with AI',
    module: 'AI',
  },
  {
    code: PermissionCodes.AI_PAYMENT_MONITORING,
    label: 'Monitor payments with AI',
    module: 'AI',
  },
  {
    code: PermissionCodes.AI_RISK_DETECTION,
    label: 'Detect facility risk',
    module: 'AI',
  },
  {
    code: PermissionCodes.AI_ASSISTANT_DAILY,
    label: 'Daily AI assistant',
    module: 'AI',
  },
  {
    code: PermissionCodes.AI_ASSISTANT_WEEKLY,
    label: 'Weekly AI assistant',
    module: 'AI',
  },
  {
    code: PermissionCodes.AI_ASSISTANT_MONTHLY,
    label: 'Monthly AI assistant',
    module: 'AI',
  },
  {
    code: PermissionCodes.SIGNUP_REQUESTS_VIEW,
    label: 'View signup requests',
    module: 'SIGNUPS',
  },
  {
    code: PermissionCodes.SIGNUP_REQUESTS_REVIEW,
    label: 'Review signup requests',
    module: 'SIGNUPS',
  },
  {
    code: PermissionCodes.ACCESS_ROLES_VIEW,
    label: 'View access roles',
    module: 'ACCESS',
  },
  {
    code: PermissionCodes.ACCESS_ROLES_MANAGE,
    label: 'Manage access roles',
    module: 'ACCESS',
  },
  {
    code: PermissionCodes.ACCESS_PERMISSIONS_VIEW,
    label: 'View permissions',
    module: 'ACCESS',
  },
  {
    code: PermissionCodes.ACCESS_ROLE_PERMISSIONS_MANAGE,
    label: 'Manage role permissions',
    module: 'ACCESS',
  },
  {
    code: PermissionCodes.ACCESS_USER_ROLES_MANAGE,
    label: 'Manage user roles',
    module: 'ACCESS',
  },
];

const roleSeeds: RoleSeed[] = [
  {
    name: 'SUPER_ADMIN',
    description: 'Full system access',
    permissions: Object.values(PermissionCodes),
    legacyRole: Role.SUPER_ADMIN,
  },
  {
    name: 'OPERATIONS_MANAGER',
    description: 'Operations oversight',
    permissions: [
      PermissionCodes.SETTINGS_VIEW,
      PermissionCodes.USERS_VIEW,
      PermissionCodes.DOCUMENTS_VIEW,
      PermissionCodes.DOCUMENTS_FILE_VIEW,
      PermissionCodes.DOCUMENTS_FILE_DOWNLOAD,
      PermissionCodes.INVOICE_DOC_VIEW,
      PermissionCodes.RECEIPT_DOC_VIEW,
      PermissionCodes.VISITS_CREATE,
      PermissionCodes.VISITS_VIEW,
      PermissionCodes.VISITS_COMPLETE,
      PermissionCodes.VISITS_OFFLINE_SYNC,
      PermissionCodes.ROUTES_VIEW,
      PermissionCodes.ROUTES_PLAN,
      PermissionCodes.ROUTES_UPDATE_STATUS,
      PermissionCodes.DRIVERS_VIEW,
      PermissionCodes.DRIVERS_VIEW_ROUTES,
      PermissionCodes.DRIVERS_GROUP_BY_OFFICER,
      PermissionCodes.FACILITIES_VIEW,
      PermissionCodes.FACILITIES_VIEW_TIMELINE,
      PermissionCodes.FACILITIES_VIEW_SERVICE_MONITORING,
      PermissionCodes.COLLECTIONS_CREATE,
      PermissionCodes.COLLECTIONS_VIEW,
      PermissionCodes.COLLECTIONS_OFFLINE_SYNC,
      PermissionCodes.COMPLAINTS_VIEW,
      PermissionCodes.NOTIFICATIONS_VIEW,
      PermissionCodes.REPORTS_OPERATIONAL,
    ],
    legacyRole: Role.OPERATIONS_MANAGER,
  },
  {
    name: 'CLIENT_SERVICE_OFFICER',
    description: 'Client service and onboarding',
    permissions: [
      PermissionCodes.SETTINGS_VIEW,
      PermissionCodes.USERS_VIEW,
      PermissionCodes.DOCUMENTS_VIEW,
      PermissionCodes.DOCUMENTS_UPLOAD,
      PermissionCodes.DOCUMENTS_FILE_VIEW,
      PermissionCodes.DOCUMENTS_FILE_DOWNLOAD,
      PermissionCodes.FACILITIES_VIEW,
      PermissionCodes.FACILITIES_VIEW_TIMELINE,
      PermissionCodes.FACILITIES_UPDATE,
      PermissionCodes.INVOICES_VIEW,
      PermissionCodes.INVOICES_CREATE,
      PermissionCodes.INVOICES_SEND,
      PermissionCodes.PAYMENTS_VIEW,
      PermissionCodes.RECEIPTS_VIEW,
      PermissionCodes.COMPLAINTS_VIEW,
      PermissionCodes.COMPLAINTS_UPDATE_STATUS,
      PermissionCodes.NOTIFICATIONS_VIEW,
      PermissionCodes.SIGNUP_REQUESTS_VIEW,
      PermissionCodes.SIGNUP_REQUESTS_REVIEW,
    ],
    legacyRole: Role.CLIENT_SERVICE_OFFICER,
  },
  {
    name: 'ACCOUNTANT',
    description: 'Finance, payment verification, receipts',
    permissions: [
      PermissionCodes.SETTINGS_VIEW,
      PermissionCodes.USERS_VIEW,
      PermissionCodes.DOCUMENTS_VIEW,
      PermissionCodes.DOCUMENTS_UPLOAD,
      PermissionCodes.DOCUMENTS_FILE_VIEW,
      PermissionCodes.DOCUMENTS_FILE_DOWNLOAD,
      PermissionCodes.INVOICES_VIEW,
      PermissionCodes.INVOICES_UPDATE,
      PermissionCodes.INVOICES_SEND,
      PermissionCodes.PAYMENTS_VIEW,
      PermissionCodes.PAYMENTS_REVIEW,
      PermissionCodes.RECEIPTS_VIEW,
      PermissionCodes.RECEIPTS_SEND,
      PermissionCodes.BANK_ACCOUNTS_VIEW,
      PermissionCodes.REPORTS_FINANCE_SUMMARY,
      PermissionCodes.NOTIFICATIONS_VIEW,
    ],
    legacyRole: Role.ACCOUNTANT,
  },
  {
    name: 'DRIVER',
    description: 'Field operations driver access',
    permissions: [
      PermissionCodes.DOCUMENTS_VIEW,
      PermissionCodes.VISITS_VIEW,
      PermissionCodes.COLLECTIONS_CREATE,
      PermissionCodes.COLLECTIONS_VIEW,
      PermissionCodes.COLLECTIONS_OFFLINE_SYNC,
      PermissionCodes.ROUTES_VIEW,
      PermissionCodes.DRIVERS_VIEW_ROUTES,
      PermissionCodes.NOTIFICATIONS_VIEW,
    ],
    legacyRole: Role.DRIVER,
  },
  {
    name: 'HOSPITAL_ADMIN',
    description: 'Client facility access',
    permissions: [
      PermissionCodes.FACILITIES_VIEW,
      PermissionCodes.FACILITIES_VIEW_TIMELINE,
      PermissionCodes.FACILITIES_VIEW_SERVICE_MONITORING,
      PermissionCodes.COLLECTIONS_VIEW,
      PermissionCodes.DOCUMENTS_VIEW,
      PermissionCodes.DOCUMENTS_UPLOAD,
      PermissionCodes.DOCUMENTS_FILE_VIEW,
      PermissionCodes.DOCUMENTS_FILE_DOWNLOAD,
      PermissionCodes.INVOICE_DOC_VIEW,
      PermissionCodes.INVOICE_DOC_DOWNLOAD,
      PermissionCodes.RECEIPT_DOC_VIEW,
      PermissionCodes.RECEIPT_DOC_DOWNLOAD,
      PermissionCodes.VISITS_VIEW,
      PermissionCodes.INVOICES_VIEW,
      PermissionCodes.PAYMENTS_VIEW,
      PermissionCodes.PAYMENTS_CREATE,
      PermissionCodes.PAYSTACK_INIT,
      PermissionCodes.RECEIPTS_VIEW,
      PermissionCodes.BANK_ACCOUNTS_VIEW,
      PermissionCodes.COMPLAINTS_CREATE,
      PermissionCodes.COMPLAINTS_VIEW,
      PermissionCodes.NOTIFICATIONS_VIEW,
      PermissionCodes.NOTIFICATIONS_MARK_READ,
    ],
    legacyRole: Role.HOSPITAL_ADMIN,
  },
];

@Injectable()
export class AccessControlService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureSeeded();
  }

  async ensureSeeded() {
    await this.seedPermissions();
    await this.seedRoles();
    await this.seedUserRolesFromLegacy();
  }

  async getUserPermissionCodes(userId: string): Promise<string[]> {
    const roles = await this.prisma.userAccessRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            permissions: {
              select: {
                permission: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const codes = new Set<string>();
    roles.forEach((entry) => {
      entry.role.permissions.forEach((permission) =>
        codes.add(permission.permission.code),
      );
    });

    return [...codes.values()];
  }

  async listRoles() {
    return this.prisma.accessRole.findMany({
      orderBy: { name: 'asc' },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });
  }

  async createRole(data: {
    name: string;
    description?: string;
    isSystem?: boolean;
  }) {
    const normalizedName = data.name.trim().toUpperCase();
    if (!normalizedName) {
      throw new BadRequestException('Role name is required.');
    }

    const existing = await this.prisma.accessRole.findUnique({
      where: { name: normalizedName },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'An access role with this name already exists.',
      );
    }

    return this.prisma.accessRole.create({
      data: {
        name: normalizedName,
        description: data.description,
        isSystem: data.isSystem ?? false,
      },
    });
  }

  async updateRole(id: string, data: { name?: string; description?: string }) {
    const role = await this.prisma.accessRole.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!role) {
      throw new NotFoundException('Access role not found.');
    }

    const normalizedName = data.name?.trim().toUpperCase();
    if (normalizedName && normalizedName !== role.name) {
      const duplicate = await this.prisma.accessRole.findUnique({
        where: { name: normalizedName },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          'An access role with this name already exists.',
        );
      }
    }

    return this.prisma.accessRole.update({
      where: { id },
      data: {
        name: normalizedName,
        description: data.description,
      },
    });
  }

  async deleteRole(id: string) {
    const role = await this.prisma.accessRole.findUnique({
      where: { id },
      select: { isSystem: true },
    });
    if (!role) {
      throw new NotFoundException('Access role not found.');
    }
    if (role.isSystem) {
      throw new BadRequestException('System access roles cannot be deleted.');
    }

    return this.prisma.accessRole.delete({ where: { id } });
  }

  async listPermissions(module?: string) {
    return this.prisma.permission.findMany({
      where: module ? { module } : undefined,
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
    });
  }

  async setRolePermissions(roleId: string, permissionCodes: string[]) {
    const role = await this.prisma.accessRole.findUnique({
      where: { id: roleId },
    });
    if (!role) {
      throw new NotFoundException('Access role not found.');
    }

    const requestedCodes = [
      ...new Set(permissionCodes.map((code) => code.trim()).filter(Boolean)),
    ];
    const permissions = await this.prisma.permission.findMany({
      where: {
        code: { in: requestedCodes },
      },
      select: { id: true },
    });

    if (permissions.length !== requestedCodes.length) {
      throw new BadRequestException(
        'One or more permission codes are invalid.',
      );
    }

    await this.prisma.accessRolePermission.deleteMany({
      where: { roleId },
    });

    if (permissions.length) {
      await this.prisma.accessRolePermission.createMany({
        data: permissions.map((permission) => ({
          roleId,
          permissionId: permission.id,
        })),
      });
    }

    return this.prisma.accessRole.findUnique({
      where: { id: roleId },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  async setUserRoles(userId: string, roleIds: string[]) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const requestedRoleIds = [
      ...new Set(roleIds.map((roleId) => roleId.trim()).filter(Boolean)),
    ];
    if (requestedRoleIds.length) {
      const roles = await this.prisma.accessRole.findMany({
        where: { id: { in: requestedRoleIds } },
        select: { id: true },
      });
      if (roles.length !== requestedRoleIds.length) {
        throw new BadRequestException(
          'One or more selected access roles are invalid.',
        );
      }
    }

    await this.prisma.userAccessRole.deleteMany({ where: { userId } });
    if (requestedRoleIds.length) {
      await this.prisma.userAccessRole.createMany({
        data: requestedRoleIds.map((roleId) => ({ userId, roleId })),
      });
    }
    return this.prisma.userAccessRole.findMany({
      where: { userId },
      include: { role: true },
    });
  }

  private async seedPermissions() {
    for (const permission of permissionCatalog) {
      await this.prisma.permission.upsert({
        where: { code: permission.code },
        update: {
          label: permission.label,
          module: permission.module,
          description: permission.description,
        },
        create: {
        code: permission.code,
        label: permission.label,
        module: permission.module,
        description: permission.description,
        },
      });
    }
  }

  private async seedRoles() {
    const existing = await this.prisma.accessRole.findMany({
      select: { id: true, name: true },
    });
    const existingMap = new Map(existing.map((role) => [role.name, role.id]));

    for (const seed of roleSeeds) {
      const existingId = existingMap.get(seed.name);
      const roleId =
        existingId ??
        (
          await this.prisma.accessRole.create({
            data: {
              name: seed.name,
              description: seed.description,
              isSystem: true,
            },
          })
        ).id;

      await this.setRolePermissions(roleId, seed.permissions);
    }
  }

  private async seedUserRolesFromLegacy() {
    const roles = await this.prisma.accessRole.findMany({
      select: { id: true, name: true },
    });
    const roleByName = new Map(roles.map((role) => [role.name, role.id]));

    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: { id: true, role: true },
    });

    for (const user of users) {
      const desired = roleByName.get(user.role);
      if (!desired) {
        continue;
      }

      const existing = await this.prisma.userAccessRole.findFirst({
        where: { userId: user.id, roleId: desired },
      });
      if (existing) {
        continue;
      }

      await this.prisma.userAccessRole.create({
        data: { userId: user.id, roleId: desired },
      });
    }
  }
}
