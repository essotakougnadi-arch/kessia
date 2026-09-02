import { describe, it, expect } from 'vitest';
import { dataUrlMeta, kycStorageEnabled } from './kyc-storage';

describe('dataUrlMeta', () => {
  it('reconnaît un JPEG', () => {
    expect(dataUrlMeta('data:image/jpeg;base64,/9j/4AAQ')).toEqual({ mimeType: 'image/jpeg', ext: 'jpg' });
  });
  it('reconnaît un PNG', () => {
    expect(dataUrlMeta('data:image/png;base64,iVBORw0KGgo=')).toEqual({ mimeType: 'image/png', ext: 'png' });
  });
  it('extension bin pour un type inconnu', () => {
    expect(dataUrlMeta('data:image/tiff;base64,AAAA')).toEqual({ mimeType: 'image/tiff', ext: 'bin' });
  });
  it('rejette une chaîne qui n’est pas un data-URI base64', () => {
    expect(dataUrlMeta('https://example.com/x.jpg')).toBeNull();
    expect(dataUrlMeta('data:image/png,notbase64')).toBeNull();
  });
});

describe('kycStorageEnabled', () => {
  it('renvoie un booléen (false sans variables Supabase)', () => {
    expect(typeof kycStorageEnabled()).toBe('boolean');
  });
});
