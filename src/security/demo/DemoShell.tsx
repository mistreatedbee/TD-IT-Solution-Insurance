import type { ReactNode } from 'react';
import { installDemo } from './install';
import { DEMO_ORG_NAME } from './data';

let ready = false;
/** Wraps the security routes in demo mode: installs the fake API once, shows a persistent banner. */
export default function DemoShell({ children }: { children: ReactNode }) {
  if (!ready) {
    installDemo();
    ready = true;
  }
  return (
    <>
      <div
        role="status"
        className="sticky top-0 z-[1000] w-full bg-amber-400 px-3 py-2 text-center text-sm font-semibold text-black"
      >
        DEMO — fictional data. {DEMO_ORG_NAME}. Pre-launch; nothing here is live.
      </div>
      {children}
    </>
  );
}
