import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { NicknameQuery } from '../user/dto/user.dto';
import { UserService } from '../user/user.service';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/api/auth',
});

function refreshCookie(request: Request): string {
  return (
    (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('nlmlio_refresh='))
      ?.slice('nlmlio_refresh='.length) ?? ''
  );
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UserService,
  ) {}

  @Get('nickname')
  nickname(@Query() query: NicknameQuery) {
    return this.users.nicknameAvailability(query.nickname);
  }

  @Post('register')
  register(@Body() input: RegisterDto) {
    return this.auth.register(input);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() input: LoginDto, @Res({ passthrough: true }) response: Response) {
    const session = await this.auth.login(input);
    response.cookie('nlmlio_refresh', session.refreshToken, {
      ...cookieOptions(),
      maxAge: session.refreshTtl * 1000,
    });
    response.setHeader('Cache-Control', 'no-store');
    return { accessToken: session.accessToken, user: session.user };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    try {
      const session = await this.auth.refresh(refreshCookie(request));
      response.cookie('nlmlio_refresh', session.refreshToken, {
        ...cookieOptions(),
        maxAge: session.refreshTtl * 1000,
      });
      response.setHeader('Cache-Control', 'no-store');
      return { accessToken: session.accessToken, user: session.user };
    } catch (error) {
      response.clearCookie('nlmlio_refresh', cookieOptions());
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(refreshCookie(request));
    response.clearCookie('nlmlio_refresh', cookieOptions());
  }
}
