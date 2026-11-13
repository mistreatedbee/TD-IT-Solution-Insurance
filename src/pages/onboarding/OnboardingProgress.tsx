import { CheckIcon } from 'lucide-react';
import { ONBOARDING_STEPS, stepProgressIndex, type OnboardingStep } from '../../onboarding/onboardingStorage';

export function OnboardingProgress({ step }: { step: OnboardingStep }) {
  const active = stepProgressIndex(step);

  return (
    <nav aria-label="Onboarding progress" className="mb-td-10">
      <ol className="flex flex-wrap items-center justify-center gap-td-2 sm:gap-td-4">
        {ONBOARDING_STEPS.map((item, index) => {
          const done = index < active;
          const current = index === active;
          return (
            <li key={item.id} className="flex items-center gap-td-2" aria-current={current ? 'step' : undefined}>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-td-pill font-td-sans text-[13px] font-bold leading-[18px] ${
                  done
                    ? 'bg-td-action-secondary text-td-on-action-secondary'
                    : current
                      ? 'bg-td-action-primary text-td-on-action-primary'
                      : 'bg-td-bg-sunken text-td-ink-muted'
                }`}
              >
                {done ? <CheckIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden /> : index + 1}
              </span>
              <span className={`body-sm hidden font-semibold sm:inline ${current ? 'text-td-ink' : 'text-td-ink-muted'}`}>
                {item.label}
              </span>
              {index < ONBOARDING_STEPS.length - 1 ? (
                <span className="mx-td-1 hidden h-px w-6 bg-td-border-subtle sm:inline-block" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
