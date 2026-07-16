import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AccessControlService } from '../access-control/access-control.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControlService: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: { id?: string; permissions?: string[] };
    }>();

    const userId = request.user?.id;
    if (!userId) {
      return false;
    }

    const granted =
      request.user?.permissions ??
      (await this.accessControlService.getUserPermissionCodes(userId));

    return required.every((permission) => granted.includes(permission));
  }
}
