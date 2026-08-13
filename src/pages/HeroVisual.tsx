import { Logo } from '../components/Logo';

/** Hero brand visual — logo only. */
export function HeroVisual() {
  return (
    <div className="relative mx-auto flex w-full max-w-lg items-center justify-center lg:max-w-xl">
      <Logo
        tone="navy"
        size="xl"
        imageClassName="h-auto w-full max-h-[min(560px,58vh)] max-w-xl object-contain"
        label="TD IT Solution Insurance"
      />
    </div>
  );
}
