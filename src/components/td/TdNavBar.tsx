import React from 'react';
import { cx, TD_FOCUS } from './cx';

export interface TdNavItem {
  label: string;
  href: string;
  /** Optional decorative icon. */
  icon?: React.ReactNode;
}

/** Everything a custom link element needs; spread onto react-router's Link (`to={href}`) or any anchor-like component. */
export interface TdNavLinkRenderProps {
  href: string;
  className: string;
  'aria-current'?: 'page';
  children: React.ReactNode;
}

export interface TdNavBarProps {
  items: TdNavItem[];
  /** href of the current page; that item gets aria-current="page". */
  currentHref: string;
  /** Accessible name for the nav landmark. */
  label?: string;
  /** Brand slot rendered at the start. */
  brand?: React.ReactNode;
  forceSolid?: boolean;
  className?: string;
  /**
   * Render each item with a custom link element (e.g. react-router `Link`) so in-SPA navigation
   * stays client-side. Defaults to a plain `<a href>`. Keep `className`, `aria-current` and
   * `children` intact so the visual state and the current-page announcement are preserved.
   */
  renderLink?: (props: TdNavLinkRenderProps) => React.ReactNode;
}

const defaultRenderLink = ({ href, ...rest }: TdNavLinkRenderProps) => <a href={href} {...rest} />;

/** Web equivalent of the app TabBar: a top navigation bar on strong glass. */
export function TdNavBar({
  items,
  currentHref,
  label = 'Main',
  brand,
  forceSolid = false,
  className,
  renderLink = defaultRenderLink,
}: TdNavBarProps) {
  return (
    <nav
      aria-label={label}
      className={cx(
        'flex items-center gap-td-4 rounded-td-xl border p-td-2 text-td-ink',
        forceSolid
          ? 'border-td-border-subtle bg-td-bg-raised shadow-[var(--td-shadow-float)]'
          : 'border-td-glass-border bg-td-glass-fill shadow-[var(--td-shadow-float)] backdrop-blur-td-glass-strong [@media(prefers-reduced-transparency:reduce)]:bg-td-bg-raised [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none',
        className,
      )}
    >
      {brand ? <div className="flex-none px-td-3">{brand}</div> : null}
      <ul className="m-0 flex flex-wrap list-none gap-td-1 p-0">
        {items.map((it) => {
          const current = it.href === currentHref;
          return (
            <li key={it.href}>
              {renderLink({
                href: it.href,
                'aria-current': current ? 'page' : undefined,
                className: cx(
                  'flex min-h-[48px] items-center gap-td-2 rounded-td-lg px-td-4 font-td-sans text-[14px] font-bold no-underline transition-colors duration-200',
                  current ? 'bg-td-action-primary text-td-on-action-primary' : 'text-td-ink-muted hover:text-td-ink',
                  TD_FOCUS,
                ),
                children: (
                  <>
                    {it.icon ? (
                      <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center [&>svg]:h-5 [&>svg]:w-5">
                        {it.icon}
                      </span>
                    ) : null}
                    {it.label}
                  </>
                ),
              })}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
