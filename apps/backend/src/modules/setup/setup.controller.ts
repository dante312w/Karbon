import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { LoginResponse, SetupStatusDto } from '@karbon/types';
import type { Request } from 'express';
import { Public } from '../../common/auth/decorators.js';
import { CREDENTIALS_THROTTLE, sessionMetadata } from '../auth/session-metadata.js';
import { CompleteSetupDto } from './setup.dto.js';
import { SetupService } from './setup.service.js';

@ApiTags('Primer arranque')
@Public()
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('status')
  @ApiOperation({ summary: '¿La instalación necesita el asistente de primer arranque?' })
  status(): Promise<SetupStatusDto> {
    return this.setup.status();
  }

  @Throttle(CREDENTIALS_THROTTLE)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crea el administrador y la configuración inicial (solo una vez)' })
  complete(@Body() dto: CompleteSetupDto, @Req() request: Request): Promise<LoginResponse> {
    return this.setup.complete(dto, sessionMetadata(request, 'Escritorio'));
  }
}
