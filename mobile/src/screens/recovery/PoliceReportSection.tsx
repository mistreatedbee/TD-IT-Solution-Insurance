/**
 * Feature 011 — SAPS case-number capture.
 *
 * Optional, post-submission follow-up on an existing recovery case (never
 * part of the initial theft report — a SAPS case number structurally can't
 * exist at report time, per business-requirements.md BR-011-03/05). Lets the
 * customer add or update `sapsCaseNumber` / `reportingStation` /
 * `reportedToPoliceAt` at any time, including after the case is closed
 * (api-design.md §2.3 — no status gate on this endpoint).
 */
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  type PoliceReport,
  type PoliceReportField,
  type UpdatePoliceReportRequest,
} from '../../api/recovery';
import { useUpdatePoliceReportMutation } from '../../api/hooks/useRecovery';
import { mapUserFacingError } from '../../lib/user-facing-errors';
import { Alert, Button, Card, Input } from '../../theme/primitives';
import { colors, spacing, typography } from '../../theme/tokens';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FIELD_LABELS: Record<PoliceReportField, string> = {
  sapsCaseNumber: 'SAPS case number',
  reportingStation: 'Reporting station',
  reportedToPoliceAt: 'Date reported to police',
};

interface PoliceReportSectionProps {
  caseId: string;
  policeReport: PoliceReport | undefined;
}

function hasAnyValue(report: PoliceReport | undefined): boolean {
  return Boolean(report?.sapsCaseNumber || report?.reportingStation || report?.reportedToPoliceAt);
}

export function PoliceReportSection({ caseId, policeReport }: PoliceReportSectionProps) {
  const updateMutation = useUpdatePoliceReportMutation();
  const [editing, setEditing] = useState(!hasAnyValue(policeReport));
  const [sapsCaseNumber, setSapsCaseNumber] = useState(policeReport?.sapsCaseNumber ?? '');
  const [reportingStation, setReportingStation] = useState(policeReport?.reportingStation ?? '');
  const [reportedToPoliceAt, setReportedToPoliceAt] = useState(policeReport?.reportedToPoliceAt ?? '');
  const [dateError, setDateError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const history = policeReport?.history ?? [];
  // API returns oldest-first (api-design.md §2.2); show most recent first.
  const historyNewestFirst = [...history].reverse();

  /** Re-syncs the form fields from the current saved values, then opens the
   * form for editing — covers both the first-entry case and re-editing
   * after the case's police-report fields changed elsewhere (e.g. a prior
   * save on this same screen). */
  function openForEditing() {
    setSapsCaseNumber(policeReport?.sapsCaseNumber ?? '');
    setReportingStation(policeReport?.reportingStation ?? '');
    setReportedToPoliceAt(policeReport?.reportedToPoliceAt ?? '');
    setDateError(null);
    setErrorMessage(null);
    setEditing(true);
  }

  async function handleSave() {
    const dateValue = reportedToPoliceAt.trim();
    if (dateValue && !DATE_PATTERN.test(dateValue)) {
      setDateError('Use YYYY-MM-DD format.');
      return;
    }
    setDateError(null);
    setErrorMessage(null);

    const body: UpdatePoliceReportRequest = {
      sapsCaseNumber: sapsCaseNumber.trim() || null,
      reportingStation: reportingStation.trim() || null,
      reportedToPoliceAt: dateValue || null,
    };

    try {
      await updateMutation.mutateAsync({ caseId, body });
      setEditing(false);
    } catch (err) {
      setErrorMessage(mapUserFacingError(err, { context: 'recovery' }));
    }
  }

  if (!editing) {
    return (
      <Card style={styles.card}>
        <Text style={styles.heading}>Police report</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>SAPS case number</Text>
          <Text style={styles.summaryValue}>{policeReport?.sapsCaseNumber ?? 'Not added yet'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Reporting station</Text>
          <Text style={styles.summaryValue}>{policeReport?.reportingStation ?? 'Not added yet'}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Date reported to police</Text>
          <Text style={styles.summaryValue}>{policeReport?.reportedToPoliceAt ?? 'Not added yet'}</Text>
        </View>

        <Button variant="secondary" onPress={openForEditing}>
          Update police report
        </Button>

        {history.length > 0 ? (
          <>
            <Button variant="tertiary" onPress={() => setShowHistory((v) => !v)}>
              {showHistory ? 'Hide history' : `Show history (${history.length})`}
            </Button>
            {showHistory ? (
              <View style={styles.historyList}>
                {historyNewestFirst.map((entry, index) => (
                  <View key={`${entry.field}-${entry.changedAt}-${index}`} style={styles.historyRow}>
                    <Text style={styles.historyField}>{FIELD_LABELS[entry.field]}</Text>
                    <Text style={styles.historyChange}>
                      {(entry.previousValue ?? '—') + ' → ' + (entry.newValue ?? '—')}
                    </Text>
                    <Text style={styles.historyDate}>{new Date(entry.changedAt).toLocaleString()}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </Card>
    );
  }

  return (
    <Card style={styles.card}>
      <Text style={styles.heading}>Police report</Text>
      <Text style={styles.helper}>
        Optional. If you&rsquo;ve opened a case with SAPS, add the case number here so it&rsquo;s on
        record — you can add or update it at any time, even after the theft report was filed.
      </Text>

      <Input
        label="SAPS case number"
        value={sapsCaseNumber}
        onChangeText={setSapsCaseNumber}
        placeholder="e.g. CAS 123/4/2026"
        hint="As given to you by SAPS. No specific format is required."
      />

      <Input
        label="Reporting station"
        value={reportingStation}
        onChangeText={setReportingStation}
        placeholder="e.g. Sandton SAPS"
      />

      <Input
        label="Date reported to police"
        value={reportedToPoliceAt}
        onChangeText={setReportedToPoliceAt}
        placeholder="YYYY-MM-DD"
        error={dateError ?? undefined}
        hint={dateError ? undefined : 'Use YYYY-MM-DD format, e.g. 2026-09-08.'}
      />

      {errorMessage ? (
        <View style={styles.alertSpacing}>
          <Alert tone="danger">{errorMessage}</Alert>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button variant="primary" loading={updateMutation.isPending} onPress={handleSave}>
          Save
        </Button>
        {hasAnyValue(policeReport) ? (
          <Button
            variant="tertiary"
            disabled={updateMutation.isPending}
            onPress={() => {
              setSapsCaseNumber(policeReport?.sapsCaseNumber ?? '');
              setReportingStation(policeReport?.reportingStation ?? '');
              setReportedToPoliceAt(policeReport?.reportedToPoliceAt ?? '');
              setDateError(null);
              setErrorMessage(null);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  heading: {
    fontSize: typography.sizes.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  helper: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    lineHeight: typography.sizes.sm * 1.4,
    marginBottom: spacing.xs,
  },
  summaryRow: {
    marginBottom: spacing.xs,
  },
  summaryLabel: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  summaryValue: {
    fontSize: typography.sizes.sm,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  alertSpacing: {
    marginBottom: spacing.sm,
  },
  actions: {
    gap: spacing.sm,
  },
  historyList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  historyRow: {
    borderTopWidth: 1,
    borderTopColor: colors.slate[300],
    paddingTop: spacing.xs,
  },
  historyField: {
    fontSize: typography.sizes.xs,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  historyChange: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  historyDate: {
    fontSize: typography.sizes.xs,
    color: colors.slate[500],
  },
});
