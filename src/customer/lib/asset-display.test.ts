import { describe, expect, it } from 'vitest';
import { assetFooter, assetIdentifier, assetStatusToTd, assetTypeToTd, formatAssetType } from './asset-display';

describe('assetStatusToTd', () => {
  it('maps the statuses the assets API emits today', () => {
    expect(assetStatusToTd('active')).toBe('PROTECTED');
    expect(assetStatusToTd('inactive')).toBeNull();
    expect(assetStatusToTd('removed')).toBeNull();
  });
  it('treats the legacy "registered" alias as PROTECTED and leaves cancelled/unknown without a badge', () => {
    expect(assetStatusToTd('registered')).toBe('PROTECTED');
    expect(assetStatusToTd('cancelled')).toBeNull();
    expect(assetStatusToTd('')).toBeNull();
    expect(assetStatusToTd('something_else')).toBeNull();
  });
  it('maps word-for-word statuses from the fixed vocabulary, case-insensitively', () => {
    expect(assetStatusToTd('TRACKING')).toBe('TRACKING');
    expect(assetStatusToTd('pending_verification')).toBe('PENDING VERIFICATION');
    expect(assetStatusToTd('lost')).toBe('LOST');
    expect(assetStatusToTd('stolen')).toBe('STOLEN');
    expect(assetStatusToTd('recovered')).toBe('RECOVERED');
    expect(assetStatusToTd('claim_open')).toBe('CLAIM OPEN');
  });
});

describe('assetTypeToTd', () => {
  it('maps every API category to its own icon type', () => {
    expect(assetTypeToTd('vehicle')).toBe('car');
    expect(assetTypeToTd('laptop')).toBe('laptop');
    expect(assetTypeToTd('smartphone')).toBe('smartphone');
    expect(assetTypeToTd('tablet')).toBe('tablet');
    expect(assetTypeToTd('tv')).toBe('tv');
    expect(assetTypeToTd('desktop')).toBe('desktop');
    expect(assetTypeToTd('business_equipment')).toBe('equipment');
    expect(assetTypeToTd('other_electronics')).toBe('other');
  });
});

describe('assetIdentifier', () => {
  it('prefers registration, then VIN, for vehicles', () => {
    expect(assetIdentifier({ id: 'a1', assetType: 'vehicle', details: { licensePlate: 'CA 123 456', vin: 'WVWZZZ1234' } })).toEqual({
      label: 'Registration ending',
      value: 'CA 123 456',
    });
    expect(assetIdentifier({ id: 'a1', assetType: 'vehicle', details: { vin: 'WVWZZZ1234' } })).toEqual({ label: 'VIN ending', value: 'WVWZZZ1234' });
  });
  it('uses IMEI for phones and serial number elsewhere', () => {
    expect(assetIdentifier({ id: 'a1', assetType: 'smartphone', details: { imei: '35' + '0'.repeat(11) + '1234', serialNumber: 'S1' } }).label).toBe('IMEI ending');
    expect(assetIdentifier({ id: 'a1', assetType: 'laptop', details: { serialNumber: 'C02XYZ9' } })).toEqual({ label: 'Serial ending', value: 'C02XYZ9' });
  });
  it('falls back to the asset ID when details carry nothing usable', () => {
    expect(assetIdentifier({ id: 'asset-0099', assetType: 'tv', details: {} })).toEqual({ label: 'Asset ID ending', value: 'asset-0099' });
    expect(assetIdentifier({ id: 'asset-0099', assetType: 'laptop', details: { serialNumber: '   ' } }).label).toBe('Asset ID ending');
  });
});

describe('footer and type label', () => {
  it('humanises the category and keeps the raw status word visible', () => {
    expect(formatAssetType('business_equipment')).toBe('Business equipment');
    expect(assetFooter({ assetType: 'laptop', status: 'active' })).toBe('Laptop · active');
    expect(assetFooter({ assetType: 'other_electronics', status: 'pending_review' })).toBe('Other electronics · pending review');
  });
});
