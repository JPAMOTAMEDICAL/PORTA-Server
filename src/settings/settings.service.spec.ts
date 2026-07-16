import { Test, TestingModule } from '@nestjs/testing';
import { SettingsService } from './settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

describe('SettingsService', () => {
  let service: SettingsService;
  let prisma: {
    systemSetting: {
      findFirst: jest.Mock;
      update: jest.Mock<
        unknown,
        [
          {
            where: { id: string };
            data: {
              invoiceFooter?: string;
              receiptFooter?: string;
            };
          },
        ]
      >;
      create: jest.Mock<
        unknown,
        [
          {
            data: {
              companyName: string;
              invoiceTemplateUrl?: string;
              receiptTemplateUrl?: string;
              digitalSignature?: string;
            };
          },
        ]
      >;
    };
  };

  beforeEach(async () => {
    prisma = {
      systemSetting: {
        findFirst: jest.fn(),
        update: jest.fn<
          unknown,
          [
            {
              where: { id: string };
              data: {
                invoiceFooter?: string;
                receiptFooter?: string;
              };
            },
          ]
        >(),
        create: jest.fn<
          unknown,
          [
            {
              data: {
                companyName: string;
                invoiceTemplateUrl?: string;
                receiptTemplateUrl?: string;
                digitalSignature?: string;
              };
            },
          ]
        >(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: MailService,
          useValue: {
            verifyConnection: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SettingsService>(SettingsService);
  });

  it('creates the initial settings record with branding and template fields', async () => {
    prisma.systemSetting.findFirst.mockResolvedValue(null);
    prisma.systemSetting.create.mockResolvedValue({
      id: 'settings-1',
      companyName: 'JP Amota Medical Waste',
      invoiceTemplateUrl: '/documents/files/invoice-template.html',
      receiptTemplateUrl: '/documents/files/receipt-template.html',
      digitalSignature: '/documents/files/signature.png',
      colorTheme: '#0B5D3B',
    });

    const result = await service.upsertSettings({
      companyName: 'JP Amota Medical Waste',
      address: '12 Medical Avenue',
      invoiceTemplateUrl: '/documents/files/invoice-template.html',
      receiptTemplateUrl: '/documents/files/receipt-template.html',
      digitalSignature: '/documents/files/signature.png',
      colorTheme: '#0B5D3B',
    });

    const createArgs = prisma.systemSetting.create.mock.calls[0]?.[0];
    expect(createArgs).toBeDefined();
    expect(createArgs?.data.companyName).toBe('JP Amota Medical Waste');
    expect(createArgs?.data.invoiceTemplateUrl).toBe(
      '/documents/files/invoice-template.html',
    );
    expect(createArgs?.data.receiptTemplateUrl).toBe(
      '/documents/files/receipt-template.html',
    );
    expect(createArgs?.data.digitalSignature).toBe(
      '/documents/files/signature.png',
    );
    expect(result).toEqual(
      expect.objectContaining({
        companyName: 'JP Amota Medical Waste',
      }),
    );
  });

  it('updates the existing settings record when one already exists', async () => {
    prisma.systemSetting.findFirst.mockResolvedValue({
      id: 'settings-1',
    });
    prisma.systemSetting.update.mockResolvedValue({
      id: 'settings-1',
      companyName: 'JP Amota Medical Waste',
      invoiceFooter: 'Updated invoice footer',
      receiptFooter: 'Updated receipt footer',
    });

    const result = await service.upsertSettings({
      companyName: 'JP Amota Medical Waste',
      address: '12 Medical Avenue',
      invoiceFooter: 'Updated invoice footer',
      receiptFooter: 'Updated receipt footer',
    });

    const updateArgs = prisma.systemSetting.update.mock.calls[0]?.[0];
    expect(updateArgs).toBeDefined();
    expect(updateArgs?.where.id).toBe('settings-1');
    expect(updateArgs?.data.invoiceFooter).toBe('Updated invoice footer');
    expect(updateArgs?.data.receiptFooter).toBe('Updated receipt footer');
    expect(result).toEqual(
      expect.objectContaining({
        invoiceFooter: 'Updated invoice footer',
      }),
    );
  });
});
