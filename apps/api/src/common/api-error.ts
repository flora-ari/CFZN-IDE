import { HttpException } from '@nestjs/common';

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends HttpException {
  constructor(status: number, code: string, message: string, details?: unknown) {
    const body: ApiErrorBody = { error: { code, message } };
    if (details !== undefined) body.error.details = details;
    super(body, status);
  }
}

export const invalid = (message: string, field?: string) =>
  new ApiError(400, 'VALIDATION_ERROR', message, field ? { field } : undefined);
export const notFound = () =>
  new ApiError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
export const conflict = (currentRevision: number) =>
  new ApiError(412, 'REVISION_CONFLICT', 'The project has changed. Reload it or save as a new project.', {
    currentRevision,
  });
export const tooLarge = (message: string) => new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
export const unsupportedMedia = (message: string) => new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message);
export const invalidProject = (message: string) => new ApiError(422, 'INVALID_PROJECT', message);
export const preconditionRequired = () =>
  new ApiError(428, 'PRECONDITION_REQUIRED', 'A quoted revision in If-Match is required.');
export const storageError = () => new ApiError(500, 'STORAGE_ERROR', 'The project storage operation failed.');
