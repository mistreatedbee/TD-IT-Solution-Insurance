import { useEffect, useState } from 'react';
import { Button, Card, SectionHeading } from '../../components';
import { InlineAlert, LoadingState } from '../../dashboard/components/ui';
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type CategoryChannelPreferences,
  type NotificationCategory,
  type NotificationPreferencesResponse,
} from '../../customer/api/notifications';
import { mapUserFacingError } from '../../lib/user-facing-errors';

type Channel = keyof CategoryChannelPreferences;

const CHANNELS: ReadonlyArray<{ key: Channel; label: string }> = [
  { key: 'push', label: 'Push' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
];

const CATEGORIES: ReadonlyArray<{
  key: NotificationCategory;
  label: string;
  description: string;
}> = [
  {
    key: 'theft_critical',
    label: 'Theft alerts',
    description:
      'Critical alerts when a registered asset is reported stolen or a tracking geofence is triggered.',
  },
  {
    key: 'device_status',
    label: 'Device status',
    description: 'GPS, battery, and connectivity updates for your tracked devices.',
  },
  {
    key: 'billing',
    label: 'Billing',
    description: 'Payment reminders, receipts, and billing issues.',
  },
  {
    key: 'account',
    label: 'Account & security',
    description: 'Login alerts and changes to your account or security settings.',
  },
  {
    key: 'claims',
    label: 'Claims',
    description: 'Updates on the status of claims you have filed.',
  },
  {
    key: 'general',
    label: 'General',
    description: 'Service announcements and product updates.',
  },
  {
    key: 'marketing',
    label: 'Marketing',
    description: 'Promotions, offers, and newsletters.',
  },
];

function isLocked(category: NotificationCategory, channel: Channel): boolean {
  return category === 'theft_critical' && channel === 'push';
}

function PreferenceSwitch({
  checked,
  disabled,
  onChange,
  id,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  id: string;
  label: string;
}) {
  return (
    <label
      htmlFor={id}
      className={`relative inline-flex shrink-0 items-center ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
        aria-label={label}
      />
      <span
        aria-hidden
        className="h-6 w-11 rounded-full bg-border transition-colors peer-checked:bg-primary peer-disabled:bg-border peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform peer-checked:translate-x-5"
      />
    </label>
  );
}

export function CustomerNotificationPreferencesPage() {
  const [channels, setChannels] = useState<NotificationPreferencesResponse['channels'] | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setIsLoading(true);
    setLoadError(null);
    getNotificationPreferences()
      .then((res) => setChannels(res.channels))
      .catch((err) => {
        setLoadError(mapUserFacingError(err, { context: 'notification' }));
      })
      .finally(() => setIsLoading(false));
  }

  async function handleToggle(category: NotificationCategory, channel: Channel, next: boolean) {
    if (!channels || isLocked(category, channel)) return;

    const key = `${category}.${channel}`;
    const previous = channels;

    setChannels({
      ...channels,
      [category]: { ...channels[category], [channel]: next },
    });
    setSaveError(null);
    setSaveSuccess(null);
    setSavingKey(key);

    try {
      const result = await updateNotificationPreferences({ [category]: { [channel]: next } });
      setChannels(result.channels);
      setSaveSuccess('Preference saved.');
    } catch (err) {
      setChannels(previous);
      setSaveError(mapUserFacingError(err, { context: 'notification' }));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <SectionHeading
        as="h2"
        title="Notification preferences"
        size="md"
        subtitle="Choose how you want to hear from us, by category and channel."
      />

      {saveError ? <InlineAlert tone="danger">{saveError}</InlineAlert> : null}
      {saveSuccess && !saveError ? <InlineAlert tone="info">{saveSuccess}</InlineAlert> : null}

      {isLoading ? (
        <LoadingState label="Loading notification preferences…" />
      ) : loadError ? (
        <>
          <InlineAlert tone="danger">{loadError}</InlineAlert>
          <Button variant="secondary" size="sm" onClick={load}>
            Retry
          </Button>
        </>
      ) : channels ? (
        CATEGORIES.map((category) => (
          <Card key={category.key} padding="lg" interactive={false}>
            <SectionHeading as="h3" title={category.label} size="md" className="mb-1" />
            <p className="mb-4 text-sm text-text-secondary">{category.description}</p>

            <div className="divide-y divide-border">
              {CHANNELS.map((channel) => {
                const locked = isLocked(category.key, channel.key);
                const value = channels[category.key]?.[channel.key] ?? false;
                const key = `${category.key}.${channel.key}`;
                const inputId = `pref-${key}`;

                return (
                  <div key={key} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-primary">{channel.label}</p>
                      {locked ? (
                        <p className="text-xs text-text-secondary">
                          Required — cannot be turned off
                        </p>
                      ) : savingKey === key ? (
                        <p className="text-xs text-text-secondary">Saving…</p>
                      ) : null}
                    </div>
                    <PreferenceSwitch
                      id={inputId}
                      label={`${channel.label} notifications for ${category.label}`}
                      checked={locked ? true : value}
                      disabled={locked || savingKey !== null}
                      onChange={(next) => void handleToggle(category.key, channel.key, next)}
                    />
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      ) : null}
    </div>
  );
}
