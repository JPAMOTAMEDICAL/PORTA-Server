import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { PermissionsGuard } from './permissions.guard';
import { AccessControlModule } from '../access-control/access-control.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is required.');
        }

        return {
          secret,
          signOptions: { expiresIn: '1d' },
        };
      },
    }),
    PrismaModule,
    UsersModule,
    AccessControlModule,
    MailModule,
  ],
  providers: [AuthService, JwtStrategy, RolesGuard, PermissionsGuard],
  controllers: [AuthController],
  exports: [
    AuthService,
    JwtModule,
    PassportModule,
    RolesGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
