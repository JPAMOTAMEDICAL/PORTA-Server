import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { mkdir, writeFile } from 'fs/promises';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('fs/promises', () => ({
  mkdir: jest.fn(),
  readFile: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
  writeFile: jest.fn(),
}));

describe('DocumentsService', () => {
  let service: DocumentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        {
          provide: PrismaService,
          useValue: {
            facility: {
              findUnique: jest.fn(),
            },
            invoice: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            payment: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            complaint: {
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            systemSetting: {
              findFirst: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('accepts HTML template uploads for dynamic invoice and receipt rendering', async () => {
    const result = await service.upload(
      {
        originalname: 'invoice-template.html',
        mimetype: 'text/html',
        size: 128,
        buffer: Buffer.from('<html><body>Invoice</body></html>'),
      },
      {
        category: 'TEMPLATE_ASSET',
      },
    );

    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
    expect(result.category).toBe('TEMPLATE_ASSET');
    expect(result.previewUrl).toContain('/documents/files/');
    expect(result.downloadUrl).toContain('/documents/files/');
  });

  it('rejects unsupported upload types before writing to storage', async () => {
    await expect(
      service.upload(
        {
          originalname: 'malware.exe',
          mimetype: 'application/x-msdownload',
          size: 64,
          buffer: Buffer.from('boom'),
        },
        {
          category: 'TEMPLATE_ASSET',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(writeFile).not.toHaveBeenCalled();
  });
});
