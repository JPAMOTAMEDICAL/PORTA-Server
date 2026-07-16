import { CanActivate, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { DocumentsController } from '../src/documents/documents.controller';
import { DocumentsService } from '../src/documents/documents.service';
import { SettingsController } from '../src/settings/settings.controller';
import { SettingsService } from '../src/settings/settings.service';
import { UsersController } from '../src/users/users.controller';
import { UsersService } from '../src/users/users.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { PermissionsGuard } from '../src/auth/permissions.guard';

describe('Feature flows (e2e)', () => {
  let app: INestApplication<App>;
  const documentsService = {
    list: jest.fn(),
    upload: jest.fn(),
    deleteUpload: jest.fn(),
    getStoredFile: jest.fn(),
    getInvoiceDocument: jest.fn(),
    getReceiptDocument: jest.fn(),
  };
  const settingsService = {
    getSettings: jest.fn(),
    upsertSettings: jest.fn(),
  };
  const usersService = {
    findAll: jest.fn(),
    createUser: jest.fn(),
    updateProfile: jest.fn(),
    setStatus: jest.fn(),
    softDelete: jest.fn(),
  };
  const allowGuard: CanActivate = {
    canActivate: () => true,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController, SettingsController, UsersController],
      providers: [
        { provide: DocumentsService, useValue: documentsService },
        { provide: SettingsService, useValue: settingsService },
        { provide: UsersService, useValue: usersService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(allowGuard)
      .overrideGuard(PermissionsGuard)
      .useValue(allowGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts multipart template uploads through the documents API', async () => {
    documentsService.upload.mockImplementation(
      (
        file: { originalname: string; mimetype: string; size: number },
        input: { category: string },
      ) => ({
        storedName: 'template-123.html',
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        category: input.category,
        uploadedAt: '2026-07-15T12:00:00.000Z',
        previewUrl: '/documents/files/template-123.html',
        downloadUrl: '/documents/files/template-123.html/download',
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/documents/uploads?category=TEMPLATE_ASSET')
      .attach('file', Buffer.from('<html><body>Invoice</body></html>'), {
        filename: 'invoice-template.html',
        contentType: 'text/html',
      })
      .expect(201);

    expect(documentsService.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        originalname: 'invoice-template.html',
        mimetype: 'text/html',
      }),
      {
        facilityId: undefined,
        category: 'TEMPLATE_ASSET',
      },
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        category: 'TEMPLATE_ASSET',
        originalName: 'invoice-template.html',
      }),
    );
  });

  it('persists branding updates through the settings API', async () => {
    settingsService.upsertSettings.mockResolvedValue({
      companyName: 'JP Amota Medical Waste',
      invoiceTemplateUrl: '/documents/files/invoice-template.html',
      digitalSignature: '/documents/files/signature.png',
      colorTheme: '#0B5D3B',
    });

    const response = await request(app.getHttpServer())
      .put('/settings')
      .send({
        companyName: 'JP Amota Medical Waste',
        address: '12 Medical Avenue',
        invoiceTemplateUrl: '/documents/files/invoice-template.html',
        digitalSignature: '/documents/files/signature.png',
        colorTheme: '#0B5D3B',
      })
      .expect(200);

    expect(settingsService.upsertSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: 'JP Amota Medical Waste',
        invoiceTemplateUrl: '/documents/files/invoice-template.html',
      }),
    );
    expect(response.body).toEqual(
      expect.objectContaining({
        companyName: 'JP Amota Medical Waste',
      }),
    );
  });

  it('creates staff users and updates their lifecycle status through the users API', async () => {
    usersService.createUser.mockResolvedValue({
      id: 'user-1',
      fullName: 'Finance Officer',
      email: 'finance@example.com',
      employeeId: 'STAFF-26-0009',
      role: 'ACCOUNTANT',
      status: 'ACTIVE',
    });
    usersService.setStatus.mockResolvedValue({
      id: 'user-1',
      status: 'SUSPENDED',
    });

    await request(app.getHttpServer())
      .post('/users')
      .send({
        fullName: 'Finance Officer',
        email: 'finance@example.com',
        password: 'SafePass123!',
        role: 'ACCOUNTANT',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch('/users/user-1/status')
      .send({
        status: 'SUSPENDED',
      })
      .expect(200);

    expect(usersService.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        fullName: 'Finance Officer',
        role: 'ACCOUNTANT',
      }),
    );
    expect(usersService.setStatus).toHaveBeenCalledWith('user-1', 'SUSPENDED');
  });
});
