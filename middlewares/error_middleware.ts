// server/middlewares/error_middleware.ts
import type { Context, Next } from "@oak/oak";
import { APIException, ApiErrorCode, type ApiFailure } from "../types/api.ts";

export async function errorMiddleware(ctx: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    if (err instanceof APIException) {
      const responseBody: ApiFailure = {
        success: false,
        error: { code: err.code, message: err.message },
      };

      ctx.response.status = err.status;
      ctx.response.body = responseBody;
      console.log(responseBody);
      return;
    }

    console.error(err);

    const responseBody: ApiFailure = {
      success: false,
      error: { code: ApiErrorCode.SERVER_ERROR, message: "Unexpected server error" },
    };

    ctx.response.status = 500;
    ctx.response.body = responseBody;
  }
}
