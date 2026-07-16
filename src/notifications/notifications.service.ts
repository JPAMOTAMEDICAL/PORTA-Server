import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

type NotificationPayload = {
  recipientId?: string;
  facilityId?: string;
  title: string;
  message: string;
  type: string;
  channel?: NotificationChannel;
  metadata?: unknown;
  status?: NotificationStatus;
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async createNotification(data: NotificationPayload) {
    const channel = data.channel ?? NotificationChannel.IN_APP;
    const notification = await this.prisma.notification.create({
      data: {
        recipientId: data.recipientId,
        facilityId: data.facilityId,
        title: data.title,
        message: data.message,
        type: data.type,
        channel,
        metadata: data.metadata as never,
        status:
          channel === NotificationChannel.EMAIL
            ? NotificationStatus.PENDING
            : (data.status ?? NotificationStatus.SENT),
      },
    });

    if (channel !== NotificationChannel.EMAIL) {
      return notification;
    }

    return this.deliverEmailNotification(notification.id);
  }

  async createMirroredNotifications(
    payload: Omit<NotificationPayload, 'status' | 'channel'> & {
      channels?: NotificationChannel[];
    },
  ) {
    const channels = payload.channels?.length
      ? payload.channels
      : [NotificationChannel.IN_APP];

    const notifications: Array<unknown> = [];
    for (const channel of channels) {
      notifications.push(
        await this.createNotification({
          ...payload,
          channel,
          status: NotificationStatus.SENT,
        }),
      );
    }

    return notifications;
  }

  async createForRoles(
    roles: Role[],
    payload: {
      title: string;
      message: string;
      type: string;
      facilityId?: string;
      metadata?: unknown;
      channel?: NotificationChannel;
    },
  ) {
    const recipients = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { role: { in: roles } },
          {
            accessRoles: {
              some: {
                role: {
                  name: { in: roles },
                },
              },
            },
          },
        ],
      },
      select: { id: true },
    });

    if (recipients.length === 0) {
      return [];
    }

    for (const recipient of recipients) {
      await this.createNotification({
        recipientId: recipient.id,
        facilityId: payload.facilityId,
        title: payload.title,
        message: payload.message,
        type: payload.type,
        channel: payload.channel ?? NotificationChannel.IN_APP,
        status: NotificationStatus.SENT,
        metadata: payload.metadata ?? undefined,
      });
    }

    return this.listForRoles(roles);
  }

  async createForFacilityUsers(
    facilityId: string,
    payload: {
      title: string;
      message: string;
      type: string;
      metadata?: unknown;
      channels?: NotificationChannel[];
    },
  ) {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        facilityId,
      },
      select: { id: true },
    });

    const channels = payload.channels?.length
      ? payload.channels
      : [NotificationChannel.IN_APP];

    const records =
      users.length > 0
        ? users.flatMap((user) =>
            channels.map((channel) => ({
              recipientId: user.id,
              facilityId,
              title: payload.title,
              message: payload.message,
              type: payload.type,
              channel,
              status: NotificationStatus.SENT,
              metadata: payload.metadata ?? undefined,
            })),
          )
        : channels.map((channel) => ({
            facilityId,
            title: payload.title,
            message: payload.message,
            type: payload.type,
            channel,
            status: NotificationStatus.SENT,
            metadata: payload.metadata ?? undefined,
          }));

    for (const record of records) {
      await this.createNotification(record);
    }

    return this.prisma.notification.findMany({
      where: {
        facilityId,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async listForRoles(roles: Role[]) {
    return this.prisma.notification.findMany({
      where: {
        recipient: {
          OR: [
            { role: { in: roles } },
            {
              accessRoles: {
                some: {
                  role: {
                    name: { in: roles },
                  },
                },
              },
            },
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async listForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { facilityId: true },
    });

    return this.prisma.notification.findMany({
      where: {
        OR: [
          { recipientId: userId },
          ...(user?.facilityId ? [{ facilityId: user.facilityId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: string, userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { facilityId: true },
    });

    const notification = await this.prisma.notification.findFirst({
      where: {
        id,
        OR: [
          { recipientId: userId },
          ...(user?.facilityId ? [{ facilityId: user.facilityId }] : []),
        ],
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    return this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.READ,
        readAt: new Date(),
      },
    });
  }

  private async deliverEmailNotification(id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      include: {
        recipient: {
          select: {
            email: true,
            fullName: true,
          },
        },
        facility: {
          select: {
            email: true,
            name: true,
          },
        },
      },
    });

    if (!notification) {
      return null;
    }

    const recipientEmail =
      notification.recipient?.email ?? notification.facility?.email ?? null;

    if (!recipientEmail) {
      return this.prisma.notification.update({
        where: { id },
        data: {
          status: NotificationStatus.FAILED,
          metadata: this.withDeliveryMetadata(notification.metadata, {
            emailError: 'No recipient email is configured for this notification.',
          }) as never,
        },
      });
    }

    try {
      await this.mailService.sendMail({
        to: recipientEmail,
        subject: notification.title,
        text: notification.message,
        html: this.buildNotificationHtml(
          notification.title,
          notification.message,
          notification.recipient?.fullName ?? notification.facility?.name ?? 'User',
        ),
      });

      return this.prisma.notification.update({
        where: { id },
        data: {
          status: NotificationStatus.SENT,
          metadata: this.withDeliveryMetadata(notification.metadata, {
            deliveredTo: recipientEmail,
            deliveredAt: new Date().toISOString(),
          }) as never,
        },
      });
    } catch (error) {
      return this.prisma.notification.update({
        where: { id },
        data: {
          status: NotificationStatus.FAILED,
          metadata: this.withDeliveryMetadata(notification.metadata, {
            deliveredTo: recipientEmail,
            emailError:
              error instanceof Error ? error.message : 'Email delivery failed.',
          }) as never,
        },
      });
    }
  }

  private withDeliveryMetadata(metadata: unknown, extra: Record<string, unknown>) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return {
        ...metadata,
        ...extra,
      };
    }

    return extra;
  }

  private buildNotificationHtml(title: string, message: string, recipientName: string) {
    return `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
    <p>Hello ${this.escapeHtml(recipientName)},</p>
    <h2>${this.escapeHtml(title)}</h2>
    <p>${this.escapeHtml(message)}</p>
  </body>
</html>`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
