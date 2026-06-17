const logger = require('../lib/logger');

let _clerkVerify = null;

async function getVerifier() {
  if (_clerkVerify) return _clerkVerify;
  if (!process.env.CLERK_SECRET_KEY) return null;
  const { verifyToken } = require('@clerk/backend');
  _clerkVerify = (token) =>
    verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
  return _clerkVerify;
}

/**
 * Reads the Clerk user ID for this request.
 * Priority: verified Bearer JWT > X-Clerk-User-Id header (dev fallback).
 * In production with CLERK_SECRET_KEY set, the header fallback is rejected.
 */
async function clerkAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (token) {
    const verify = await getVerifier();
    if (verify) {
      try {
        const payload = await verify(token);
        req.clerkUserId = payload.sub;
        return next();
      } catch {
        return res.status(401).json({ success: false, message: 'Token inválido ou expirado.' });
      }
    }
    // CLERK_SECRET_KEY not configured — trust token sub without verification (dev only)
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        if (claims.sub) {
          req.clerkUserId = claims.sub;
          return next();
        }
      }
    } catch { /* invalid token structure */ }
  }

  // Fallback: X-Clerk-User-Id header
  const headerId = String(req.headers['x-clerk-user-id'] || '').trim();
  if (headerId) {
    if (process.env.NODE_ENV === 'production' && process.env.CLERK_SECRET_KEY) {
      return res.status(401).json({ success: false, message: 'Autenticação com Bearer token obrigatória.' });
    }
    logger.warn({ path: req.path }, 'clerkAuth: falling back to X-Clerk-User-Id header (sem JWT)');
    req.clerkUserId = headerId;
    return next();
  }

  return res.status(401).json({ success: false, message: 'Autenticação obrigatória.' });
}

module.exports = { clerkAuth };
