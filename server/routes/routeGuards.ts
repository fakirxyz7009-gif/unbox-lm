/**
 * Guards for the local-only routes: loopback clients only, and a fixed-window limit per client.
 * The older routes (vstRoutes, aiRoutes) keep their own copies; new routes use these.
 */
import type { NextFunction, Request, Response } from 'express';

export function isLoopback(req: Request): boolean {
  const address = req.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function requireLoopback(message: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (isLoopback(req)) return next();
    res.status(403).json({ error: message });
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
