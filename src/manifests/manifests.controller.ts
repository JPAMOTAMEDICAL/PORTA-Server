import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';
import { ManifestsService } from './manifests.service';

@Controller('manifests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ManifestsController {
  constructor(private readonly manifestsService: ManifestsService) {}

  @Get()
  @Permissions(PermissionCodes.MANIFESTS_VIEW)
  list() {
    return this.manifestsService.list();
  }

  @Get(':manifestNo')
  @Permissions(PermissionCodes.MANIFESTS_VIEW)
  findOne(@Param('manifestNo') manifestNo: string) {
    return this.manifestsService.findOne(manifestNo);
  }

  @Post(':manifestNo/verify')
  @Permissions(PermissionCodes.MANIFESTS_VERIFY)
  verify(
    @Param('manifestNo') manifestNo: string,
    @Body() body: { verifiedById?: string; reason?: string },
  ) {
    return this.manifestsService.verify(manifestNo, body);
  }
}
