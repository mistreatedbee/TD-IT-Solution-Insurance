/**
 * Summarises material asset field changes for AST-002 notifications.
 */
import type { AssetDocument } from '../repositories/assets.js';
import type { UpdateAssetBody } from './asset-validation.js';

export function summarizeMaterialAssetChanges(
  before: AssetDocument,
  patch: UpdateAssetBody,
): string | null {
  const parts: string[] = [];

  if (patch.displayName !== undefined && patch.displayName !== before.displayName) {
    parts.push('name');
  }

  if (patch.estimatedValue !== undefined) {
    const beforeAmount = before.estimatedValue?.amount ?? null;
    const afterAmount = patch.estimatedValue?.amount ?? null;
    if (beforeAmount !== afterAmount) {
      parts.push('estimated value');
    }
  }

  if (patch.details !== undefined) {
    const beforeJson = JSON.stringify(before.details);
    const afterJson = JSON.stringify(patch.details);
    if (beforeJson !== afterJson) {
      parts.push('asset details');
    }
  }

  if (parts.length === 0) return null;
  return parts.join(', ');
}

export function hasMaterialAssetChanges(before: AssetDocument, patch: UpdateAssetBody): boolean {
  return summarizeMaterialAssetChanges(before, patch) !== null;
}
