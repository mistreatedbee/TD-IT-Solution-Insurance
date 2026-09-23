import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { MfaQrCode, detectQrPayloadKind } from '../MfaQrCode';

describe('detectQrPayloadKind', () => {
  it('detects raw SVG markup (GoTrue totp.qr_code shape)', () => {
    expect(detectQrPayloadKind('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe('svg');
  });

  it('detects an XML-prefixed SVG document', () => {
    expect(detectQrPayloadKind('<?xml version="1.0"?><svg></svg>')).toBe('svg');
  });

  it('detects an already-formed data URI', () => {
    expect(detectQrPayloadKind('data:image/png;base64,AAAA')).toBe('data-uri');
  });

  it('falls back to treating a bare string as base64 PNG', () => {
    expect(detectQrPayloadKind('iVBORw0KGgoAAAANS')).toBe('base64-png');
  });

  it('treats empty/missing values as empty', () => {
    expect(detectQrPayloadKind(undefined)).toBe('empty');
    expect(detectQrPayloadKind(null)).toBe('empty');
    expect(detectQrPayloadKind('')).toBe('empty');
  });
});

describe('MfaQrCode', () => {
  it('renders an SVG QR code without crashing, given a realistic GoTrue payload', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200"/></svg>';
    await render(<MfaQrCode value={svg} />);
    expect(screen.toJSON()).not.toBeNull();
  });

  it('renders a base64 PNG fallback without crashing', async () => {
    await render(<MfaQrCode value="iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB" />);
    expect(screen.toJSON()).not.toBeNull();
  });

  it('renders a full data URI without crashing', async () => {
    await render(<MfaQrCode value="data:image/png;base64,AAAA" />);
    expect(screen.toJSON()).not.toBeNull();
  });

  it('renders nothing for an empty payload rather than crashing', async () => {
    await render(<MfaQrCode value="" />);
    expect(screen.toJSON()).toBeNull();
  });
});
