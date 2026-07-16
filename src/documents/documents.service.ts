import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createReadStream } from 'fs';
import { mkdir, readFile, stat, unlink, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { randomUUID } from 'crypto';
import {
  coerceStoredDocumentReference,
  coerceStoredDocumentReferences,
  enrichStoredDocumentReference,
  type StoredDocumentReference,
} from './document-reference';
import {
  defaultInvoiceTemplate,
  defaultReceiptTemplate,
  renderPdfDocument,
} from './document-template-renderer';

type DocumentUploadCategory =
  | 'PAYMENT_PROOF'
  | 'COMPLAINT_EVIDENCE'
  | 'STAFF_PHOTO'
  | 'BRANDING_ASSET'
  | 'TEMPLATE_ASSET'
  | 'SIGNATURE_ASSET';

export type FacilityDocumentRecord = {
  id: string;
  type: 'INVOICE' | 'RECEIPT' | 'PAYMENT_PROOF' | 'COMPLAINT_EVIDENCE';
  title: string;
  fileName: string;
  detail: string;
  createdAt: string;
  status: string;
  mimeType: string;
  size: number | null;
  previewUrl: string;
  downloadUrl: string;
  relatedEntityId: string;
  relatedEntityType: 'invoice' | 'payment' | 'complaint';
};

export type FileResponsePayload = {
  stream: ReturnType<typeof createReadStream>;
  fileName: string;
  mimeType: string;
  size?: number;
};

type MulterFileLike = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

const STORAGE_ROOT = join(process.cwd(), 'storage', 'documents');
const ALLOWED_CATEGORIES: DocumentUploadCategory[] = [
  'PAYMENT_PROOF',
  'COMPLAINT_EVIDENCE',
  'STAFF_PHOTO',
  'BRANDING_ASSET',
  'TEMPLATE_ASSET',
  'SIGNATURE_ASSET',
];
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/html',
  'application/xhtml+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId?: string): Promise<FacilityDocumentRecord[]> {
    const [invoices, payments, complaints] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          deletedAt: null,
          facilityId,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.payment.findMany({
        where: facilityId
          ? {
              deletedAt: null,
              invoice: { facilityId },
            }
          : { deletedAt: null },
        include: {
          invoice: true,
        },
        orderBy: { paymentDate: 'desc' },
      }),
      this.prisma.complaint.findMany({
        where: {
          deletedAt: null,
          facilityId,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const invoiceDocs: FacilityDocumentRecord[] = invoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: 'INVOICE',
      title: invoice.invoiceNo,
      fileName: `${invoice.invoiceNo}.pdf`,
      detail: 'Invoice PDF',
      createdAt: invoice.createdAt.toISOString(),
      status: invoice.status,
      mimeType: 'application/pdf',
      size: null,
      previewUrl: `/documents/invoices/${invoice.id}`,
      downloadUrl: `/documents/invoices/${invoice.id}/download`,
      relatedEntityId: invoice.id,
      relatedEntityType: 'invoice',
    }));

    const receiptDocs: FacilityDocumentRecord[] = payments
      .filter((payment) => Boolean(payment.receiptNumber))
      .map((payment) => ({
        id: `receipt-${payment.id}`,
        type: 'RECEIPT',
        title: payment.receiptNumber ?? payment.reference,
        fileName: `${payment.receiptNumber ?? payment.reference}.pdf`,
        detail: payment.invoice.invoiceNo,
        createdAt: payment.paymentDate.toISOString(),
        status: payment.status,
        mimeType: 'application/pdf',
        size: null,
        previewUrl: `/documents/receipts/${payment.id}`,
        downloadUrl: `/documents/receipts/${payment.id}/download`,
        relatedEntityId: payment.id,
        relatedEntityType: 'payment',
      }));

    const paymentProofDocs = payments
      .map((payment): FacilityDocumentRecord | null => {
        const proof = coerceStoredDocumentReference(payment.proofOfPayment);
        if (!proof?.previewUrl || !proof.downloadUrl) {
          return null;
        }

        return {
          id: `payment-proof-${payment.id}`,
          type: 'PAYMENT_PROOF' as const,
          title: `Proof for ${payment.reference}`,
          fileName: proof.originalName,
          detail: payment.invoice.invoiceNo,
          createdAt: proof.uploadedAt || payment.createdAt.toISOString(),
          status: payment.status,
          mimeType: proof.mimeType,
          size: proof.size || null,
          previewUrl: proof.previewUrl,
          downloadUrl: proof.downloadUrl,
          relatedEntityId: payment.id,
          relatedEntityType: 'payment' as const,
        };
      })
      .filter((item): item is FacilityDocumentRecord => item !== null);

    const complaintDocs: FacilityDocumentRecord[] = complaints.flatMap(
      (complaint) =>
        coerceStoredDocumentReferences(complaint.attachments).map(
          (attachment, index) => ({
            id: `complaint-${complaint.id}-${index}`,
            type: 'COMPLAINT_EVIDENCE',
            title: complaint.reference,
            fileName: attachment.originalName,
            detail: complaint.type,
            createdAt:
              attachment.uploadedAt || complaint.createdAt.toISOString(),
            status: complaint.status,
            mimeType: attachment.mimeType,
            size: attachment.size || null,
            previewUrl: attachment.previewUrl ?? attachment.downloadUrl ?? '#',
            downloadUrl: attachment.downloadUrl ?? attachment.previewUrl ?? '#',
            relatedEntityId: complaint.id,
            relatedEntityType: 'complaint',
          }),
        ),
    );

    return [
      ...invoiceDocs,
      ...receiptDocs,
      ...paymentProofDocs,
      ...complaintDocs,
    ].sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    );
  }

  async upload(
    file: MulterFileLike | undefined,
    input: { facilityId?: string; category: string },
  ): Promise<StoredDocumentReference> {
    if (!file?.buffer || !file.originalname) {
      throw new BadRequestException('A file upload is required.');
    }

    if (
      !ALLOWED_CATEGORIES.includes(input.category as DocumentUploadCategory)
    ) {
      throw new BadRequestException('Unsupported document category.');
    }

    if (file.mimetype && !ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
      throw new BadRequestException('Unsupported file type.');
    }

    if (Number(file.size ?? file.buffer.byteLength) > 10 * 1024 * 1024) {
      throw new BadRequestException('File size must not exceed 10MB.');
    }

    if (input.facilityId) {
      await this.ensureFacility(input.facilityId);
    }

    await mkdir(STORAGE_ROOT, { recursive: true });

    const extension = extname(file.originalname) || '';
    const storedName = `${input.category.toLowerCase()}-${Date.now()}-${randomUUID()}${extension}`;

    await writeFile(join(STORAGE_ROOT, storedName), file.buffer);

    return enrichStoredDocumentReference({
      storedName,
      originalName: file.originalname,
      mimeType: file.mimetype || 'application/octet-stream',
      size: Number(file.size ?? file.buffer.byteLength),
      category: input.category,
      facilityId: input.facilityId,
      uploadedAt: new Date().toISOString(),
    });
  }

  async deleteUpload(storedName: string) {
    const safeStoredName = this.assertSafeStoredName(storedName);
    const filePath = join(STORAGE_ROOT, safeStoredName);
    const exists = await stat(filePath).catch(() => null);

    if (!exists) {
      throw new NotFoundException('Uploaded document not found.');
    }

    await unlink(filePath);
    return { success: true };
  }

  async getStoredFile(storedName: string): Promise<FileResponsePayload> {
    const safeStoredName = this.assertSafeStoredName(storedName);
    const filePath = join(STORAGE_ROOT, safeStoredName);
    const fileStats = await stat(filePath).catch(() => null);

    if (!fileStats) {
      throw new NotFoundException('Stored document not found.');
    }

    const metadata = await this.findStoredFileMetadata(safeStoredName);
    return {
      stream: createReadStream(filePath),
      fileName: metadata?.originalName || safeStoredName,
      mimeType: metadata?.mimeType || 'application/octet-stream',
      size: fileStats.size,
    };
  }

  async getInvoiceDocument(id: string): Promise<FileResponsePayload> {
    const [invoice, settings] = await Promise.all([
      this.prisma.invoice.findFirst({
        where: { id, deletedAt: null },
        include: {
          facility: true,
          generatedBy: true,
        },
      }),
      this.prisma.systemSetting.findFirst(),
    ]);

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    const templateHtml = await this.loadTemplateHtml(
      settings?.invoiceTemplateUrl,
    );
    const pdf = await renderPdfDocument({
      templateHtml,
      fallbackTemplate: defaultInvoiceTemplate,
      model: {
        invoiceNo: invoice.invoiceNo,
        issueDate: this.formatDate(invoice.createdAt),
        dueDate: this.formatDate(invoice.dueDate),
        invoiceStatus: invoice.status,
        facilityName: invoice.facility?.name ?? 'Facility',
        facilityAddress:
          invoice.facility?.address ?? 'No facility address provided',
        facilityEmail: invoice.facility?.email ?? 'No facility email provided',
        facilityPhone: invoice.facility?.phone ?? 'No facility phone provided',
        companyName: settings?.companyName ?? 'JP Amota Medical Waste',
        companyAddress: settings?.address ?? 'No company address configured',
        companyContactLine:
          [settings?.phone, settings?.email, settings?.website]
            .filter(Boolean)
            .join(' | ') || 'No company contact details configured',
        periodRange: `${this.formatDate(invoice.periodStart)} - ${this.formatDate(invoice.periodEnd)}`,
        generatedBy: invoice.generatedBy?.fullName ?? 'System',
        templateSource: templateHtml
          ? 'Uploaded HTML template'
          : settings?.invoiceTemplateUrl
            ? 'Uploaded asset with system fallback layout'
            : 'System default template',
        totalWeight:
          Number(invoice.totalWeight) > 0
            ? `${Number(invoice.totalWeight).toFixed(2)} kg`
            : 'Pending weight confirmation',
        subtotal: this.formatCurrency(
          Number(invoice.amountDue) - Number(invoice.tax ?? 0),
        ),
        tax: this.formatCurrency(Number(invoice.tax ?? 0)),
        amountDue: this.formatCurrency(Number(invoice.amountDue)),
        lineItemsRowsHtml: this.buildLineItemsRows([
          {
            description: 'Medical waste collection and treatment service',
            period: `${this.formatDate(invoice.periodStart)} - ${this.formatDate(invoice.periodEnd)}`,
            weight:
              Number(invoice.totalWeight) > 0
                ? `${Number(invoice.totalWeight).toFixed(2)} kg`
                : 'N/A',
            amount: this.formatCurrency(Number(invoice.amountDue)),
          },
        ]),
        logoStripHtml: await this.buildLogoStripHtml([
          settings?.mainLogo,
          settings?.secondaryLogo,
          settings?.tertiaryLogo,
          settings?.invoiceLogo,
        ]),
        invoiceFooter:
          settings?.invoiceFooter ??
          'Thank you for partnering with JP Amota Medical Waste.',
        signatureHtml: await this.buildSignatureHtml(
          settings?.digitalSignature,
        ),
        themeColor: settings?.colorTheme ?? '#0B5D3B',
      },
    });

    return {
      stream: createReadStream(
        await this.writeGeneratedDocument(`invoice-${invoice.id}.pdf`, pdf),
      ),
      fileName: `${invoice.invoiceNo}.pdf`,
      mimeType: 'application/pdf',
      size: Buffer.byteLength(pdf),
    };
  }

  async getReceiptDocument(id: string): Promise<FileResponsePayload> {
    const [payment, settings] = await Promise.all([
      this.prisma.payment.findFirst({
        where: { id, deletedAt: null },
        include: {
          invoice: {
            include: {
              facility: true,
            },
          },
          verifiedBy: true,
        },
      }),
      this.prisma.systemSetting.findFirst(),
    ]);

    if (!payment) {
      throw new NotFoundException('Receipt source payment not found.');
    }

    const receiptNo = payment.receiptNumber ?? payment.reference;
    const templateHtml = await this.loadTemplateHtml(
      settings?.receiptTemplateUrl,
    );
    const pdf = await renderPdfDocument({
      templateHtml,
      fallbackTemplate: defaultReceiptTemplate,
      model: {
        receiptNumber: receiptNo,
        receiptDate: this.formatDate(payment.paymentDate),
        invoiceNo: payment.invoice.invoiceNo,
        paymentStatus: payment.status,
        facilityName: payment.invoice.facility?.name ?? 'Facility',
        facilityAddress:
          payment.invoice.facility?.address ?? 'No facility address provided',
        facilityEmail:
          payment.invoice.facility?.email ?? 'No facility email provided',
        facilityPhone:
          payment.invoice.facility?.phone ?? 'No facility phone provided',
        companyName: settings?.companyName ?? 'JP Amota Medical Waste',
        companyAddress: settings?.address ?? 'No company address configured',
        companyContactLine:
          [settings?.phone, settings?.email, settings?.website]
            .filter(Boolean)
            .join(' | ') || 'No company contact details configured',
        paymentMethod: payment.method,
        paymentReference: payment.reference,
        paymentAmount: this.formatCurrency(Number(payment.amount)),
        verifiedBy: payment.verifiedBy?.fullName ?? 'Finance team',
        periodRange: `${this.formatDate(payment.invoice.periodStart)} - ${this.formatDate(payment.invoice.periodEnd)}`,
        paymentNotes:
          payment.notes || 'Payment received and recorded successfully.',
        templateSource: templateHtml
          ? 'Uploaded HTML template'
          : settings?.receiptTemplateUrl
            ? 'Uploaded asset with system fallback layout'
            : 'System default template',
        logoStripHtml: await this.buildLogoStripHtml([
          settings?.mainLogo,
          settings?.secondaryLogo,
          settings?.tertiaryLogo,
          settings?.reportLogo,
        ]),
        receiptFooter:
          settings?.receiptFooter ??
          'Receipt generated automatically from the verified payment record.',
        signatureHtml: await this.buildSignatureHtml(
          settings?.digitalSignature,
        ),
        themeColor: settings?.colorTheme ?? '#0B5D3B',
      },
    });

    return {
      stream: createReadStream(
        await this.writeGeneratedDocument(`receipt-${payment.id}.pdf`, pdf),
      ),
      fileName: `${receiptNo}.pdf`,
      mimeType: 'application/pdf',
      size: Buffer.byteLength(pdf),
    };
  }

  private async buildLogoStripHtml(urls: Array<string | null | undefined>) {
    const assets = (
      await Promise.all(
        urls.filter(Boolean).map((url) => this.loadAssetDataUri(url)),
      )
    ).filter((value): value is string => Boolean(value));

    return assets
      .map((src) => `<img src="${src}" alt="Document logo" />`)
      .join('');
  }

  private async buildSignatureHtml(url?: string | null) {
    const dataUri = await this.loadAssetDataUri(url);
    return dataUri
      ? `<img src="${dataUri}" alt="Digital signature" />`
      : '<span>Authorized Digital Signature</span>';
  }

  private buildLineItemsRows(
    lines: Array<{
      description: string;
      period: string;
      weight: string;
      amount: string;
    }>,
  ) {
    return lines
      .map(
        (line) => `<tr>
  <td>${this.escapeHtml(line.description)}</td>
  <td>${this.escapeHtml(line.period)}</td>
  <td>${this.escapeHtml(line.weight)}</td>
  <td>${this.escapeHtml(line.amount)}</td>
</tr>`,
      )
      .join('');
  }

  private async loadTemplateHtml(url?: string | null) {
    if (!url) {
      return null;
    }

    const template = await this.readAsset(url);
    if (!template) {
      return null;
    }

    const lowerMimeType = template.mimeType.toLowerCase();
    const lowerName = template.fileName.toLowerCase();
    if (
      lowerMimeType === 'text/html' ||
      lowerMimeType === 'application/xhtml+xml' ||
      lowerName.endsWith('.html') ||
      lowerName.endsWith('.htm')
    ) {
      return template.buffer.toString('utf8');
    }

    return null;
  }

  private async loadAssetDataUri(url?: string | null) {
    if (!url) {
      return null;
    }

    const asset = await this.readAsset(url);
    if (!asset) {
      return null;
    }

    return `data:${asset.mimeType};base64,${asset.buffer.toString('base64')}`;
  }

  private async readAsset(url: string) {
    const storedName = this.extractStoredName(url);
    if (storedName) {
      const safeStoredName = this.assertSafeStoredName(storedName);
      const filePath = join(STORAGE_ROOT, safeStoredName);
      const buffer = await readFile(filePath).catch(() => null);
      if (!buffer) {
        return null;
      }

      const metadata = await this.findStoredFileMetadata(safeStoredName);
      return {
        buffer,
        fileName: metadata?.originalName || safeStoredName,
        mimeType: metadata?.mimeType || 'application/octet-stream',
      };
    }

    const response = await fetch(url).catch(() => null);
    if (!response?.ok) {
      return null;
    }

    return {
      buffer: Buffer.from(await response.arrayBuffer()),
      fileName: url.split('/').at(-1) ?? 'asset',
      mimeType:
        response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  private extractStoredName(url: string) {
    const match = url.match(/\/documents\/files\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }

  private formatDate(value: Date) {
    return new Intl.DateTimeFormat('en-NG', {
      dateStyle: 'medium',
      timeZone: 'Africa/Lagos',
    }).format(value);
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 2,
    }).format(value);
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async writeGeneratedDocument(fileName: string, content: Buffer) {
    const generatedRoot = join(STORAGE_ROOT, 'generated');
    await mkdir(generatedRoot, { recursive: true });
    const fullPath = join(generatedRoot, fileName);
    await writeFile(fullPath, content);
    return fullPath;
  }

  private async findStoredFileMetadata(storedName: string) {
    const settings = await this.prisma.systemSetting.findFirst();
    const settingsAssets = [
      settings?.mainLogo,
      settings?.secondaryLogo,
      settings?.tertiaryLogo,
      settings?.invoiceLogo,
      settings?.reportLogo,
      settings?.adminHeroImage,
      settings?.clientHeroImage,
      settings?.invoiceTemplateUrl,
      settings?.receiptTemplateUrl,
      settings?.digitalSignature,
    ]
      .filter(Boolean)
      .map((value) => coerceStoredDocumentReference(value))
      .filter((item): item is StoredDocumentReference => Boolean(item));

    const matchedSettingsAsset = settingsAssets.find(
      (item) => item.storedName === storedName,
    );
    if (matchedSettingsAsset) {
      return matchedSettingsAsset;
    }

    const payment = await this.prisma.payment.findFirst({
      where: {
        deletedAt: null,
        proofOfPayment: {
          contains: storedName,
        },
      },
    });

    if (payment) {
      return coerceStoredDocumentReference(payment.proofOfPayment);
    }

    const complaint = await this.prisma.complaint.findFirst({
      where: {
        deletedAt: null,
        attachments: {
          string_contains: storedName,
        },
      },
    });

    if (!complaint) {
      return null;
    }

    return coerceStoredDocumentReferences(complaint.attachments).find(
      (item) => item.storedName === storedName,
    );
  }

  private assertSafeStoredName(storedName: string) {
    const decoded = decodeURIComponent(storedName);
    if (decoded.includes('/') || decoded.includes('\\')) {
      throw new BadRequestException('Invalid stored document reference.');
    }

    return decoded;
  }

  private async ensureFacility(facilityId: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { id: facilityId },
    });

    if (!facility || facility.deletedAt) {
      throw new NotFoundException('Facility not found.');
    }
  }
}
