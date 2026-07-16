import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PermissionCodes } from '../access-control/permission-codes';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @Permissions(PermissionCodes.DOCUMENTS_VIEW)
  list(@Query('facilityId') facilityId?: string) {
    return this.documentsService.list(facilityId);
  }

  @Post('uploads')
  @Permissions(PermissionCodes.DOCUMENTS_UPLOAD)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: unknown,
    @Query('facilityId') facilityId: string | undefined,
    @Query('category') category: string,
  ) {
    return this.documentsService.upload(file as never, {
      facilityId,
      category,
    });
  }

  @Delete('uploads/:storedName')
  @Permissions(PermissionCodes.DOCUMENTS_UPLOAD_DELETE)
  deleteUpload(@Param('storedName') storedName: string) {
    return this.documentsService.deleteUpload(storedName);
  }

  @Get('files/:storedName')
  @Permissions(PermissionCodes.DOCUMENTS_FILE_VIEW)
  async openStoredFile(
    @Param('storedName') storedName: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.streamDocument(
      response,
      await this.documentsService.getStoredFile(storedName),
      'inline',
    );
  }

  @Get('files/:storedName/download')
  @Permissions(PermissionCodes.DOCUMENTS_FILE_DOWNLOAD)
  async downloadStoredFile(
    @Param('storedName') storedName: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.streamDocument(
      response,
      await this.documentsService.getStoredFile(storedName),
      'attachment',
    );
  }

  @Get('invoices/:id')
  @Permissions(PermissionCodes.INVOICE_DOC_VIEW)
  async openInvoice(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.streamDocument(
      response,
      await this.documentsService.getInvoiceDocument(id),
      'inline',
    );
  }

  @Get('invoices/:id/download')
  @Permissions(PermissionCodes.INVOICE_DOC_DOWNLOAD)
  async downloadInvoice(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.streamDocument(
      response,
      await this.documentsService.getInvoiceDocument(id),
      'attachment',
    );
  }

  @Get('receipts/:id')
  @Permissions(PermissionCodes.RECEIPT_DOC_VIEW)
  async openReceipt(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.streamDocument(
      response,
      await this.documentsService.getReceiptDocument(id),
      'inline',
    );
  }

  @Get('receipts/:id/download')
  @Permissions(PermissionCodes.RECEIPT_DOC_DOWNLOAD)
  async downloadReceipt(
    @Param('id') id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.streamDocument(
      response,
      await this.documentsService.getReceiptDocument(id),
      'attachment',
    );
  }

  private streamDocument(
    response: Response,
    payload: {
      stream: StreamableFile['stream'];
      fileName: string;
      mimeType: string;
      size?: number;
    },
    disposition: 'inline' | 'attachment',
  ) {
    response.setHeader('Content-Type', payload.mimeType);
    response.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${payload.fileName.replace(/"/g, '')}"`,
    );
    if (payload.size !== undefined) {
      response.setHeader('Content-Length', String(payload.size));
    }

    return new StreamableFile(
      payload.stream as ConstructorParameters<typeof StreamableFile>[0],
    );
  }
}
