import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Permissions(PermissionCodes.PAYMENTS_VIEW)
  list(@Query('facilityId') facilityId?: string) {
    return this.paymentsService.list(facilityId);
  }

  @Get('receipts')
  @Permissions(PermissionCodes.RECEIPTS_VIEW)
  listReceipts(@Query('facilityId') facilityId?: string) {
    return this.paymentsService.listReceipts(facilityId);
  }

  @Get('bank-accounts')
  @Permissions(PermissionCodes.BANK_ACCOUNTS_VIEW)
  listBankAccounts() {
    return this.paymentsService.listBankAccounts();
  }

  @Post()
  @Permissions(PermissionCodes.PAYMENTS_CREATE)
  create(
    @Body()
    body: {
      invoiceId: string;
      amount: number;
      method: string;
      notes?: string;
      reference?: string;
      proofOfPayment?: unknown;
    },
  ) {
    return this.paymentsService.create(body);
  }

  @Post('paystack/initialize')
  @Permissions(PermissionCodes.PAYSTACK_INIT)
  initializePaystack(
    @Body()
    body: {
      invoiceId: string;
      amount: number;
      callbackUrl?: string;
      notes?: string;
    },
  ) {
    return this.paymentsService.initializePaystack(body);
  }

  @Post('paystack/verify')
  @Permissions(PermissionCodes.PAYSTACK_VERIFY)
  verifyPaystack(@Body() body: { reference: string; verifiedById: string }) {
    return this.paymentsService.verifyPaystack(
      body.reference,
      body.verifiedById,
    );
  }

  @Post('bank-accounts')
  @Permissions(PermissionCodes.BANK_ACCOUNTS_UPSERT)
  saveBankAccount(
    @Body()
    body: {
      id?: string;
      bankName: string;
      accountName: string;
      accountNumber: string;
      isDefault?: boolean;
    },
  ) {
    return this.paymentsService.saveBankAccount(body);
  }

  @Patch('bank-accounts/:id/default')
  @Permissions(PermissionCodes.BANK_ACCOUNTS_SET_DEFAULT)
  setDefaultBankAccount(@Param('id') id: string) {
    return this.paymentsService.setDefaultBankAccount(id);
  }

  @Delete('bank-accounts/:id')
  @Permissions(PermissionCodes.BANK_ACCOUNTS_DELETE)
  deleteBankAccount(@Param('id') id: string) {
    return this.paymentsService.deleteBankAccount(id);
  }

  @Post(':id/review')
  @Permissions(PermissionCodes.PAYMENTS_REVIEW)
  review(
    @Param('id') id: string,
    @Body()
    body: {
      verifiedById: string;
      decision: 'APPROVE' | 'REJECT' | 'REQUEST_CONFIRMATION';
      reason?: string;
    },
  ) {
    return this.paymentsService.review(id, body);
  }

  @Post(':id/verify')
  @Permissions(PermissionCodes.PAYMENTS_VERIFY)
  verify(
    @Param('id') id: string,
    @Body() body: { verifiedById: string; reason?: string },
  ) {
    return this.paymentsService.review(id, {
      verifiedById: body.verifiedById,
      decision: 'APPROVE',
      reason: body.reason,
    });
  }

  @Post(':id/receipt/send')
  @Permissions(PermissionCodes.RECEIPTS_SEND)
  sendReceipt(
    @Param('id') id: string,
    @Body()
    body: {
      audiences: string[];
      channels?: NotificationChannel[];
      message?: string;
    },
  ) {
    return this.paymentsService.sendReceipt(id, body);
  }
}
