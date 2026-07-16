import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard-summary')
  @Permissions(PermissionCodes.REPORTS_DASHBOARD_SUMMARY)
  getDashboardSummary() {
    return this.reportsService.getDashboardSummary();
  }

  @Get('operational')
  @Permissions(PermissionCodes.REPORTS_OPERATIONAL)
  getOperationalReport(
    @Query('range') range?: 'daily' | 'weekly' | 'monthly' | 'yearly',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reportsService.getOperationalReport(
      range ?? 'daily',
      startDate,
      endDate,
    );
  }

  @Get('finance-summary')
  @Permissions(PermissionCodes.REPORTS_FINANCE_SUMMARY)
  getFinanceSummary() {
    return this.reportsService.getFinanceSummary();
  }
}
