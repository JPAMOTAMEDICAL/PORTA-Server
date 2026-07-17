const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const defaultSuperAdminSeeds = [
  {
    email: 'info@jpamotacleanersltd.com',
    fullName: 'JP Amota Super Admin',
    password: 'mrbayoboss100',
  },
  {
    email: 'everesttochi324@gmail.com',
    fullName: 'Everest Tochi',
    password: 'tochiadmin324',
  },
];

async function ensureDefaultSuperAdmins() {
  const superAdminRole = await prisma.accessRole.findFirst({
    where: {
      name: Role.SUPER_ADMIN,
      isSystem: true,
    },
    select: { id: true },
  });

  if (!superAdminRole) {
    throw new Error('SUPER_ADMIN access role is not available.');
  }

  for (const account of defaultSuperAdminSeeds) {
    const existingUser = await prisma.user.findUnique({
      where: { email: account.email },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    const passwordHash =
      existingUser &&
      (await bcrypt.compare(account.password, existingUser.passwordHash))
        ? existingUser.passwordHash
        : await bcrypt.hash(account.password, 10);

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        fullName: account.fullName,
        role: Role.SUPER_ADMIN,
        passwordHash,
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        email: account.email,
        fullName: account.fullName,
        role: Role.SUPER_ADMIN,
        passwordHash,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    const roleAssignment = await prisma.userAccessRole.findFirst({
      where: {
        userId: user.id,
        roleId: superAdminRole.id,
      },
      select: { userId: true },
    });

    if (!roleAssignment) {
      await prisma.userAccessRole.create({
        data: {
          userId: user.id,
          roleId: superAdminRole.id,
        },
      });
    }

    console.log(`Ensured default super admin: ${user.email} (${user.role})`);
  }
}

ensureDefaultSuperAdmins()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
