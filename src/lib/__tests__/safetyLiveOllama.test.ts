import { describe, it, expect } from 'vitest';
import { classifyProductSafety } from '../safetyClassifier';

const runLive = process.env.RUN_LIVE_OLLAMA_TESTS === '1';

describe.skipIf(!runLive)('Live Ollama Safety Classification (qwen3:4b)', () => {
  it('classifies Maxymova Mini Wax Heater -> DEP_OHRIVAC', async () => {
    const res = await classifyProductSafety({
      name: 'Maxymova Mini Wax Heater',
      description: 'Elektrický přístroj na rozehřátí vosku.',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.code).toBe('DEP_OHRIVAC');
      expect(res.mode).toBe('Ověřit konkrétní výrobek');
    }
  }, 30000);

  it('classifies Brow Wax -> BROW_STYL', async () => {
    const res = await classifyProductSafety({
      name: 'Brow Wax',
      description: 'Stylingový vosk pro fixaci chloupků.',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.code).toBe('BROW_STYL');
      expect(res.mode).toBe('Návrh ke schválení');
    }
  }, 30000);

  it('classifies Wax Equipment Cleaner -> DEP_CISTIC', async () => {
    const res = await classifyProductSafety({
      name: 'Wax Equipment Cleaner',
      description: 'Čištění vybavení od vosku.',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.code).toBe('DEP_CISTIC');
      expect(res.mode).toBe('Ověřit konkrétní výrobek');
    }
  }, 30000);

  it('classifies Hydratační sérum pro běžné salonní ošetření -> KOS_PROCEDURA', async () => {
    const res = await classifyProductSafety({
      name: 'Hydratační sérum',
      description: 'Hydratační sérum pro běžné salonní ošetření.',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.code).toBe('KOS_PROCEDURA');
      expect(res.mode).toBe('Návrh ke schválení');
    }
  }, 30000);

  it('classifies Monoi Professional 800 g without description -> NEURCENO', async () => {
    const res = await classifyProductSafety({
      name: 'Monoi Professional 800 g',
      description: '',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.code).toBe('NEURCENO');
      expect(res.mode).toBe('Ruční posouzení');
      expect(res.safetyText).toBe('');
      expect(res.categories.length).toBe(45);
    }
  }, 30000);

  it('classifies natáčky na lash lifting without description -> LASH_NAT', async () => {
    const res = await classifyProductSafety({
      name: 'Maxymova MIMI natáčky na lash lifting – 7 párů',
      description: '',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.code).toBe('LASH_NAT');
      expect(res.mode).toBe('Návrh ke schválení');
      expect(res.safetyText).toContain('Před přiložením na víčko zkontrolujte čistotu a neporušenost natáčky.');
    }
  }, 30000);
});

