/**
 * Terminal JSON error handler for /api/* (server-only).
 *
 * WHY THIS EXISTS — found by writing the "an API route never returns HTML"
 * test as an attack rather than an assertion:
 *
 *   POST /api/<anything> with body `{not json`
 *     → express.json() throws a SyntaxError
 *     → Express's DEFAULT error handler runs
 *     → the client gets `text/html; charset=utf-8` and an HTML error page,
 *       in development including a stack trace.
 *
 * Every carefully written JSON error contract in this codebase was bypassed by
 * a single malformed byte. A JSON client then fails on "Unexpected token '<'",
 * which is precisely the misleading failure mode that made the original
 * production incident hard to diagnose.
 *
 * Registered LAST in createApp(), so it is reachable from every earlier layer
 * in the middleware stack — including express.json() itself.
 */
import type { NextFunction, Request, Response } from 'express';

interface BodyParserError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
  expose?: boolean;
}

export function apiJsonErrorHandler(
  error: BodyParserError,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Not an API path: leave the default behaviour alone (HTML pages are correct
  // for the SPA shell, and the static handler owns them).
  if (!req.path.startsWith('/api')) return next(error);
  if (res.headersSent) return next(error);

  const status = Number(error?.status ?? error?.statusCode ?? 500);

  // Body-parser failures are the caller's fault and are safe to name precisely.
  if (error?.type === 'entity.parse.failed' || error instanceof SyntaxError) {
    res.status(400).type('application/json').json({
      ok: false,
      error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON.' },
    });
    return;
  }
  if (error?.type === 'entity.too.large') {
    res.status(413).type('application/json').json({
      ok: false,
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the size limit for this endpoint.' },
    });
    return;
  }

  // Anything else: the name only. Never the message, never the stack — an
  // unexpected error can carry an internal path, a DSN or an upstream payload.
  console.error(`[api] event=error.unhandled path=${req.path} name=${error?.name || 'Error'}`);
  res.status(status >= 400 && status < 600 ? status : 500).type('application/json').json({
    ok: false,
    error: { code: 'UNHANDLED_ERROR', message: 'The request could not be completed.' },
  });
}
