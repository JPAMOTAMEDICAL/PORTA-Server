import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';

@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Permissions(PermissionCodes.NOTIFICATIONS_VIEW)
  list(@Req() req: { user: { id: string } }) {
    return this.notificationsService.listForUser(req.user.id);
  }

  @Post()
  @Permissions(PermissionCodes.NOTIFICATIONS_CREATE)
  create(
    @Body()
    body: {
      recipientId?: string;
      facilityId?: string;
      title: string;
      message: string;
      type: string;
      channel?: NotificationChannel;
      metadata?: unknown;
    },
  ) {
    return this.notificationsService.createNotification(body);
  }

  @Post(':id/read')
  @Permissions(PermissionCodes.NOTIFICATIONS_MARK_READ)
  markAsRead(@Param('id') id: string, @Req() req: { user: { id: string } }) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }
}
