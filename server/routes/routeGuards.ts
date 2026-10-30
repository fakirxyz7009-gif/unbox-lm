/**
 * Guards for the local-only routes: loopback clients on a local host name only, and a fixed-window
 * limit per client. The older routes (vstRoutes, aiRoutes) keep their own copies; new routes use these.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopback(req: Request): boolean {
  const address = req.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

/** A page on another site can reach this server through DNS rebinding, but its Host header is not a local name. */
export function isLocalHost(req: Request): boolean {
  return LOCAL_HOSTS.has((req.headers.host ?? '').replace(/:\d+$/, ''));
}

export function isLocalRequest(req: Request): boolean {
  return isLoopback(req) && isLocalHost(req);
}

export function requireLoopback(message: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isLocalRequest(req)) return next();
    res.status(403).json({ error: message });
  };
}

/** Express 4 does not pass a rejected promise on, so a failed route answers 500 instead of ending the app. */
export function guardAsync(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch((error: unknown) => {
      if (res.headersSent) return next(error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'The request failed.' });
    });
  };
}

export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.socket.remoteAddress ?? 'unknown';
    const entry = hits.get(key);
    if (!entry || now > entry.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= max) {
      res.status(429).json({ error: 'Too many requests. Wait a minute and try again.' });
      return;
    }
    entry.count++;
    next();
  };
}
