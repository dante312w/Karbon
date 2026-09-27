import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type AuditLogDto, type Paginated, Permission } from '@karbon/types';
import { RequirePermissions } from '../../common/auth/decorators.js';
import { AuditLogQueryDto } from './audit.dto.js';
import { AuditService } from './audit.service.js';

@ApiTags('Auditoría')
@ApiBearerAuth()
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({
    summary: 'Bitácora de acciones sensibles (anulaciones, cierres, cambios de permisos…)',
  })
  list(@Query() query: AuditLogQueryDto): Promise<Paginated<AuditLogDto>> {
    return this.audit.list(query);
  }
}
