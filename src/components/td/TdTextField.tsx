import React, { useId } from 'react';
import { CircleAlert } from 'lucide-react';
import { cx, TD_FOCUS } from './cx';

export interface TdTextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'placeholder'> {
  /** One to four words naming the data (not an instruction). Sits inside the field. */
  label: string;
  /** Sentence saying what to fix. When set the field is invalid. Validate on blur is the caller's job. */
  error?: string;
  /** Neutral hint shown under the field. */
  help?: string;
}

export const TdTextField = React.forwardRef<HTMLInputElement, TdTextFieldProps>(function TdTextField(
  { label, error, help, id, className, 'aria-describedby': describedBy, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const helpId = `${inputId}-help`;
  const hasMsg = Boolean(error || help);
  const described = [describedBy, hasMsg ? helpId : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={className}>
      <div className="relative block">
        <input
          ref={ref}
          id={inputId}
          placeholder=" "
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          className={cx(
            'peer h-[56px] w-full rounded-td-md border-[1.5px] bg-td-bg-sunken px-td-4 pb-[6px] pt-[22px] font-td-sans text-[15px] leading-[22px] text-td-ink transition-colors duration-150',
            'placeholder:text-transparent focus:border-td-focus-ring disabled:opacity-45',
            error ? 'border-td-danger' : 'border-td-border-control',
            TD_FOCUS,
          )}
          {...rest}
        />
        <label
          htmlFor={inputId}
          className={cx(
            'pointer-events-none absolute left-td-4 top-[17px] origin-top-left font-td-sans text-[15px] leading-[22px] text-td-ink-muted transition duration-200',
            'peer-focus:-translate-y-[11px] peer-focus:scale-[0.8] peer-[:not(:placeholder-shown)]:-translate-y-[11px] peer-[:not(:placeholder-shown)]:scale-[0.8]',
          )}
        >
          {label}
        </label>
      </div>
      {hasMsg ? (
        <p
          id={helpId}
          className={cx(
            'mx-1 mt-[6px] flex items-center gap-[6px] font-td-sans text-[13px] leading-[18px]',
            error ? 'text-td-danger' : 'text-td-ink-muted',
          )}
        >
          {error ? <CircleAlert aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 flex-none" /> : null}
          {error ?? help}
        </p>
      ) : null}
    </div>
  );
});
