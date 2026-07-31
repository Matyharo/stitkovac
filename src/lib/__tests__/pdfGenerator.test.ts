import { describe, it, expect } from 'vitest';

/**
 * Grid calculation helper for A4 3x7 label layouts (e.g. Avery L7160 63.5 x 38.1 mm).
 */
export function calculateGridPosition(index: number, cols: number = 3) {
  const row = Math.floor(index / cols);
  const col = index % cols;
  return { row, col };
}

/**
 * Calculates start index (0-based) from 1-based user input.
 */
export function getStartIndex(startPosition: number, totalSlots: number = 21): number {
  const clamped = Math.max(1, Math.min(startPosition, totalSlots));
  return clamped - 1;
}

describe('A4 Label Grid & Page Calculations', () => {
  it('correctly maps 1-based start position to grid row and column', () => {
    // Position 1 -> row 0, col 0
    expect(calculateGridPosition(getStartIndex(1))).toEqual({ row: 0, col: 0 });
    // Position 4 -> row 1, col 0 (second row, first column on 3-col grid)
    expect(calculateGridPosition(getStartIndex(4))).toEqual({ row: 1, col: 0 });
    // Position 21 -> row 6, col 2 (last slot on 3x7 page)
    expect(calculateGridPosition(getStartIndex(21))).toEqual({ row: 6, col: 2 });
  });

  it('clamps start position outside valid range [1..21]', () => {
    expect(getStartIndex(0)).toBe(0); // clamps to pos 1 (index 0)
    expect(getStartIndex(99)).toBe(20); // clamps to pos 21 (index 20)
  });

  it('calculates page count correctly for single and multi-page print jobs', () => {
    const labelsPerPage = 21;
    
    // 5 labels starting at pos 1 -> 1 page
    const totalSlots1 = getStartIndex(1) + 5;
    const pages1 = Math.ceil(totalSlots1 / labelsPerPage);
    expect(pages1).toBe(1);

    // 20 labels starting at pos 5 -> index 4 + 20 = 24 slots -> 2 pages
    const totalSlots2 = getStartIndex(5) + 20;
    const pages2 = Math.ceil(totalSlots2 / labelsPerPage);
    expect(pages2).toBe(2);
  });
});
