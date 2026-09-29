import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type NoteOptionDto, Permission } from '@karbon/types';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators.js';
import { CreateNoteOptionDto, ReorderNoteOptionsDto, UpdateNoteOptionDto } from './catalog.dto.js';
import { NoteOptionsService } from './note-options.service.js';

@ApiTags('Catálogo')
@ApiBearerAuth()
@Controller('note-options')
export class NoteOptionsController {
  constructor(private readonly notes: NoteOptionsService) {}

  @Get()
  @RequirePermissions(Permission.CATALOG_READ)
  @ApiOperation({ summary: 'Notas de un toque (generales y por categoría)' })
  list(@Query('includeInactive') includeInactive?: string): Promise<NoteOptionDto[]> {
    return this.notes.list(includeInactive === 'true');
  }

  @Post()
  @RequirePermissions(Permission.CATALOG_WRITE)
  create(@Body() dto: CreateNoteOptionDto): Promise<NoteOptionDto> {
    return this.notes.create(dto);
  }

  @Put('order')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @ApiOperation({ summary: 'Reordena las notas de una categoría o las generales' })
  reorder(@Body() dto: ReorderNoteOptionsDto): Promise<NoteOptionDto[]> {
    return this.notes.reorder(dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteOptionDto,
  ): Promise<NoteOptionDto> {
    return this.notes.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.notes.remove(id, user);
  }
}
