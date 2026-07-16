import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as nodemailer from 'nodemailer';

export type SmtpSettingsInput = {
  smtpHost?: string | null;
  smtpPort?: number | null;
  smtpUsername?: string | null;
  smtpPassword?: string | null;
  smtpEncryption?: string | null;
  smtpSenderName?: string | null;
  smtpReplyEmail?: string | null;
  smtpDefaultSenderEmail?: string | null;
};

type ResolvedSmtpSettings = {
  smtpHost: string;
  smtpPort: number;
  smtpUsername: string;
  smtpPassword: string;
  smtpEncryption: 'NONE' | 'TLS' | 'SSL';
  smtpSenderName: string;
  smtpReplyEmail: string;
  smtpDefaultSenderEmail: string;
};

type MailMessage = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  from?: string;
};

@Injectable()
export class MailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async verifyConnection(config?: SmtpSettingsInput) {
    const settings = await this.resolveSmtpSettings(config);
    const transport = this.createTransport(settings);

    await transport.verify();

    return {
      success: true,
      host: settings.smtpHost,
      port: settings.smtpPort,
      encryption: settings.smtpEncryption,
      sender: this.buildFromAddress(settings),
    };
  }

  async sendMail(message: MailMessage, config?: SmtpSettingsInput) {
    const settings = await this.resolveSmtpSettings(config);
    const transport = this.createTransport(settings);

    return transport.sendMail({
      from: message.from ?? this.buildFromAddress(settings),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html ?? this.wrapHtmlBody(message.subject, message.text),
      replyTo:
        (message.replyTo ?? settings.smtpReplyEmail) ||
        settings.smtpDefaultSenderEmail,
    });
  }

  private async resolveSmtpSettings(config?: SmtpSettingsInput) {
    const envSmtpPort = this.configService.get<number | string | undefined>(
      'SMTP_PORT',
    );
    const envSmtpEncryption = this.configService.get<string>(
      'SMTP_ENCRYPTION',
      'TLS',
    );
    const stored = await this.prisma.systemSetting.findFirst({
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpUsername: true,
        smtpPassword: true,
        smtpEncryption: true,
        smtpSenderName: true,
        smtpReplyEmail: true,
        smtpDefaultSenderEmail: true,
      },
    });

    const merged = {
      smtpHost:
        config?.smtpHost ??
        stored?.smtpHost ??
        this.configService.get<string>('SMTP_HOST', ''),
      smtpPort: Number(
        config?.smtpPort ??
          stored?.smtpPort ??
          (envSmtpPort === undefined ? 0 : envSmtpPort),
      ),
      smtpUsername:
        config?.smtpUsername ??
        stored?.smtpUsername ??
        this.configService.get<string>('SMTP_USERNAME', ''),
      smtpPassword:
        config?.smtpPassword ??
        stored?.smtpPassword ??
        this.configService.get<string>('SMTP_PASSWORD', ''),
      smtpEncryption: String(
        config?.smtpEncryption ?? stored?.smtpEncryption ?? envSmtpEncryption,
      ).toUpperCase(),
      smtpSenderName:
        config?.smtpSenderName ??
        stored?.smtpSenderName ??
        this.configService.get<string>('SMTP_SENDER_NAME', ''),
      smtpReplyEmail:
        config?.smtpReplyEmail ??
        stored?.smtpReplyEmail ??
        this.configService.get<string>('SMTP_REPLY_EMAIL', ''),
      smtpDefaultSenderEmail:
        config?.smtpDefaultSenderEmail ??
        stored?.smtpDefaultSenderEmail ??
        this.configService.get<string>('SMTP_DEFAULT_SENDER_EMAIL', ''),
    };

    if (!merged.smtpHost.trim()) {
      throw new BadRequestException(
        'SMTP host is required before email can be used.',
      );
    }

    if (!Number.isFinite(merged.smtpPort) || merged.smtpPort <= 0) {
      throw new BadRequestException(
        'SMTP port must be a valid positive number.',
      );
    }

    if (!merged.smtpDefaultSenderEmail.trim()) {
      throw new BadRequestException(
        'Default sender email is required before email can be used.',
      );
    }

    const normalizedEncryption = this.normalizeEncryption(
      merged.smtpEncryption,
    );

    return {
      smtpHost: merged.smtpHost.trim(),
      smtpPort: merged.smtpPort,
      smtpUsername: merged.smtpUsername.trim(),
      smtpPassword: merged.smtpPassword,
      smtpEncryption: normalizedEncryption,
      smtpSenderName: merged.smtpSenderName.trim(),
      smtpReplyEmail: merged.smtpReplyEmail.trim(),
      smtpDefaultSenderEmail: merged.smtpDefaultSenderEmail.trim(),
    } satisfies ResolvedSmtpSettings;
  }

  private normalizeEncryption(value: string): ResolvedSmtpSettings['smtpEncryption'] {
    if (value === 'SSL' || value === 'TLS' || value === 'NONE') {
      return value;
    }

    throw new BadRequestException(
      'SMTP encryption must be NONE, TLS, or SSL.',
    );
  }

  private createTransport(settings: ResolvedSmtpSettings) {
    const usesAuth =
      settings.smtpUsername.length > 0 || settings.smtpPassword.length > 0;

    return nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpEncryption === 'SSL',
      requireTLS: settings.smtpEncryption === 'TLS',
      auth: usesAuth
        ? {
            user: settings.smtpUsername,
            pass: settings.smtpPassword,
          }
        : undefined,
    });
  }

  private buildFromAddress(settings: ResolvedSmtpSettings) {
    return settings.smtpSenderName
      ? `"${settings.smtpSenderName.replace(/"/g, '')}" <${settings.smtpDefaultSenderEmail}>`
      : settings.smtpDefaultSenderEmail;
  }

  private wrapHtmlBody(subject: string, text: string) {
    const escapedText = this.escapeHtml(text).replace(/\n/g, '<br />');

    return `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
    <h2 style="margin-bottom: 16px;">${this.escapeHtml(subject)}</h2>
    <p>${escapedText}</p>
  </body>
</html>`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
