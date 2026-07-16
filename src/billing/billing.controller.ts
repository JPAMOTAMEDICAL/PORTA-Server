import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { PermissionCodes } from '../access-control/permission-codes';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('generate-monthly-invoices')
  @Permissions(PermissionCodes.INVOICES_CREATE)
  generateMonthlyInvoices(@Body() body: { month: number; year: number }) {
    return this.billingService.generateMonthlyInvoices(body.month, body.year);
  }
}
