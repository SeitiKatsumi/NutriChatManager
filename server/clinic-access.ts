import { SINGLE_NUTRITIONIST_ID } from '@shared/clinic-mode';

export function requireClinicAuth(req: any, res: any, next: any) {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.session.user.id !== SINGLE_NUTRITIONIST_ID && !req.session.user.isAdmin) {
    return res.status(403).json({ error: 'Acesso disponível apenas para Daniel Lessa.' });
  }
  next();
}

export function disableBilling(req: any, res: any, next: any) {
  const path = req.originalUrl.split('?')[0];
  if (path === '/api/subscription/status') return next();
  if (path === '/api/stripe/webhook' && req.method === 'POST') {
    return res.json({ received: true, billingDisabled: true });
  }
  return res.status(410).json({ error: 'As assinaturas estão temporariamente desativadas.' });
}
