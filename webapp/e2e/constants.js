export const PORT = 4173;
export const TENANT_A_HOST = 'tenant-a.e2e.test';
export const TENANT_B_HOST = 'tenant-b.e2e.test';

export function urlFor(host, path = '/') {
  return `http://${host}:${PORT}${path}`;
}
