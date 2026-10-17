import { generationErrorStatus, toGenerationError } from '@krayon/shared';

export const httpError = (statusCode: number, detail: string) => {
  const error = new Error(detail) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
};

/** One mapping from a generation failure to an HTTP body. Callers pick the status. */
export const generationErrorResponse = (error: unknown, requestId: string | undefined) => {
  const info = toGenerationError(error).toInfo();
  return { status: generationErrorStatus(info.code), body: { detail: info.message, ...info, requestId } };
};
