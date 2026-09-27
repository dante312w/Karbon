import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type NumberingRangeDto,
  Permission,
  type PrinterDto,
  type RestaurantSettingsDto,
  type TaxDto,
} from '@karbon/types';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public, RequirePermissions } from '../../common/auth/decorators.js';
import { ConfigCatalogService } from './catalog-config.service.js';
import {
  CreateNumberingRangeDto,
  CreatePrinterDto,
  CreateTaxDto,
  SetNumberingRangeActiveDto,
  UpdatePrinterDto,
  UpdateSettingsDto,
  UpdateTaxDto,
  UploadImageDto,
} from './settings.dto.js';
import { SettingsService } from './settings.service.js';

@ApiTags('Configuración')
@ApiBearerAuth()
@Controller()
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly config: ConfigCatalogService,
  ) {}

  /** Todas las terminales necesitan moneda, modo y umbrales: basta con estar autenticado. */
  @Get('settings')
  @ApiOperation({ summary: 'Configuración del negocio' })
  get(): Promise<RestaurantSettingsDto> {
    return this.settings.getDto();
  }

  @Patch('settings')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Actualiza la configuración (incluido el modo restaurante / bar)' })
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RestaurantSettingsDto> {
    return this.settings.update(dto, user);
  }

  @Put('settings/logo')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @ApiOperation({ summary: 'Sube el logo (data URL PNG/JPG/WEBP, máx. 512 KB)' })
  uploadLogo(
    @Body() dto: UploadImageDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RestaurantSettingsDto> {
    return this.settings.updateLogo(dto.dataUrl, user);
  }

  @Public()
  @Get('settings/logo')
  @ApiOperation({ summary: 'Logo del negocio' })
  async logo(@Res() response: Response): Promise<void> {
    const file = await this.settings.logoFile();
    if (!file) throw new NotFoundException('Sin logo');
    response.setHeader('Cache-Control', 'public, max-age=86400');
    response.sendFile(file);
  }

  @Get('taxes')
  @ApiOperation({ summary: 'Impuestos' })
  listTaxes(): Promise<TaxDto[]> {
    return this.config.listTaxes();
  }

  @Post('taxes')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  createTax(@Body() dto: CreateTaxDto, @CurrentUser() user: AuthenticatedUser): Promise<TaxDto> {
    return this.config.createTax(dto, user);
  }

  @Patch('taxes/:id')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  updateTax(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaxDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TaxDto> {
    return this.config.updateTax(id, dto, user);
  }

  /** Cualquier terminal elige dónde imprimir (caja, comandas): basta con estar autenticado. */
  @Get('printers')
  listPrinters(): Promise<PrinterDto[]> {
    return this.config.listPrinters();
  }

  @Post('printers')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  createPrinter(@Body() dto: CreatePrinterDto): Promise<PrinterDto> {
    return this.config.createPrinter(dto);
  }

  @Patch('printers/:id')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  updatePrinter(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePrinterDto,
  ): Promise<PrinterDto> {
    return this.config.updatePrinter(id, dto);
  }

  @Delete('printers/:id')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePrinter(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.config.deletePrinter(id);
  }

  @Get('numbering-ranges')
  @RequirePermissions(Permission.SETTINGS_READ)
  listNumberingRanges(): Promise<NumberingRangeDto[]> {
    return this.config.listNumberingRanges();
  }

  @Post('numbering-ranges')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  createNumberingRange(
    @Body() dto: CreateNumberingRangeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<NumberingRangeDto> {
    return this.config.createNumberingRange(dto, user);
  }

  @Patch('numbering-ranges/:id')
  @RequirePermissions(Permission.SETTINGS_WRITE)
  setNumberingRangeActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetNumberingRangeActiveDto,
  ): Promise<NumberingRangeDto> {
    return this.config.setNumberingRangeActive(id, dto.isActive);
  }
}
