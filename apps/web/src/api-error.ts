export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }

  static async fromResponse(response: Response, service: string) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
    return new ApiError(body?.error?.code ?? 'HTTP_ERROR',
      body?.error?.message ?? `${service}请求失败（${response.status}）。`, response.status);
  }
}
