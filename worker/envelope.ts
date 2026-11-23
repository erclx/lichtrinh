import type { ApiError, ApiErrorCode } from '@shared/errors.ts'

export function fail(code: ApiErrorCode, message: string): ApiError {
  return { error: { code, message } }
}
