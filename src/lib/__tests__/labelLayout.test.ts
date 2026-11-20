import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { getDualLayoutDirection } from '../labelLayout';
import { generateLabelsPdf, detectSafetyTextOverflows, setRobotoFontBytesCache } from '../pdfGenerator';

beforeAll(() => setRobotoFontBytesCache(readFileSync('public/fonts/Roboto-Regular.ttf'), readFileSync('public/fonts/Roboto-Bold.ttf')));
const item = { id: 'test', sku: 'test', name: 'Čisticí krém', quantity: 1 };
const base = { labelWidth: 63.5, labelHeight: 38.1, topMargin: 15.15, leftMargin: 7.25, horizontalGap: 2.5, verticalGap: 0, columns: 3, rows: 7, dualLayout: true, labelRotation: 0 };
function template(layout: object) { return { fieldsConfig: JSON.stringify({ showName: true }), fontConfig: JSON.stringify({ nameFontSize: 7 }), layoutConfig: JSON.stringify({ ...base, ...layout }) }; }
async function operators(layout: object) {
  const doc = await PDFDocument.load(await generateLabelsPdf([item], template(layout), 1));
  const contents = doc.getPages()[0].node.Contents() as PDFArray;
  return Array.from({ length: contents.size() }, (_, i) => Buffer.from(decodePDFRawStream(doc.context.lookup(contents.get(i)) as PDFRawStream).decode()).toString()).join('\n');
}
describe('double label layout directions', () => {
  it('keeps both legacy orientations unchanged', () => {
    expect(getDualLayoutDirection({})).toBe('side-by-side');
    expect(getDualLayoutDirection({ labelRotation: 90 })).toBe('stacked');
    expect(getDualLayoutDirection({ dualLayoutDirection: 'invalid' })).toBe('side-by-side');
  });
  it.each([0, 90])('prints two copies with a horizontal divider in the visual drawing space at rotation %s', async labelRotation => {
    const text = await operators({ labelRotation, dualLayoutDirection: 'stacked' });
    expect((text.match(/ Tj/g) || []).length).toBe(2);
    const lines = [...text.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l\nS/g)];
    expect(lines.some(m => m[2] === m[4] && m[1] !== m[3])).toBe(true);
  });
  it.each([0, 90])('prints side-by-side copies with a vertical divider at rotation %s', async labelRotation => {
    const text = await operators({ labelRotation, dualLayoutDirection: 'side-by-side' });
    expect((text.match(/ Tj/g) || []).length).toBe(2);
    const lines = [...text.matchAll(/([\d.]+) ([\d.]+) m\n([\d.]+) ([\d.]+) l\nS/g)];
    expect(lines.some(m => m[1] === m[3] && m[2] !== m[4])).toBe(true);
  });
  it('measures available half-height and warns when a stacked copy cannot fit', async () => {
    const normal = template({ labelHeight: 10, dualLayout: false });
    const stacked = template({ labelHeight: 10, dualLayout: true, dualLayoutDirection: 'stacked' });
    expect(await detectSafetyTextOverflows([item], normal)).toHaveLength(0);
    expect(await detectSafetyTextOverflows([item], stacked)).toHaveLength(1);
  });
});
