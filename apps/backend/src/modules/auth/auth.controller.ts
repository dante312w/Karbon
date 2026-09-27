import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser, LoginResponse, PinUserOption } from '@karbon/types';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { LoginDto, PinLoginDto, RefreshTokenDto } from './auth.dto.js';
import { AuthService } from './auth.service.js';
import { CREDENTIALS_THROTTLE, sessionMetadata } from './session-metadata.js';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingreso con usuario y clave' })
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<LoginResponse> {
    return this.auth.login(dto.username, dto.password, sessionMetadata(request, dto.deviceName));
  }

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('pin-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingreso rápido con PIN en terminales compartidas' })
  pinLogin(@Body() dto: PinLoginDto, @Req() request: Request): Promise<LoginResponse> {
    return this.auth.pinLogin(dto.userId, dto.pin, sessionMetadata(request, dto.deviceName));
  }

  @Public()
  @Get('pin-users')
  @ApiOperation({ summary: 'Usuarios con PIN para la pantalla de ingreso rápido' })
  pinUsers(): Promise<PinUserOption[]> {
    return this.auth.pinUsers();
  }

  @Public()
  @Throttle(CREDENTIALS_THROTTLE)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renueva la sesión (rota el refresh token)' })
  refresh(@Body() dto: RefreshTokenDto, @Req() request: Request): Promise<LoginResponse> {
    return this.auth.refresh(dto.refreshToken, sessionMetadata(request));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cierra la sesión del dispositivo' })
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Usuario autenticado y sus permisos' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    return this.auth.me(user);
  }
}
