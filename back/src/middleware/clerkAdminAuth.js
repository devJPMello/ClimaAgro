/**
 * Admin via Clerk: `CLERK_ADMIN_USER_IDS` (vários, vírgula) ou `CLERK_ADMIN_USER_ID` (um só).
 * O cliente deve enviar o utilizador em `X-Clerk-User-Id`.
 */
function parseClerkAdminIds() {
  const fromList = String(process.env.CLERK_ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromList.length > 0) return fromList;
  const single = String(process.env.CLERK_ADMIN_USER_ID || '').trim();
  return single ? [single] : [];
}

function clerkAdminAuth(req, res, next) {
  const allow = parseClerkAdminIds();
  const clerkId = String(req.headers['x-clerk-user-id'] || '').trim();
  if (!clerkId || allow.length === 0 || !allow.includes(clerkId)) {
    return res.status(403).json({ message: 'Acesso reservado a administradores.' });
  }
  req.adminClerkUserId = clerkId;
  next();
}

module.exports = { clerkAdminAuth, parseClerkAdminIds };
