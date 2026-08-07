import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';

export type AccordionProps = {
  /** Allow multiple items to be open at the same time. */
  allowMultiple?: boolean;
  /** Item values open on first render (uncontrolled). */
  defaultOpen?: string[];
  /** Additional class names for the list wrapper. */
  className?: string;
  children: React.ReactNode;
};

type AccordionContextValue = {
  openItems: string[];
  toggle: (value: string) => void;
};

const AccordionContext = createContext<AccordionContextValue | null>(null);

function useAccordionContext(): AccordionContextValue {
  const ctx = useContext(AccordionContext);
  if (!ctx) {
    throw new Error('AccordionItem must be rendered inside an Accordion');
  }
  return ctx;
}

export function Accordion({
  allowMultiple = false,
  defaultOpen = [],
  className = '',
  children
}: AccordionProps) {
  const [openItems, setOpenItems] = useState<string[]>(defaultOpen);

  const toggle = (value: string) => {
    setOpenItems((prev) => {
      const isOpen = prev.includes(value);
      if (isOpen) return prev.filter((item) => item !== value);
      return allowMultiple ? [...prev, value] : [value];
    });
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className={`divide-y divide-slate-200 border-y border-slate-200 ${className}`}>
        {children}
      </div>
    </AccordionContext.Provider>);

}

export type AccordionItemProps = {
  /** Unique identifier for this item. */
  value: string;
  /** Question / summary text shown in the trigger row. */
  title: React.ReactNode;
  /** Answer content revealed on expand. */
  children: React.ReactNode;
  disabled?: boolean;
};

export function AccordionItem({ value, title, children, disabled = false }: AccordionItemProps) {
  const { openItems, toggle } = useAccordionContext();
  const isOpen = openItems.includes(value);

  const id = useId();
  const panelId = `${id}-panel`;
  const buttonId = `${id}-button`;

  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setHeight(el.scrollHeight);
    measure();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children]);

  return (
    <div>
      <h3>
        <button
          type="button"
          id={buttonId}
          aria-expanded={isOpen}
          aria-controls={panelId}
          disabled={disabled}
          onClick={() => toggle(value)}
          className="flex w-full items-center justify-between gap-4 py-4 text-left text-base font-medium text-slate-900 transition-colors hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:text-slate-400">
          
          <span>{title}</span>
          <PlusMinusIcon open={isOpen} />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        style={{ height: isOpen ? height : 0 }}
        className="overflow-hidden transition-[height] duration-300 ease-out">
        
        <div
          ref={contentRef}
          className={`pb-4 pr-10 text-sm leading-relaxed text-slate-600 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0'}`
          }>
          
          {children}
        </div>
      </div>
    </div>);

}

function PlusMinusIcon({ open }: {open: boolean;}) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      
      <span className="absolute h-0.5 w-4 rounded-full bg-current" />
      <span
        className={`absolute h-0.5 w-4 rounded-full bg-current transition-transform duration-300 ease-out ${
        open ? 'rotate-0' : 'rotate-90'}`
        } />
      
    </span>);

}