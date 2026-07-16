const { PrismaClient, Role, FacilityType, BillingType, CollectionFrequency, VisitPurpose, ComplaintType, ApprovalStatus, SignupStatus, NotificationChannel, NotificationStatus, InvoiceStatus } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const demoAccounts = [
  {
    role: Role.SUPER_ADMIN,
    fullName: 'Olivia Adeyemi',
    email: 'superadmin@jpmwoms.local',
    username: 'superadmin',
    phone: '08030000001',
    password: 'SuperAdmin@123',
  },
  {
    role: Role.OPERATIONS_MANAGER,
    fullName: 'Daniel Okoye',
    email: 'operations@jpmwoms.local',
    username: 'opsmanager',
    phone: '08030000002',
    password: 'Operations@123',
  },
  {
    role: Role.CLIENT_SERVICE_OFFICER,
    fullName: 'Amara Nwosu',
    email: 'clientservice@jpmwoms.local',
    username: 'clientservice',
    phone: '08030000003',
    password: 'ClientService@123',
  },
  {
    role: Role.ACCOUNTANT,
    fullName: 'Ifeanyi Bello',
    email: 'accountant@jpmwoms.local',
    username: 'accountant',
    phone: '08030000004',
    password: 'Accountant@123',
  },
  {
    role: Role.DRIVER,
    fullName: 'Chinedu Musa',
    email: 'driver@jpmwoms.local',
    username: 'driver',
    phone: '08030000005',
    password: 'Driver@123',
  },
];

async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.userAccessRole.deleteMany();
  await prisma.accessRolePermission.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.collection.deleteMany();
  await prisma.facilityVisit.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.route.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.signupRequest.deleteMany();
  await prisma.user.deleteMany();
  await prisma.accessRole.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.facility.deleteMany();
  await prisma.systemSetting.deleteMany();
}

async function createUser(account, facilityId) {
  const passwordHash = await bcrypt.hash(account.password, 10);
  return prisma.user.create({
    data: {
      email: account.email,
      username: account.username,
      fullName: account.fullName,
      phone: account.phone,
      role: account.role,
      passwordHash,
      facilityId,
    },
  });
}

async function main() {
  await resetDatabase();

  const settings = await prisma.systemSetting.create({
    data: {
      companyName: 'JP Amota Medical Waste Operations Management System',
      address: '1 Environmental Safety Road, Ikeja, Lagos',
      phone: '+2348030000000',
      email: 'hello@jpamota.com',
      website: 'https://jpamota.com',
      kgRate: 400,
      invoicePrefix: 'JPA-INV-',
      timezone: 'Africa/Lagos',
      dateFormat: 'dd/MM/yyyy',
    },
  });

  const adminUsers = [];
  for (const account of demoAccounts) {
    adminUsers.push(await createUser(account));
  }

  const [superAdmin, operationsManager, clientServiceOfficer, accountant, driver] = adminUsers;

  const facilities = await Promise.all([
    prisma.facility.create({
      data: {
        name: 'Marigold Hospital',
        code: 'MARIGOLD',
        type: FacilityType.HOSPITAL,
        address: '10 Health Avenue, Ikeja',
        city: 'Ikeja',
        state: 'Lagos',
        lga: 'Ikeja',
        gpsCoordinates: '6.6018,3.3515',
        billingType: BillingType.FIXED,
        fixedMonthlyRate: 600000,
        collectionFrequency: CollectionFrequency.WEEKLY,
        contactPerson: 'Dr. Ada Marigold',
        phone: '08031111111',
        email: 'admin@marigold.local',
        outstandingBalance: 150000,
      },
    }),
    prisma.facility.create({
      data: {
        name: 'Avon Clinic',
        code: 'AVON',
        type: FacilityType.CLINIC,
        address: '22 Wellness Street, Surulere',
        city: 'Surulere',
        state: 'Lagos',
        lga: 'Surulere',
        gpsCoordinates: '6.4969,3.3580',
        billingType: BillingType.KG_BASED,
        ratePerKg: 400,
        collectionFrequency: CollectionFrequency.WEEKLY,
        contactPerson: 'Dr. Tunde Avon',
        phone: '08032222222',
        email: 'admin@avon.local',
        outstandingBalance: 80000,
      },
    }),
    prisma.facility.create({
      data: {
        name: 'Havana Diagnostics',
        code: 'HAVANA',
        type: FacilityType.DIAGNOSTIC_CENTRE,
        address: '3 Lab Crescent, Yaba',
        city: 'Yaba',
        state: 'Lagos',
        lga: 'Lagos Mainland',
        gpsCoordinates: '6.5150,3.3670',
        billingType: BillingType.KG_BASED,
        ratePerKg: 400,
        collectionFrequency: CollectionFrequency.BI_WEEKLY,
        contactPerson: 'Grace Havana',
        phone: '08033333333',
        email: 'admin@havana.local',
        outstandingBalance: 0,
      },
    }),
  ]);

  const hospitalAdmin = await createUser(
    {
      role: Role.HOSPITAL_ADMIN,
      fullName: 'Mariam Okafor',
      email: 'hospital@jpmwoms.local',
      username: 'hospitalclient',
      phone: '08030000006',
      password: 'Hospital@123',
    },
    facilities[0].id,
  );

  const vehicle = await prisma.vehicle.create({
    data: {
      plateNumber: 'LAG-123JP',
      capacityKg: 1500,
      status: 'ACTIVE',
    },
  });

  const route = await prisma.route.create({
    data: {
      driverId: driver.id,
      vehicleId: vehicle.id,
      plannedDate: new Date(),
      stops: [
        { facilityId: facilities[0].id, sequence: 1 },
        { facilityId: facilities[1].id, sequence: 2 },
      ],
      optimizedDist: 42.5,
      status: 'PLANNED',
    },
  });

  const collections = await Promise.all([
    prisma.collection.create({
      data: {
        facilityId: facilities[0].id,
        driverId: driver.id,
        weightKg: 450,
        binCount: 12,
        collectionTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        wasteType: 'INFECTIOUS',
        manifestNo: 'MAN-1001',
        routeId: route.id,
        signatureUrl: 'signature://marigold',
        notes: 'Completed on schedule.',
        photoUrls: ['photo://marigold-1'],
        gpsLocation: '6.6018,3.3515',
        deviceInfo: 'Driver Tablet',
        syncStatus: 'COMPLETED',
        clientReference: 'offline-001',
        syncedAt: new Date(),
      },
    }),
    prisma.collection.create({
      data: {
        facilityId: facilities[1].id,
        driverId: driver.id,
        weightKg: 180,
        binCount: 5,
        collectionTime: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
        wasteType: 'SHARPS',
        manifestNo: 'MAN-1002',
        routeId: route.id,
        notes: 'Pickup completed, minor delay.',
        photoUrls: ['photo://avon-1'],
        gpsLocation: '6.4969,3.3580',
        deviceInfo: 'Driver Tablet',
        syncStatus: 'COMPLETED',
        clientReference: 'offline-002',
        syncedAt: new Date(),
      },
    }),
  ]);

  await Promise.all([
    prisma.facilityVisit.create({
      data: {
        facilityId: facilities[0].id,
        staffId: clientServiceOfficer.id,
        purpose: VisitPurpose.RELATIONSHIP_VISIT,
        notes: 'Discussed contract renewal and service quality.',
        photos: ['visit://marigold'],
        gpsCoordinates: '6.6018,3.3515',
        durationMinutes: 35,
        followUpRequired: true,
        followUpDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    }),
    prisma.facilityVisit.create({
      data: {
        facilityId: facilities[1].id,
        staffId: driver.id,
        purpose: VisitPurpose.WASTE_COLLECTION,
        notes: 'Visit completed with collection.',
        gpsCoordinates: '6.4969,3.3580',
        durationMinutes: 25,
      },
    }),
  ]);

  await Promise.all([
    prisma.complaint.create({
      data: {
        facilityId: facilities[0].id,
        submittedById: hospitalAdmin.id,
        assignedToId: clientServiceOfficer.id,
        reference: 'CMP-1001',
        type: ComplaintType.SERVICE,
        description: 'Collection arrived later than expected last week.',
        status: 'IN_PROGRESS',
      },
    }),
    prisma.complaint.create({
      data: {
        facilityId: facilities[1].id,
        submittedById: hospitalAdmin.id,
        assignedToId: clientServiceOfficer.id,
        reference: 'CMP-1002',
        type: ComplaintType.BILLING,
        description: 'Please clarify last invoice weight total.',
        status: 'OPEN',
      },
    }),
  ]);

  const invoice1 = await prisma.invoice.create({
    data: {
      facilityId: facilities[0].id,
      invoiceNo: `${settings.invoicePrefix}1001`,
      periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      periodEnd: new Date(),
      totalWeight: 450,
      amountDue: 600000,
      tax: 0,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: InvoiceStatus.SENT,
      generatedById: accountant.id,
      deliveryChannels: ['IN_APP', 'EMAIL'],
    },
  });

  const invoice2 = await prisma.invoice.create({
    data: {
      facilityId: facilities[1].id,
      invoiceNo: `${settings.invoicePrefix}1002`,
      periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      periodEnd: new Date(),
      totalWeight: 180,
      amountDue: 72000,
      tax: 0,
      dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      status: InvoiceStatus.OVERDUE,
      generatedById: accountant.id,
      deliveryChannels: ['IN_APP', 'EMAIL', 'WHATSAPP'],
    },
  });

  await prisma.payment.create({
    data: {
      invoiceId: invoice1.id,
      amount: 450000,
      paymentDate: new Date(),
      reference: 'PAY-1001',
      method: 'Bank Transfer',
      status: 'VERIFIED',
      verifiedById: accountant.id,
      receiptNumber: 'RCT-1001',
    },
  });

  await prisma.approvalRequest.create({
    data: {
      type: 'FACILITY_PRICING_UPDATE',
      entityName: 'facility-pricing',
      entityId: facilities[0].id,
      facilityId: facilities[0].id,
      requestedById: clientServiceOfficer.id,
      reviewedById: superAdmin.id,
      status: ApprovalStatus.APPROVED,
      oldValues: { fixedMonthlyRate: 600000 },
      newValues: { fixedMonthlyRate: 650000 },
      reason: 'Annual contract price update.',
      reviewedAt: new Date(),
    },
  });

  await prisma.signupRequest.create({
    data: {
      facilityName: 'Cedar Specialist Lab',
      facilityType: FacilityType.LABORATORY,
      address: '7 Cedar Close, Lekki',
      contactPerson: 'Paul Cedar',
      phone: '08034444444',
      email: 'cedar@lab.local',
      state: 'Lagos',
      lga: 'Eti-Osa',
      status: SignupStatus.UNDER_REVIEW,
      reviewedById: clientServiceOfficer.id,
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        recipientId: superAdmin.id,
        title: 'Platform seeded successfully',
        message: 'Demo data has been prepared for QA review.',
        type: 'SYSTEM',
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
      },
      {
        recipientId: operationsManager.id,
        title: 'SLA alert',
        message: 'Avon Clinic is overdue for collection.',
        type: 'SLA_VIOLATION',
        channel: NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        facilityId: facilities[1].id,
      },
      {
        recipientId: clientServiceOfficer.id,
        title: 'Complaint submitted',
        message: 'A new service complaint needs review.',
        type: 'COMPLAINT_SUBMITTED',
        channel: NotificationChannel.EMAIL,
        status: NotificationStatus.SENT,
        facilityId: facilities[0].id,
      },
    ],
  });

  console.log('\nDemo credentials');
  console.table([
    ...demoAccounts.map((account) => ({
      role: account.role,
      email: account.email,
      username: account.username,
      password: account.password,
    })),
    {
      role: hospitalAdmin.role,
      email: hospitalAdmin.email,
      username: hospitalAdmin.username,
      password: 'Hospital@123',
      facilityCode: facilities[0].code,
    },
  ]);

  console.log('\nSeed summary');
  console.table({
    facilities: facilities.length,
    collections: collections.length,
    invoices: 2,
    notifications: 3,
    signupRequests: 1,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
