import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Permissions(PermissionCodes.SETTINGS_VIEW)
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Put()
  @Permissions(PermissionCodes.SETTINGS_UPSERT)
  upsertSettings(
    @Body()
    body: {
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
      smtpHost?: string;
      smtpPort?: number;
      smtpUsername?: string;
      smtpPassword?: string;
      smtpEncryption?: string;
      smtpSenderName?: string;
      smtpReplyEmail?: string;
      smtpDefaultSenderEmail?: string;
    },
  ) {
    return this.settingsService.upsertSettings(body);
  }

  @Post('email/test-connection')
  @Permissions(PermissionCodes.SETTINGS_UPSERT)
  testEmailConnection(
    @Body()
    body: {
      smtpHost?: string;
      smtpPort?: number;
      smtpUsername?: string;
      smtpPassword?: string;
      smtpEncryption?: string;
      smtpSenderName?: string;
      smtpReplyEmail?: string;
      smtpDefaultSenderEmail?: string;
    },
  ) {
    return this.settingsService.testEmailConnection(body);
  }
}
