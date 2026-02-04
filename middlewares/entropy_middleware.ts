import { randomInt } from "node:crypto";
import type { Context, Next } from "@oak/oak";
import { APIException, ApiErrorCode } from "../types/api.ts";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function entropyMiddleware(_ctx: Context, next: Next) {
  const d10 = randomInt(0, 10);

  if (d10 === 9) {
    throw new APIException(ApiErrorCode.SERVER_ERROR, 500, "Entropy error :-)");
  }

  if (d10 >= 3 && d10 < 9) {
    const timeout = randomInt(0, 4);
    await delay(timeout * 1000);
  }

  await next();
}
