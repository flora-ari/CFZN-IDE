import { Body, Controller, Get, HttpCode, Inject, Options, Post, Req, Res } from '@nestjs/common';
import type { Request, RequestHandler, Response } from 'express';
import { ApiError, invalid } from '../common/api-error';
import { bearer, type IdeAuth } from './auth';
import type { IdeConfig } from './config';
import { unauthorized } from './maker';

export const IDE_AUTH = Symbol('IDE_AUTH');
export const IDE_CONFIG = Symbol('IDE_CONFIG');

export class RateLimit {
  private readonly counters = new Map<string, number>();
  private window = 0;

  check(key: string, limit: number): void {
    const window = Math.floor(Date.now() / 60_000);
    if (this.window !== window) {
      this.window = window;
      this.counters.clear();
    }
    const count = (this.counters.get(key) ?? 0) + 1;
    if (count > limit) throw new ApiError(429, 'RATE_LIMITED', 'Try again in a minute.');
    this.counters.set(key, count);
  }
}

export function sameOrigin(request: Request, origin: string): void {
  const actual = request.get('origin');
  const site = request.get('sec-fetch-site');
  if ((actual && actual !== origin) || (site && site !== 'same-origin' && site !== 'none')) {
    throw new ApiError(403, 'FORBIDDEN', 'Use the IDE origin for this request.');
  }
}

export function authHeaders(config: IdeConfig): RequestHandler {
  return (request, response, next) => {
    response.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    if (/^\/sso-ticket\/?$/i.test(request.path)) {
      response.vary('Origin');
      if (request.get('origin') === config.portalOrigin) {
        response.set({
          'Access-Control-Allow-Origin': config.portalOrigin,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        });
      }
    }
    next();
  };
}

function fields(value: unknown, allowEmpty = false): Record<string, unknown> {
  if (allowEmpty && value === undefined) return {};
  if (typeof value !== 'object' || !value || Array.isArray(value)) throw invalid('Provide a JSON object.');
  return value as Record<string, unknown>;
}

function text(value: unknown, key: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid('Invalid ' + key + '.', key);
  return value;
}

function optionalRefresh(value: unknown): string | undefined {
  const refresh = fields(value, true).refresh;
  return refresh === undefined ? undefined : text(refresh, 'refresh', 8192);
}

@Controller('ide/auth')
export class IdeAuthController {
  private readonly limits = new RateLimit();

  constructor(
    @Inject(IDE_AUTH) private readonly auth: IdeAuth,
    @Inject(IDE_CONFIG) private readonly config: IdeConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    sameOrigin(request, this.config.publicOrigin);
    this.limits.check('login:' + request.ip, 10);
    const input = fields(body);
    return this.auth.login(text(input.username, 'username', 254), text(input.password, 'password', 1024), response);
  }

  @Get('me')
  async me(@Req() request: Request) {
    return (await this.auth.principal(request)).user;
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    sameOrigin(request, this.config.publicOrigin);
    return this.auth.refresh(request, optionalRefresh(body), response);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    sameOrigin(request, this.config.publicOrigin);
    // An invalid explicit token must not prevent removal of the browser cookies.
    let refresh: string | undefined;
    try { refresh = optionalRefresh(body); } catch { /* use the browser cookie */ }
    await this.auth.logout(request, refresh, response);
    return { ok: true };
  }

  @Options('sso-ticket')
  @HttpCode(204)
  preflight(@Req() request: Request): void {
    if (request.get('origin') !== this.config.portalOrigin) sameOrigin(request, this.config.publicOrigin);
  }

  @Post('sso-ticket')
  @HttpCode(200)
  ticket(@Req() request: Request) {
    if (request.get('origin') !== this.config.portalOrigin) sameOrigin(request, this.config.publicOrigin);
    const token = bearer(request);
    if (!token) throw unauthorized();
    this.limits.check('sso:' + request.ip, 20);
    return this.auth.createTicket(token);
  }

  @Post('exchange')
  @HttpCode(200)
  exchange(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    sameOrigin(request, this.config.publicOrigin);
    const ticket = fields(body, true).ticket;
    if (typeof ticket !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(ticket)) {
      throw new ApiError(401, 'INVALID_SSO_TICKET', 'The SSO ticket is invalid or expired.');
    }
    return this.auth.exchange(ticket, response);
  }
}
