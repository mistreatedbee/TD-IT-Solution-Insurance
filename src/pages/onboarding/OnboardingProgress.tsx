import { CheckIcon } from 'lucide-react';
import { ONBOARDING_STEPS, stepProgressIndex, type OnboardingStep } from '../../onboarding/onboardingStorage';

export function OnboardingProgress({ step }: { step: OnboardingStep }) {
  const active = stepProgressIndex(step);

  return (
    <nav aria-label="Onboarding progress" className="mb-10">
      <ol className="flex flex-wrap items-center justify-center gap-2 sm:gap-4">
        {ONBOARDING_STEPS.map((item, index) => {
          const done = index < active;
          const current = index === active;
          return (
            <li key={item.id} className="flex items-center gap-2">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  done
                    ? 'bg-accent-gold-deep text-white'
                    : current
                      ? 'bg-primary text-white'
                      : 'bg-slate-100 text-text-secondary'
                }`}
              >
                {done ? <CheckIcon className="h-4 w-4" aria-hidden /> : index + 1}
              </span>
              <span
                className={`hidden text-sm font-medium sm:inline ${
                  current ? 'text-text-primary' : 'text-text-secondary'
                }`}
              >
                {item.label}
              </span>
              {index < ONBOARDING_STEPS.length - 1 ? (
                <span className="mx-1 hidden h-px w-6 bg-border sm:inline-block" aria-hidden />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
