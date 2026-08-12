import { Logo } from '../components/Logo';

/**
 * Hero brand visual: large logo mark without decorative motif behind it.
 */
export function HeroVisual() {
  return (
    <div className="relative mx-auto flex w-full max-w-lg items-center justify-center lg:max-w-xl">
      <Logo
        tone="navy"
        size="xl"
        imageClassName="h-auto w-full max-h-[min(420px,48vh)] max-w-xl object-contain"
        label="TD IT Solution Insurance"
      />
    </div>
  );
}
