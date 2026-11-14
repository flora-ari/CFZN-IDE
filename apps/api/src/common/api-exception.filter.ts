import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ApiError, invalid, tooLarge, unsupportedMedia } from './api-error';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) return;
    const error = this.toApiError(exception);
    response.status(error.getStatus()).json(error.getResponse());
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof ApiError) return exception;
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : exception instanceof Error && 'status' in exception ? exception.status : undefined;
    if (status === 400) return invalid('Malformed request body or multipart fields.');
    if (status === 404) return new ApiError(404, 'NOT_FOUND', 'API endpoint not found.');
    if (status === 413) return tooLarge('The request body exceeds the allowed size.');
    if (status === 415) return unsupportedMedia('Unsupported request media type or encoding.');

    this.logger.error('Unexpected API error', exception instanceof Error ? exception.stack : undefined);
    return new ApiError(500, 'INTERNAL_ERROR', 'An unexpected API error occurred.');
  }
}
