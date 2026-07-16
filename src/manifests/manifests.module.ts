import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ManifestsController } from './manifests.controller';
import { ManifestsService } from './manifests.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [ManifestsController],
  providers: [ManifestsService],
})
export class ManifestsModule {}
