import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AccessControlController } from './access-control.controller';
import { AccessControlService } from './access-control.service';

@Global()
@Module({
  imports: [PrismaModule],
  controllers: [AccessControlController],
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
