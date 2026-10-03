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
import {
  AssignNoteOptionsDto,
  CreateNoteOptionDto,
  ReorderNoteOptionsDto,
  SetNoteOptionsDto,
  UpdateNoteOptionDto,
} from './catalog.dto.js';
import { NoteOptionsService } from './note-options.service.js';

/** Notas de un toque y su asignación a categorías y productos. */
@ApiTags('Catálogo')
@ApiBearerAuth()
@Controller()
export class NoteOptionsController {
  constructor(private readonly notes: NoteOptionsService) {}

  @Get('note-options')
  @RequirePermissions(Permission.CATALOG_READ)
  @ApiOperation({ summary: 'Notas de un toque con sus categorías y productos' })
  list(@Query('includeInactive') includeInactive?: string): Promise<NoteOptionDto[]> {
    return this.notes.list(includeInactive === 'true');
  }

  @Post('note-options')
  @RequirePermissions(Permission.CATALOG_WRITE)
  create(@Body() dto: CreateNoteOptionDto): Promise<NoteOptionDto> {
    return this.notes.create(dto);
  }

  @Put('note-options/order')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @ApiOperation({ summary: 'Reordena las notas de una categoría o las generales' })
  reorder(@Body() dto: ReorderNoteOptionsDto): Promise<NoteOptionDto[]> {
    return this.notes.reorder(dto);
  }

  @Put('note-options/assignments')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @ApiOperation({ summary: 'Asigna varias notas a la vez (p. ej. la asignación sugerida)' })
  assign(
    @Body() dto: AssignNoteOptionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NoteOptionDto[]> {
    return this.notes.assign(dto, user);
  }

  @Patch('note-options/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoteOptionDto,
  ): Promise<NoteOptionDto> {
    return this.notes.update(id, dto);
  }

  @Delete('note-options/:id')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.notes.remove(id, user);
  }

  @Put('categories/:id/note-options')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @ApiOperation({ summary: 'Notas que aplican a la categoría, en orden (asignación masiva)' })
  setForCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetNoteOptionsDto,
  ): Promise<NoteOptionDto[]> {
    return this.notes.setForCategory(id, dto);
  }

  @Put('products/:id/note-options')
  @RequirePermissions(Permission.CATALOG_WRITE)
  @ApiOperation({
    summary:
      'Notas propias del producto: reemplazan las de su categoría (vacía = las de la categoría)',
  })
  setForProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetNoteOptionsDto,
  ): Promise<NoteOptionDto[]> {
    return this.notes.setForProduct(id, dto);
  }
}
