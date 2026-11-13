import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { TdButton, TdGlassCard, TdTextField, TdStatusBadge, TdAssetCard, TdNavBar, TD_STATUSES, lastFour } from './index';

describe('TdButton', () => {
  it('renders each variant with 48px min height and on-action-primary text', () => {
    for (const v of ['primary', 'secondary', 'glass', 'danger'] as const) {
      const { unmount } = render(<TdButton variant={v}>Report theft</TdButton>);
      const b = screen.getByRole('button', { name: 'Report theft' });
      expect(b.className).toContain('min-h-[48px]');
      if (v === 'primary') {
        expect(b.className).toContain('text-td-on-action-primary');
        expect(b.className).not.toContain('text-white');
      }
      unmount();
    }
  });
  it('renders a decorative icon, supports disabled and keyboard focus', async () => {
    const onClick = vi.fn();
    render(<TdButton icon={<svg data-testid="i" />} onClick={onClick}>Add asset</TdButton>);
    expect(screen.getByTestId('i').parentElement).toHaveAttribute('aria-hidden', 'true');
    await userEvent.tab();
    const b = screen.getByRole('button', { name: 'Add asset' });
    expect(b).toHaveFocus();
    expect(b.className).toContain('focus-visible:outline-offset-2');
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it('does not fire when disabled', async () => {
    const onClick = vi.fn();
    render(<TdButton disabled onClick={onClick}>Save</TdButton>);
    expect(screen.getByRole('button')).toBeDisabled();
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TdGlassCard', () => {
  it('glass keeps fill, border, shadow and blur together, with reduced-transparency fallback', () => {
    render(<TdGlassCard data-testid="c">x</TdGlassCard>);
    const c = screen.getByTestId('c');
    expect(c.dataset.surface).toBe('glass');
    for (const t of ['bg-td-glass-fill', 'border-td-glass-border', 'shadow-[', 'backdrop-blur-td-glass', 'prefers-reduced-transparency:reduce']) {
      expect(c.className).toContain(t);
    }
  });
  it('forceSolid and solid use bg-raised, no blur, keep border', () => {
    for (const props of [{ forceSolid: true }, { variant: 'solid' as const }]) {
      const { unmount } = render(<TdGlassCard data-testid="c" {...props}>x</TdGlassCard>);
      const c = screen.getByTestId('c');
      expect(c.dataset.surface).toBe('solid');
      expect(c.className).toContain('bg-td-bg-raised');
      expect(c.className).toContain('border');
      expect(c.className).not.toContain('backdrop-blur-td-glass');
      unmount();
    }
  });
  it('selected adds the outline', () => {
    render(<TdGlassCard data-testid="c" selected>x</TdGlassCard>);
    expect(screen.getByTestId('c').className).toContain('outline-offset-2');
  });
});

describe('TdTextField', () => {
  it('uses placeholder " " and links label', () => {
    render(<TdTextField label="Email address" />);
    const i = screen.getByLabelText('Email address');
    expect(i).toHaveAttribute('placeholder', ' ');
    expect(i).not.toHaveAttribute('aria-invalid');
  });
  it('error shows icon, sentence, aria-invalid and aria-describedby', () => {
    const { container } = render(<TdTextField label="ID number" error="Enter all 13 digits of your ID number." />);
    const i = screen.getByLabelText('ID number');
    expect(i).toHaveAttribute('aria-invalid', 'true');
    const msg = screen.getByText('Enter all 13 digits of your ID number.');
    expect(i.getAttribute('aria-describedby')).toBe(msg.id);
    expect(msg.querySelector('svg')).not.toBeNull();
    expect(container.querySelector('input')?.className).toContain('border-td-danger');
  });
  it('is keyboard focusable and accepts typing', async () => {
    render(<TdTextField label="Name" />);
    await userEvent.tab();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    await userEvent.keyboard('Thandi');
    expect(screen.getByLabelText('Name')).toHaveValue('Thandi');
  });
});

describe('TdStatusBadge', () => {
  it('renders icon and word for every status in the vocabulary', () => {
    for (const s of TD_STATUSES) {
      const { container, unmount } = render(<TdStatusBadge status={s} />);
      expect(screen.getByText(s)).toBeInTheDocument();
      expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      unmount();
    }
    expect(TD_STATUSES).toHaveLength(7);
  });
  it('rejects other strings at compile time', () => {
    // @ts-expect-error not in the vocabulary
    const el = <TdStatusBadge status="ACTIVE" />;
    expect(el).toBeTruthy();
  });
  it('is not interactive', () => {
    render(<TdStatusBadge status="LOST" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('TdAssetCard', () => {
  it('masks identifiers to the last four characters', () => {
    expect(lastFour('C02XK12345K2F')).toBe('45K2F'.slice(-4));
    render(<TdAssetCard type="laptop" name="MacBook Pro 14" identifier="C02XK12345674K2F" status="PROTECTED" footer="Last seen 2 minutes ago" href="/a/1" />);
    expect(screen.getByText('Serial ending 4K2F')).toBeInTheDocument();
    expect(screen.queryByText(/C02XK/)).toBeNull();
  });
  it('is one link target with badge and footer, no image', () => {
    const { container } = render(<TdAssetCard type="car" name="Toyota Hilux" detailLabel="Registration ending" identifier="CA 123 456" status="STOLEN" footer="Case open. Security partner notified." href="/a/2" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/a/2');
    expect(link).toHaveTextContent('STOLEN');
    expect(link).toHaveTextContent('Case open. Security partner notified.');
    expect(container.querySelector('img')).toBeNull();
  });
  it('renders as a keyboard-operable button without href', async () => {
    const onSelect = vi.fn();
    render(<TdAssetCard type="tv" name="Samsung TV" identifier="SN998877" status="TRACKING" footer="Home" onSelect={onSelect} forceSolid />);
    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalled();
    expect(screen.getByRole('button').className).toContain('bg-td-bg-raised');
  });
  it('supports the smartphone type', () => {
    render(<TdAssetCard type="smartphone" name="Phone" identifier="1234567" status="LOST" footer="x" onSelect={vi.fn()} />);
    expect(screen.getByText('Serial ending 4567')).toBeInTheDocument();
  });
});

describe('TdNavBar', () => {
  const items = [{ label: 'Home', href: '/' }, { label: 'Assets', href: '/assets' }];
  it('marks only the current item with aria-current="page"', () => {
    render(<TdNavBar items={items} currentHref="/assets" />);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Assets' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });
  it('is keyboard navigable and supports forceSolid', async () => {
    render(<TdNavBar items={items} currentHref="/" forceSolid />);
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus();
    expect(screen.getByRole('navigation').className).toContain('bg-td-bg-raised');
  });
  it('renderLink lets a router Link take over while keeping aria-current and the active classes', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <TdNavBar
          items={items}
          currentHref="/"
          renderLink={({ href, ...rest }) => <Link to={href} data-router-link="true" {...rest} />}
        />
        <Routes>
          <Route path="/" element={<p>home page</p>} />
          <Route path="/assets" element={<p>assets page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('data-router-link', 'true');
    expect(home).toHaveAttribute('aria-current', 'page');
    expect(home.className).toContain('bg-td-action-primary');
    expect(screen.getByRole('link', { name: 'Assets' })).not.toHaveAttribute('aria-current');
    await userEvent.click(screen.getByRole('link', { name: 'Assets' }));
    expect(screen.getByText('assets page')).toBeInTheDocument(); // in-SPA navigation, no reload
  });
});

describe('TdAssetCard static mode', () => {
  it('renders a non-interactive summary with no badge when neither href nor onSelect nor status is given', () => {
    render(<TdAssetCard type="desktop" name="Office PC" identifier="PC-0042" footer="Desktop · removed" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Serial ending 0042')).toBeInTheDocument();
    for (const s of TD_STATUSES) expect(screen.queryByText(s)).toBeNull();
    expect(document.querySelector('[data-asset-card="static"]')?.className).not.toContain('focus-visible');
  });
});

import { TdBackdrop } from './index';
describe('TdBackdrop', () => {
  it.each([['chevron', 80], ['rings', 200], ['dots', 24]] as const)('renders %s pattern with one decorative layer', (p, size) => {
    const { container } = render(<TdBackdrop pattern={p}>content</TdBackdrop>);
    const layers = container.querySelectorAll('[data-td-layer="pattern"]');
    expect(layers).toHaveLength(1);
    expect(layers[0].getAttribute('aria-hidden')).toBe('true');
    const css = container.querySelector('style')!.textContent!;
    expect(css).toContain(`pattern-${p}-light.svg`);
    expect(css).toContain(`[data-theme="night"] .td-bd-${p}{background-image:url(/images/design/pattern-${p}-dark.svg)}`);
    expect(css).toContain(`${size}px ${size}px`);
    expect(css.match(/pattern-/g)!.length).toBe(2);
  });
  it('selects day/night image in image mode and keeps content accessible', () => {
    const { container } = render(<TdBackdrop image>hello</TdBackdrop>);
    const css = container.querySelector('style')!.textContent!;
    expect(css).toContain('bg-day-1920x1080.svg');
    expect(css).toContain('[data-theme="night"] .td-bd-img{background-image:url(/images/design/bg-night-1920x1080.svg)}');
    expect(screen.getByText('hello')).toBeTruthy();
    expect(container.querySelector('[data-td-layer="ground"]')!.getAttribute('aria-hidden')).toBe('true');
  });
  it('renders no pattern layer by default', () => {
    const { container } = render(<TdBackdrop />);
    expect(container.querySelector('[data-td-layer="pattern"]')).toBeNull();
  });
});
