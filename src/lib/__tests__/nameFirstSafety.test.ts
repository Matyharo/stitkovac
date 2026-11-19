import { describe, expect, it, vi } from 'vitest';
import { classifyProductSafety, buildClassifierSystemPrompt, buildNameClassifierSystemPrompt } from '../safetyClassifier';
import { loadSafetyTemplates } from '../safetyTemplates';

const response = (code: string) => ({ ok: true, status: 200, json: async () => ({ message: { content: JSON.stringify({ code }) } }) });

describe('name-first safety classification', () => {
  it('uses only the name on a confident first pass and retains exact Excel text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('DEP_OHRIVAC'));
    const result = await classifyProductSafety({ name: 'Ohřívač vosku', description: 'SECRET_DESCRIPTION_SENTINEL' }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain('Ohřívač vosku');
    expect(JSON.stringify(body)).not.toContain('SECRET_DESCRIPTION_SENTINEL');
    expect(body.options.num_predict).toBe(64);
    expect(result.ok && result.safetyText).toBe(loadSafetyTemplates().byCode.get('DEP_OHRIVAC')?.safetyText);
  });
  it('adds cleaned description only after an uncertain result', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(response('NEURCENO')).mockResolvedValueOnce(response('DEP_FILM'));
    const result = await classifyProductSafety({ name: 'Monoi 800 g', description: '<p>Samostržný vosk</p>' }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const first = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const second = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(first.messages[1].content).not.toContain('Samostržný');
    expect(second.messages[1].content).toContain('Samostržný vosk');
    expect(second.messages[1].content).not.toContain('<p>');
    expect(result.ok && result.code).toBe('DEP_FILM');
  });
  it('does not retry without a description or after a connection failure', async () => {
    const uncertain = vi.fn().mockResolvedValue(response('NEURCENO'));
    await classifyProductSafety({ name: 'Monoi', description: '<p> </p>' }, { fetchImpl: uncertain });
    expect(uncertain).toHaveBeenCalledTimes(1);
    const failed = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await classifyProductSafety({ name: 'Monoi', description: 'Vosk' }, { fetchImpl: failed });
    expect(failed).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });
  it('keeps all catalog categories in a smaller first-pass prompt', () => {
    const catalog = loadSafetyTemplates();
    const compact = buildNameClassifierSystemPrompt(catalog);
    for (const entry of catalog.templates) expect(compact).toContain(entry.code);
    expect(compact.length).toBeLessThan(buildClassifierSystemPrompt(catalog).length);
  });
});
