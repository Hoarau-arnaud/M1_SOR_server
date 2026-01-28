// server/types/api.ts

/** Codes d'erreur possibles renvoyés par l'API */
export enum ApiErrorCode {
  NOT_FOUND = "NOT_FOUND",
  BAD_REQUEST = "BAD_REQUEST",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  CONFLICT = "CONFLICT",
  INTERNAL_ERROR = "INTERNAL_ERROR",
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
}

/** Détails d'une erreur */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

/** Réponse succès : `data` est typé grâce à T */
export type ApiSuccess<T> = {
  success: true;
  data: T;
};

/** Réponse erreur : union discriminée sur `success: false` */
export type ApiFailure = {
  success: false;
  error: ApiError;
};

/** Union discriminée générique */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Helpers */
export const ok = <T>(data: T): ApiSuccess<T> => ({ success: true, data });

export const fail = (
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ApiFailure => ({
  success: false,
  error: { code, message, details },
});
