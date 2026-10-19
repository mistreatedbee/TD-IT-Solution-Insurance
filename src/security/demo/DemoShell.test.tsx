import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import DemoShell from './DemoShell';
import { DEMO_ORG_NAME, DEMO_ORG_PSIRA_NUMBER, DEMO_OPERATOR_DISPLAY_NAME } from './data';

describe('DemoShell banner', () => {
  it('shows the fictional org name, PSIRA disclaimer, and operator display name', () => {
    render(<DemoShell>child</DemoShell>);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(DEMO_ORG_NAME);
    expect(banner).toHaveTextContent(DEMO_ORG_PSIRA_NUMBER);
    expect(banner).toHaveTextContent(DEMO_OPERATOR_DISPLAY_NAME);
    expect(banner).toHaveTextContent('Pre-launch; nothing here is live.');
  });
});
