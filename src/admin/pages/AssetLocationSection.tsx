import { useEffect, useState } from 'react';
import { SectionHeading } from '../../components';
import { DataTable, DetailGrid, InlineAlert, LoadingState, StatusBadge } from '../../dashboard/components/ui';
import { ProtectionMapCanvas } from '../../customer/map/ProtectionMapCanvas';
import { ApiError } from '../../dashboard/api/errors';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { getAdminAssetLocation, type AdminAssetLocation } from '../api/admin-locations';
import { formatAgo, maskTail } from '../lib/format';

const SOURCE_LABEL: Record<string, string> = {
  phone: 'Phone (reported by our app)',
  hardware: 'GPS tracker',
  unknown: 'Unknown source',
};

const TRACKING_OFF_REASON: Record<string, string> = {
  withdrawn: 'The owner withdrew location consent, so earlier positions were deleted.',
  no_consent: 'There is no location consent on record for this asset.',
  archived: 'This asset is archived, so its location is not shown.',
};

const coords = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
const accuracy = (m: number | null) => (m == null ? 'Not reported' : `± ${Math.round(m)} m`);

/**
 * Last known location + recent history for one asset. Admin only; the server writes an audit row for every
 * load (the asset owner is the subject). Read-only: a position shown here never triggers dispatch or a claim.
 */
export function AssetLocationSection({ assetId, assetName }: { assetId: string; assetName: string }) {
  const [loc, setLoc] = useState<AdminAssetLocation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let live = true;
    getAdminAssetLocation(assetId)
      .then((r) => live && setLoc(r))
      .catch((err) => {
        if (!live) return;
        // 404 here means the location view is switched off on this server (the asset itself loaded).
        if (err instanceof ApiError && err.status === 404) setUnavailable(true);
        else setError(mapUserFacingError(err, { context: 'admin' }));
      });
    return () => {
      live = false;
    };
  }, [assetId]);

  let body: React.ReactNode;
  if (unavailable) {
    body = <p className="text-sm text-td-ink-muted">The location view is not switched on for this environment.</p>;
  } else if (error) {
    body = <InlineAlert tone="danger">{error}</InlineAlert>;
  } else if (!loc) {
    body = <LoadingState label="Loading location…" />;
  } else if (loc.trackingOff) {
    body = (
      <p className="text-sm text-td-ink-muted">No location — tracking is off. {TRACKING_OFF_REASON[loc.trackingOffReason ?? 'no_consent']}</p>
    );
  } else if (!loc.lastLocation) {
    body = <p className="text-sm text-td-ink-muted">No location yet — this asset has not reported a position.</p>;
  } else {
    const last = loc.lastLocation;
    body = (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-td-lg border border-td-border-subtle">
          <ProtectionMapCanvas
            pins={[{ id: loc.assetId, title: assetName, latitude: last.latitude, longitude: last.longitude }]}
            selectedId={loc.assetId}
            height={320}
          />
        </div>
        <DetailGrid
          rows={[
            { label: 'Coordinates', value: coords(last.latitude, last.longitude) },
            { label: 'Accuracy', value: accuracy(last.accuracyMeters) },
            { label: 'Source', value: SOURCE_LABEL[loc.source ?? 'unknown'] },
            {
              label: 'Reported',
              value: `${new Date(last.recordedAt).toLocaleString()} (${formatAgo(last.recordedAt)})`,
            },
          ]}
        />
        <div>
          <h3 className="mb-2 text-sm font-semibold text-td-ink">Recent history</h3>
          <DataTable
            emptyMessage="No earlier positions are stored for this asset."
            columns={[
              { key: 'recordedAt', header: 'Reported', render: (r) => `${new Date(String(r.recordedAt)).toLocaleString()} (${formatAgo(String(r.recordedAt))})` },
              { key: 'coords', header: 'Coordinates', render: (r) => coords(Number(r.latitude), Number(r.longitude)) },
              { key: 'accuracyMeters', header: 'Accuracy', render: (r) => accuracy(r.accuracyMeters as number | null) },
              { key: 'source', header: 'Source', render: (r) => SOURCE_LABEL[String(r.source)] },
            ]}
            rows={loc.history as unknown as Record<string, unknown>[]}
          />
        </div>
      </div>
    );
  }

  return (
    <section aria-label="Location">
      <SectionHeading as="h2" title="Location" size="md" className="mb-1" />
      <p className="mb-3 text-xs text-td-ink-muted">
        Viewing this location is written to the audit log. Read-only: it never starts a dispatch or a claim.
      </p>
      {loc?.trackingDevice ? (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-semibold text-td-ink">Linked tracking device</h3>
          <DetailGrid
            rows={[
              { label: 'Tracker', value: loc.trackingDevice.label ?? 'Unnamed tracker' },
              { label: 'Serial / IMEI', value: maskTail(loc.trackingDevice.serialOrImei) },
              { label: 'Status', value: <StatusBadge value={loc.trackingDevice.status} /> },
              {
                label: 'Activated',
                value: loc.trackingDevice.activatedAt ? new Date(loc.trackingDevice.activatedAt).toLocaleString() : 'Not activated',
              },
              { label: 'Last signal', value: formatAgo(loc.trackingDevice.lastTelemetryAt) },
            ]}
          />
        </div>
      ) : null}
      {body}
    </section>
  );
}
