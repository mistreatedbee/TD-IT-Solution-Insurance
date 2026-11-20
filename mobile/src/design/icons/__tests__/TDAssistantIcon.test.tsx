import React from 'react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { TDAssistantIcon } from '../TDAssistantIcon';
import { TD_MARK_BOTTOM, TD_MARK_TOP } from '../tdMark';

type Node = { props?: { d?: unknown }; children?: unknown } | Node[] | string | null;

/** react-native-svg renders each Polygon as a path whose `d` is "M" + the points (commas as spaces) + "z". */
function markPaths(json: unknown): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const d = n.props?.d;
    if (typeof d === 'string' && d.startsWith('M683.5')) out.push(d);
    walk((n.children ?? null) as Node);
  };
  walk(json as Node);
  return out;
}
const asPath = (points: string) => `M${points.replace(/,/g, ' ')}z`;

describe('TDAssistantIcon', () => {
  it('draws the simplified two-chevron mark at icon sizes', async () => {
    const view = await renderWithProviders(<TDAssistantIcon size={24} />);
    expect(markPaths(view.toJSON())).toEqual([asPath(TD_MARK_TOP.outer), asPath(TD_MARK_BOTTOM.outer)]);
  });

  it('draws the full four-chevron mark at large sizes', async () => {
    const view = await renderWithProviders(<TDAssistantIcon size={48} />);
    expect(markPaths(view.toJSON())).toHaveLength(4);
  });
});
