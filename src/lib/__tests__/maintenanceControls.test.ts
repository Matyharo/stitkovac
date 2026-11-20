import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SafetyCategoryTransfer from '@/app/settings/SafetyCategoryTransfer';
import BulkSafety from '@/app/products/BulkSafety';
vi.mock('@/app/actions', () => ({ applyBulkSafetyAction: vi.fn(), previewBulkSafetyAction: vi.fn() }));

describe('compact maintenance entry points', () => {
  it('renders an enabled import entry point before a file is selected', () => {
    const html = renderToStaticMarkup(createElement(SafetyCategoryTransfer));
    const button = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]).find(markup => markup.includes('Importovat Excel'));
    expect(button).toBeTruthy();
    expect(button).not.toMatch(/<button[^>]*\sdisabled=/);
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('Potvrdit import');
  });
  it('shows bulk maintenance as one button without expanded preview or warning panel', () => {
    const html = renderToStaticMarkup(createElement(BulkSafety, { onApplied: vi.fn() }));
    expect(html).toContain('Aktualizovat bezp. texty');
    expect(html).not.toContain('<section');
    expect(html).not.toContain('<dialog');
    expect(html).not.toContain('Souhlasím s přepsáním');
  });
});
