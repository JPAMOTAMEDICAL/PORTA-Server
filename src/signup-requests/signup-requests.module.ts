import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FacilitiesModule } from '../facilities/facilities.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SignupRequestsController } from './signup-requests.controller';
import { SignupRequestsService } from './signup-requests.service';

@Module({
  imports: [PrismaModule, FacilitiesModule, UsersModule, NotificationsModule],
  controllers: [SignupRequestsController],
  providers: [SignupRequestsService],
  exports: [SignupRequestsService],
})
export class SignupRequestsModule {}
