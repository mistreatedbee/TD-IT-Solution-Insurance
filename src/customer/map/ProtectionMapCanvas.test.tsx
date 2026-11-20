import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ProtectionMapCanvas } from './ProtectionMapCanvas';

describe('ProtectionMapCanvas tile layer', () => {
  it('requests OSM tiles with referrerPolicy strict-origin and shows OSM attribution', async () => {
    const { container } = render(<ProtectionMapCanvas pins={[]} />);
    await new Promise((r) => setTimeout(r, 0));
    const tiles = Array.from(container.querySelectorAll<HTMLImageElement>('img.leaflet-tile'));
    expect(tiles.length).toBeGreaterThan(0);
    tiles.forEach((img) => {
      expect(img.referrerPolicy).toBe('strict-origin');
      expect(img.src.startsWith('https://tile.openstreetmap.org/')).toBe(true);
    });
    expect(container.textContent).toContain('OpenStreetMap contributors');
  });
});
