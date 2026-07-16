import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { CollectionsModule } from './collections/collections.module';
import { BillingModule } from './billing/billing.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PaymentsModule } from './payments/payments.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { AiModule } from './ai/ai.module';
import { NotificationsModule } from './notifications/notifications.module';
import { VisitsModule } from './visits/visits.module';
import { ComplaintsModule } from './complaints/complaints.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { SignupRequestsModule } from './signup-requests/signup-requests.module';
import { DriversModule } from './drivers/drivers.module';
import { RoutesModule } from './routes/routes.module';
import { ManifestsModule } from './manifests/manifests.module';
import { DocumentsModule } from './documents/documents.module';
import { AccessControlModule } from './access-control/access-control.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile:
        process.env.NODE_ENV === 'production' ||
        process.env.IGNORE_ENV_FILE === 'true',
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    FacilitiesModule,
    CollectionsModule,
    BillingModule,
    InvoicesModule,
    PaymentsModule,
    ReportsModule,
    SettingsModule,
    AiModule,
    NotificationsModule,
    VisitsModule,
    ComplaintsModule,
    ApprovalsModule,
    SignupRequestsModule,
    DriversModule,
    RoutesModule,
    ManifestsModule,
    DocumentsModule,
    AccessControlModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
