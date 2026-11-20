export type DualLayoutDirection = 'side-by-side' | 'stacked';

/** Old templates keep their original split when no direction has been saved. */
export function getDualLayoutDirection(layout: { dualLayoutDirection?: string; labelRotation?: number }): DualLayoutDirection {
  if (layout.dualLayoutDirection === 'stacked' || layout.dualLayoutDirection === 'side-by-side') return layout.dualLayoutDirection;
  return layout.labelRotation === 90 ? 'stacked' : 'side-by-side';
}
