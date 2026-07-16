import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService, type SmtpSettingsInput } from '../mail/mail.service';

type SettingsPayload = {
  companyName: string;
  systemName?: string;
  tagline?: string;
  address: string;
  phone?: string;
  email?: string;
  website?: string;
  mainLogo?: string;
  secondaryLogo?: string;
  tertiaryLogo?: string;
  invoiceLogo?: string;
  reportLogo?: string;
  adminHeroImage?: string;
  clientHeroImage?: string;
  invoiceTemplateUrl?: string;
  receiptTemplateUrl?: string;
  digitalSignature?: string;
  invoiceFooter?: string;
  receiptFooter?: string;
  colorTheme?: string;
  kgRate?: number;
  invoicePrefix?: string;
  timezone?: string;
  dateFormat?: string;
} & SmtpSettingsInput;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async getSettings() {
    return this.prisma.systemSetting.findFirst();
  }

  async upsertSettings(data: SettingsPayload) {
    const existing = await this.prisma.systemSetting.findFirst();
    const payload = this.buildSettingsPayload(data);

    if (existing) {
      return this.prisma.systemSetting.update({
        where: { id: existing.id },
        data: payload,
      });
    }

    return this.prisma.systemSetting.create({
      data: payload,
    });
  }

  async testEmailConnection(config: SmtpSettingsInput) {
    return this.mailService.verifyConnection(config);
  }

  private buildSettingsPayload(data: SettingsPayload) {
    return {
      companyName: data.companyName.trim(),
      systemName: this.normalizeText(data.systemName),
      tagline: this.normalizeText(data.tagline),
      address: data.address.trim(),
      phone: this.normalizeText(data.phone),
      email: this.normalizeText(data.email),
      website: this.normalizeText(data.website),
      mainLogo: this.normalizeText(data.mainLogo),
      secondaryLogo: this.normalizeText(data.secondaryLogo),
      tertiaryLogo: this.normalizeText(data.tertiaryLogo),
      invoiceLogo: this.normalizeText(data.invoiceLogo),
      reportLogo: this.normalizeText(data.reportLogo),
      adminHeroImage: this.normalizeText(data.adminHeroImage),
      clientHeroImage: this.normalizeText(data.clientHeroImage),
      invoiceTemplateUrl: this.normalizeText(data.invoiceTemplateUrl),
      receiptTemplateUrl: this.normalizeText(data.receiptTemplateUrl),
      digitalSignature: this.normalizeText(data.digitalSignature),
      invoiceFooter: this.normalizeText(data.invoiceFooter),
      receiptFooter: this.normalizeText(data.receiptFooter),
      colorTheme: this.normalizeText(data.colorTheme),
      kgRate: data.kgRate,
      invoicePrefix: this.normalizeText(data.invoicePrefix) ?? 'INV-',
      timezone: this.normalizeText(data.timezone) ?? 'Africa/Lagos',
      dateFormat: this.normalizeText(data.dateFormat) ?? 'dd/MM/yyyy',
      smtpHost: this.normalizeText(data.smtpHost),
      smtpPort:
        data.smtpPort == null || Number.isNaN(Number(data.smtpPort))
          ? null
          : Number(data.smtpPort),
      smtpUsername: this.normalizeText(data.smtpUsername),
      smtpPassword: this.normalizeText(data.smtpPassword),
      smtpEncryption: this.normalizeText(data.smtpEncryption),
      smtpSenderName: this.normalizeText(data.smtpSenderName),
      smtpReplyEmail: this.normalizeText(data.smtpReplyEmail),
      smtpDefaultSenderEmail: this.normalizeText(data.smtpDefaultSenderEmail),
    };
  }

  private normalizeText(value?: string | null) {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
}
