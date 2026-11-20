/**
 * TD logo mark geometry, shared by the loading screen (animated halves) and the assistant icon (static mark).
 * Coordinates are in the mark's own viewBox. Each half carries the vertical offset that places it in the
 * assembled mark: apply `translate(0 offsetY)` to that half's group.
 */
export const TD_MARK_VIEWBOX = { x: 422.5, y: 145.25, width: 522, height: 587.75 } as const;
export const TD_MARK_VIEWBOX_STRING = `${TD_MARK_VIEWBOX.x} ${TD_MARK_VIEWBOX.y} ${TD_MARK_VIEWBOX.width} ${TD_MARK_VIEWBOX.height}`;

export const TD_MARK_TOP = {
  offsetY: 127,
  /** Outer chevron, brand orange. */
  outer: '683.5,26.2 936.5,279.2 901.0,279.2 683.5,61.8 466.0,279.2 430.5,279.2',
  /** Inner chevron, brand blue. */
  inner: '683.5,138.0 826.5,281.0 806.5,281.0 683.5,158.0 560.5,281.0 540.5,281.0',
} as const;

export const TD_MARK_BOTTOM = {
  offsetY: -127,
  /** Outer chevron, brand blue. */
  outer: '683.5,852.0 936.5,599.0 901.0,599.0 683.5,816.5 466.0,599.0 430.5,599.0',
  /** Inner chevron, brand blue. */
  inner: '683.5,740.2 826.5,597.2 806.5,597.2 683.5,720.2 560.5,597.2 540.5,597.2',
} as const;
