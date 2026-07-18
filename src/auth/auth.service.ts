import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { SignOptions } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { Role, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { AccessControlService } from '../access-control/access-control.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly accessControlService: AccessControlService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async register(data: {
    email: string;
    username?: string;
    phone?: string;
    password: string;
    fullName: string;
    facilityId?: string;
  }) {
    const existingUser = await this.usersService.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }

    return this.usersService.createUser({
      ...data,
      role: Role.HOSPITAL_ADMIN,
    });
  }

  async validateUser(identifier: string, password: string): Promise<User> {
    const normalizedIdentifier = identifier?.trim();
    if (!normalizedIdentifier || !password) {
      throw new BadRequestException('Identifier and password are required.');
    }

    const user = await this.usersService.findByIdentifier(normalizedIdentifier);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    await this.usersService.updateLastLogin(user.id);
    return user;
  }

  async login(identifier: string, password: string, rememberMe = false) {
    const user = await this.validateUser(identifier, password);
    const permissions = await this.accessControlService.getUserPermissionCodes(
      user.id,
    );

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      facilityId: user.facilityId,
    };

    const expiresIn = rememberMe
      ? this.configService.get<string>('JWT_REMEMBER_ME_EXPIRES_IN', '7d')
      : this.configService.get<string>('JWT_EXPIRES_IN', '1d');
    const normalizedExpiresIn = expiresIn as SignOptions['expiresIn'];

    return {
      accessToken: await this.jwtService.signAsync(payload, {
        expiresIn: normalizedExpiresIn,
      }),
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        facilityId: user.facilityId,
        phone: user.phone,
        status: user.status,
        permissions,
        lastLoginAt: new Date(),
      },
    };
  }

  async forgotPassword(identifier: string) {
    const normalizedIdentifier = identifier?.trim();
    if (!normalizedIdentifier) {
      throw new BadRequestException('Identifier is required.');
    }

    const user = await this.usersService.findByIdentifier(normalizedIdentifier);
    if (!user) {
      throw new NotFoundException(
        'No account was found for the supplied identifier.',
      );
    }

    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    const resetInstructions = [
      `A password reset request was received for ${user.fullName}.`,
      `Use this secure reset token to complete the password reset flow: ${token}`,
      `This token expires at ${expiresAt.toISOString()}.`,
      'If you did not request this reset, contact the system administrator immediately.',
    ].join('\n');

    await this.mailService.sendMail({
      to: user.email,
      subject: 'Password reset instructions',
      text: resetInstructions,
      html: `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
    <h2>Password reset instructions</h2>
    <p>A password reset request was received for <strong>${this.escapeHtml(user.fullName)}</strong>.</p>
    <p>Use the token below in the portal reset form:</p>
    <p style="font-size: 18px; font-weight: 700; letter-spacing: 0.08em;">${this.escapeHtml(token)}</p>
    <p>This token expires at <strong>${this.escapeHtml(expiresAt.toISOString())}</strong>.</p>
    <p>If you did not request this reset, contact the system administrator immediately.</p>
  </body>
</html>`,
    });

    const response = {
      message: 'Password reset instructions sent successfully.',
      expiresAt,
    };

    if (process.env.NODE_ENV !== 'production') {
      return {
        ...response,
        resetToken: token,
      };
    }

    return response;
  }

  async resetPassword(token: string, newPassword: string) {
    if (!token?.trim() || !newPassword) {
      throw new BadRequestException(
        'Reset token and new password are required.',
      );
    }

    this.assertValidNewPassword(newPassword);

    const resetToken = await this.prisma.passwordResetToken.findFirst({
      where: {
        token: token.trim(),
      },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('Reset token is invalid or has expired.');
    }

    await this.usersService.updatePassword(resetToken.userId, newPassword);
    await this.prisma.user.update({
      where: { id: resetToken.userId },
      data: { status: 'ACTIVE' },
    });
    await this.prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    });

    return { message: 'Password reset completed successfully.' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (!currentPassword || !newPassword) {
      throw new BadRequestException(
        'Current password and new password are required.',
      );
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password.',
      );
    }
    this.assertValidNewPassword(newPassword);

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is invalid.');
    }

    await this.usersService.updatePassword(user.id, newPassword);
    if (user.status === 'PASSWORD_CHANGE_REQUIRED') {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE' },
      });
    }

    return { message: 'Password updated successfully.' };
  }

  private assertValidNewPassword(newPassword: string) {
    const normalizedPassword = newPassword.trim();
    if (normalizedPassword.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters long.',
      );
    }
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async me(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletedAt: null,
      },
      include: {
        facility: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const { passwordHash, ...safeUser } = user;
    void passwordHash;
    return safeUser;
  }
}
