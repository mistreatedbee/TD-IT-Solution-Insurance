/**
 * Feature 011 — SAPS case-number capture UI.
 * Covers the optional post-submission police-report form on the recovery
 * case detail screen (LiveTrackingScreen): entry, display of saved values,
 * date-format validation, and error surfacing.
 */
import React from 'react';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { PoliceReportSection } from '../PoliceReportSection';
import type { PoliceReport } from '../../../api/recovery';

jest.mock('../../../api/hooks/useRecovery', () => ({
  useUpdatePoliceReportMutation: jest.fn(),
}));

const { useUpdatePoliceReportMutation } = jest.requireMock('../../../api/hooks/useRecovery') as {
  useUpdatePoliceReportMutation: jest.Mock;
};

function emptyReport(): PoliceReport {
  return {
    sapsCaseNumber: null,
    reportingStation: null,
    reportedToPoliceAt: null,
    history: [],
  };
}

describe('PoliceReportSection', () => {
  let mutateAsync: jest.Mock;

  beforeEach(() => {
    mutateAsync = jest.fn().mockResolvedValue({});
    useUpdatePoliceReportMutation.mockReturnValue({ mutateAsync, isPending: false });
  });

  it('renders the entry form directly when nothing has been added yet', async () => {
    await renderWithProviders(
      <PoliceReportSection caseId="case-1" policeReport={undefined} />,
    );

    expect(screen.getByLabelText('SAPS case number')).toBeTruthy();
    expect(screen.getByLabelText('Reporting station')).toBeTruthy();
    expect(screen.getByLabelText('Date reported to police')).toBeTruthy();
    expect(screen.getByText('Save')).toBeTruthy();
  });

  it('submits trimmed values, mapping blanks to null', async () => {
    await renderWithProviders(
      <PoliceReportSection caseId="case-1" policeReport={undefined} />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('SAPS case number'), '  CAS 123/4/2026  ');
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Reporting station'), 'Sandton SAPS');
    });
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Date reported to police'), '2026-09-08');
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        caseId: 'case-1',
        body: {
          sapsCaseNumber: 'CAS 123/4/2026',
          reportingStation: 'Sandton SAPS',
          reportedToPoliceAt: '2026-09-08',
        },
      });
    });
  });

  it('rejects a malformed date without calling the API', async () => {
    await renderWithProviders(
      <PoliceReportSection caseId="case-1" policeReport={undefined} />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Date reported to police'), '08/09/2026');
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });

    expect(screen.getByText('Use YYYY-MM-DD format.')).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('shows saved values as a summary, not an open form', async () => {
    const report: PoliceReport = {
      sapsCaseNumber: 'CAS 88/1/2026',
      reportingStation: 'Rosebank SAPS',
      reportedToPoliceAt: '2026-08-20',
      history: [],
    };

    await renderWithProviders(<PoliceReportSection caseId="case-1" policeReport={report} />);

    expect(screen.getByText('CAS 88/1/2026')).toBeTruthy();
    expect(screen.getByText('Rosebank SAPS')).toBeTruthy();
    expect(screen.getByText('2026-08-20')).toBeTruthy();
    expect(screen.getByText('Update police report')).toBeTruthy();
    expect(screen.queryByLabelText('SAPS case number')).toBeNull();
  });

  it('opens the form for editing when "Update police report" is pressed', async () => {
    const report: PoliceReport = {
      sapsCaseNumber: 'CAS 88/1/2026',
      reportingStation: null,
      reportedToPoliceAt: null,
      history: [],
    };

    await renderWithProviders(<PoliceReportSection caseId="case-1" policeReport={report} />);

    await act(async () => {
      fireEvent.press(screen.getByText('Update police report'));
    });

    expect(screen.getByLabelText('SAPS case number').props.value).toBe('CAS 88/1/2026');
  });

  it('renders history entries when present, behind a toggle', async () => {
    const report: PoliceReport = {
      sapsCaseNumber: 'CAS 88/1/2026',
      reportingStation: null,
      reportedToPoliceAt: null,
      history: [
        {
          field: 'sapsCaseNumber',
          previousValue: null,
          newValue: 'CAS 88/1/2026',
          changedAt: '2026-08-21T10:00:00.000Z',
        },
      ],
    };

    await renderWithProviders(<PoliceReportSection caseId="case-1" policeReport={report} />);

    expect(screen.queryByText('— → CAS 88/1/2026')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByText('Show history (1)'));
    });
    expect(screen.getByText('— → CAS 88/1/2026')).toBeTruthy();
  });

  it('surfaces an error message when the save fails', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('TypeError: fetch failed'));

    await renderWithProviders(
      <PoliceReportSection caseId="case-1" policeReport={emptyReport()} />,
    );

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('SAPS case number'), 'CAS 1/1/2026');
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Save'));
    });

    await waitFor(() => {
      expect(
        screen.getByText('We could not report this theft. Please try again or contact support.'),
      ).toBeTruthy();
    });
  });
});
