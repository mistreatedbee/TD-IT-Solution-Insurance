import React, { forwardRef, useId } from 'react';
import { AlertCircleIcon } from 'lucide-react';

export type InputVariant = 'text' | 'email' | 'tel' | 'url' | 'password' | 'textarea';

export interface InputProps extends
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Visible label text. Required for accessibility. */
  label: string;
  /** Field type. Use `textarea` for multi-line input. */
  type?: InputVariant;
  /** Helper text shown below the field when there is no error. */
  hint?: string;
  /** Error message. When set, the field renders in its error state. */
  error?: string;
  /** Visually hide the label (still available to screen readers). */
  hideLabel?: boolean;
  /** Rows for the textarea variant. */
  rows?: number;
  /** Extra classes on the outer wrapper. */
  className?: string;
  /**
   * OB-17 floating-label mode: the label sits inline at rest and animates
   * to a small caption above the field on focus/once filled, per
   * docs/organization/design-system/ob-17-glass-redesign-tokens.md §6 and
   * ob-17-glass-redesign-screens.md §1.2/§13.3 (ratified: floating labels
   * retained). Visual-only — behavior/validation unchanged.
   */
  floatingLabel?: boolean;
}

const baseFieldClasses =
'block w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors outline-none focus:ring-2 focus:ring-offset-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

const stateClasses = (hasError: boolean) =>
hasError ?
'border-red-500 focus:border-red-500 focus:ring-red-200' :
'border-slate-300 hover:border-slate-400 focus:border-primary focus:ring-accent-gold-deep/30';

// OB-17: floating-label fields use the single ratified accent
// (--glass-accent) rather than the pre-OB-17 gold accent — opt-in via
// `floatingLabel`, not a change to the default (non-floating) Input used
// elsewhere in the app.
const floatingStateClasses = (hasError: boolean) =>
hasError ?
'border-red-500 focus:border-red-500 focus:ring-red-200' :
'border-slate-300 hover:border-slate-400 focus:border-glass-accent focus:ring-glass-accent/30';

export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
  function Input(
  {
    label,
    type = 'text',
    hint,
    error,
    hideLabel = false,
    rows = 4,
    className = '',
    id,
    required,
    disabled,
    floatingLabel = false,
    placeholder,
    ...rest
  },
  ref)
  {
    const generatedId = useId();
    const fieldId = id ?? `input-${generatedId}`;
    const messageId = `${fieldId}-message`;
    const hasError = Boolean(error);
    const message = error ?? hint;

    if (!floatingLabel) {
      const fieldClasses = `${baseFieldClasses} ${stateClasses(hasError)}`;

      return (
        <div className={`w-full ${className}`}>
          <label
            htmlFor={fieldId}
            className={
            hideLabel ?
            'sr-only' :
            'mb-1.5 block text-sm font-medium text-slate-800'
            }>

            {label}
            {required &&
            <span className="ml-0.5 text-red-600" aria-hidden="true">
                *
              </span>
            }
          </label>

          {type === 'textarea' ?
          <textarea
            {...rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>}
            ref={ref as React.Ref<HTMLTextAreaElement>}
            id={fieldId}
            rows={rows}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={hasError || undefined}
            aria-describedby={message ? messageId : undefined}
            className={`${fieldClasses} resize-y`} /> :


          <input
            {...rest}
            ref={ref as React.Ref<HTMLInputElement>}
            id={fieldId}
            type={type}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            aria-invalid={hasError || undefined}
            aria-describedby={message ? messageId : undefined}
            className={fieldClasses} />

          }

          {message &&
          <p
            id={messageId}
            className={`mt-1.5 flex items-start gap-1 text-xs ${
            hasError ? 'text-red-600' : 'text-slate-500'}`
            }>

              {hasError &&
            <AlertCircleIcon
              className="mt-px h-3.5 w-3.5 shrink-0"
              aria-hidden="true" />

            }
              <span>{message}</span>
            </p>
          }
        </div>);
    }

    // OB-17 floating-label mode: label sits inline at rest (rendered as a
    // placeholder-styled overlay), rises to a small caption above the field
    // on focus or once filled, using `:placeholder-shown`/`:focus` + peer
    // classes (no JS state needed, so filled-on-mount values from
    // `defaultValue`/`value` are handled correctly by the browser's own
    // placeholder-shown logic). `--ease-standard`/200-300ms motion per
    // tokens doc §3/§5.3.
    const floatingFieldClasses = `peer ${baseFieldClasses.replace('rounded-md', 'rounded-glass-input').replace('px-3 py-2', 'px-3.5 pb-2 pt-5')} placeholder:text-transparent ${floatingStateClasses(hasError)}`;
    const floatingLabelClasses =
      'pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-500 transition-all duration-200 ease-[var(--ease-standard)] ' +
      'peer-focus:top-2.5 peer-focus:translate-y-0 peer-focus:text-[length:var(--glass-text-xs)] peer-focus:text-glass-accent-deep ' +
      'peer-[:not(:placeholder-shown)]:top-2.5 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[length:var(--glass-text-xs)] peer-[:not(:placeholder-shown)]:text-glass-text-secondary';

    return (
      <div className={`w-full ${className}`}>
        <div className="relative">
          {type === 'textarea' ?
          <textarea
            {...rest as React.TextareaHTMLAttributes<HTMLTextAreaElement>}
            ref={ref as React.Ref<HTMLTextAreaElement>}
            id={fieldId}
            rows={rows}
            required={required}
            disabled={disabled}
            placeholder={placeholder ?? ' '}
            aria-invalid={hasError || undefined}
            aria-describedby={message ? messageId : undefined}
            className={`${floatingFieldClasses} resize-y`} /> :


          <input
            {...rest}
            ref={ref as React.Ref<HTMLInputElement>}
            id={fieldId}
            type={type}
            required={required}
            disabled={disabled}
            placeholder={placeholder ?? ' '}
            aria-invalid={hasError || undefined}
            aria-describedby={message ? messageId : undefined}
            className={floatingFieldClasses} />

          }

          <label
            htmlFor={fieldId}
            className={hideLabel ? 'sr-only' : floatingLabelClasses}>

            {label}
            {required &&
            <span className="ml-0.5 text-red-600" aria-hidden="true">
                *
              </span>
            }
          </label>
        </div>

        {message &&
        <p
          id={messageId}
          className={`mt-1.5 flex items-start gap-1 text-xs ${
          hasError ? 'text-red-600' : 'text-slate-500'}`
          }>

            {hasError &&
          <AlertCircleIcon
            className="mt-px h-3.5 w-3.5 shrink-0"
            aria-hidden="true" />

          }
            <span>{message}</span>
          </p>
        }
      </div>);

  }
);