import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('optimize-route')
  @Permissions(PermissionCodes.AI_OPTIMIZE_ROUTE)
  optimizeRoute(@Body() body: { facilityIds: string[] }) {
    return this.aiService.optimizeRoute(body.facilityIds);
  }

  @Get('predict/:facilityId')
  @Permissions(PermissionCodes.AI_PREDICT_WASTE)
  predictWasteVolume(@Param('facilityId') facilityId: string) {
    return this.aiService.predictWasteVolume(facilityId);
  }

  @Get('missing-collections')
  @Permissions(PermissionCodes.AI_MISSING_COLLECTIONS)
  detectMissingCollections() {
    return this.aiService.detectMissingCollections();
  }

  @Get('invoice-monitoring')
  @Permissions(PermissionCodes.AI_INVOICE_MONITORING)
  monitorInvoices() {
    return this.aiService.monitorInvoices();
  }

  @Get('payment-monitoring')
  @Permissions(PermissionCodes.AI_PAYMENT_MONITORING)
  monitorPayments() {
    return this.aiService.monitorPayments();
  }

  @Get('risk-detection')
  @Permissions(PermissionCodes.AI_RISK_DETECTION)
  detectRiskFacilities() {
    return this.aiService.detectRiskFacilities();
  }

  @Get('daily-assistant')
  @Permissions(PermissionCodes.AI_ASSISTANT_DAILY)
  dailyAssistant() {
    return this.aiService.dailyAssistant();
  }

  @Get('weekly-assistant')
  @Permissions(PermissionCodes.AI_ASSISTANT_WEEKLY)
  weeklyAssistant() {
    return this.aiService.weeklyAssistant();
  }

  @Get('monthly-assistant')
  @Permissions(PermissionCodes.AI_ASSISTANT_MONTHLY)
  monthlyAssistant() {
    return this.aiService.monthlyAssistant();
  }
}
