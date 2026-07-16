import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  @Permissions(PermissionCodes.INVOICES_VIEW)
  list(@Query('facilityId') facilityId?: string) {
    return this.invoicesService.list(facilityId);
  }

  @Get(':id')
  @Permissions(PermissionCodes.INVOICES_VIEW)
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post('preview')
  @Permissions(PermissionCodes.INVOICES_CREATE)
  preview(
    @Body()
    body: {
      facilityId: string;
      dueDate?: string;
      periodStart: string;
      periodEnd: string;
    },
  ) {
    return this.invoicesService.previewGeneration(body);
  }

  @Post()
  @Permissions(PermissionCodes.INVOICES_CREATE)
  create(
    @Body()
    body: {
      facilityId: string;
      dueDate: string;
      periodStart: string;
      periodEnd: string;
      generatedById?: string;
      status?: InvoiceStatus;
    },
  ) {
    return this.invoicesService.create(body);
  }

  @Patch(':id')
  @Permissions(PermissionCodes.INVOICES_UPDATE)
  update(
    @Param('id') id: string,
    @Body()
    body: {
      amountDue?: number;
      totalWeight?: number;
      tax?: number;
      dueDate?: string;
      periodStart?: string;
      periodEnd?: string;
      status?: InvoiceStatus;
    },
  ) {
    return this.invoicesService.update(id, body);
  }

  @Patch(':id/status')
  @Permissions(PermissionCodes.INVOICES_UPDATE_STATUS)
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: InvoiceStatus },
  ) {
    return this.invoicesService.updateStatus(id, body.status);
  }

  @Post(':id/send')
  @Permissions(PermissionCodes.INVOICES_SEND)
  send(
    @Param('id') id: string,
    @Body()
    body: {
      subject: string;
      message: string;
      recipientEmail?: string;
      generate?: boolean;
      saveDraft?: boolean;
    },
  ) {
    return this.invoicesService.send(id, body);
  }
}
