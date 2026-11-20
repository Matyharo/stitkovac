export function validateProductInput<T extends { sku: string; name: string; price?: number | null }>(value: T): T {
  if (!value || typeof value.sku !== 'string' || !value.sku.trim() || value.sku.length > 100 || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 500) throw new Error('Vyplňte platný kód a název produktu (max. 100 / 500 znaků).');
  if (value.price != null && (!Number.isFinite(value.price) || value.price < 0 || value.price > 1e9)) throw new Error('Cena musí být nezáporné konečné číslo.');
  for (const [key, field] of Object.entries(value)) if (typeof field === 'string' && field.length > (key === 'shortName' ? 120 : 12000)) throw new Error('Text produktu je příliš dlouhý.');
  return { ...value, sku: value.sku.trim(), name: value.name.trim() };
}
export function validateTemplate(fields: unknown, fonts: unknown, layout: unknown) {
  if (!fields || typeof fields !== 'object' || !fonts || typeof fonts !== 'object' || !layout || typeof layout !== 'object') throw new Error('Neplatná konfigurace šablony.');
  const l = layout as Record<string, unknown>, f = fonts as Record<string, unknown>;
  for (const key of ['labelWidth', 'labelHeight']) if (typeof l[key] !== 'number' || !Number.isFinite(l[key]) || Number(l[key]) < 5 || Number(l[key]) > (key === 'labelWidth' ? 210 : 297)) throw new Error('Neplatné rozměry štítku.');
  for (const key of ['leftMargin', 'topMargin', 'horizontalGap', 'verticalGap']) if (l[key] != null && (typeof l[key] !== 'number' || !Number.isFinite(l[key]) || Number(l[key]) < 0 || Number(l[key]) > 297)) throw new Error('Neplatný okraj nebo mezera.');
  for (const key of ['nameFontSize', 'skuFontSize', 'brandFontSize', 'priceFontSize', 'bodyFontSize']) if (f[key] != null && (typeof f[key] !== 'number' || !Number.isFinite(f[key]) || Number(f[key]) < 3 || Number(f[key]) > 72)) throw new Error('Velikost písma musí být 3 až 72 bodů.');
  if (Number(l.labelWidth) + Number(l.leftMargin || 0) > 210 || Number(l.labelHeight) + Number(l.topMargin || 0) > 297) throw new Error('Štítek přesahuje stránku A4.');
  if (JSON.stringify({ fields, fonts, layout }).length > 750000) throw new Error('Šablona nebo její obrázky jsou příliš velké.');
}
