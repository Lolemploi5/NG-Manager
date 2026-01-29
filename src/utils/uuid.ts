import { randomBytes } from 'crypto';

export function generateUUID(): string {
  return randomBytes(16).toString('hex');
}

export function generateShortId(): string {
  return randomBytes(4).toString('hex');
}
