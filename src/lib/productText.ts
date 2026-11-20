export function isValEmpty(val: any): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === 'string' && val.trim() === '') return true;
  if (typeof val === 'number' && isNaN(val)) return true;
  return false;
}

export function getMergedValue<T>(newVal: T, existingVal: T): T {
  if (isValEmpty(newVal)) {
    return existingVal;
  }
  return newVal;
}

export function formatContactText(companyName: string, ico: string, address: string, website: string) {
  const parts = [];
  if (companyName) parts.push(companyName.trim());
  if (ico) {
    const trimmedIco = ico.trim();
    const icoStr = trimmedIco.toLowerCase().startsWith('ičo:') ? trimmedIco : `IČO: ${trimmedIco}`;
    parts.push(icoStr);
  }
  if (address) parts.push(address.trim());
  if (website) parts.push(website.trim());
  return parts.join('\n');
}

export function resolveContactTextForBrand(brand: string | null | undefined, rules: any[]) {
  const cleanBrand = (brand || '').trim().toLowerCase();
  
  const defaultRule = rules.find(r => r.isDefault);
  const brandRules = rules.filter(r => !r.isDefault && r.brandPattern.trim() !== '');
  
  for (const rule of brandRules) {
    const pattern = rule.brandPattern.trim().toLowerCase();
    if (pattern && cleanBrand.includes(pattern)) {
      const companyName = rule.companyName?.trim() || defaultRule?.companyName || '';
      const ico = rule.ico?.trim() || defaultRule?.ico || '';
      const address = rule.address?.trim() || defaultRule?.address || '';
      const website = rule.website?.trim() || defaultRule?.website || '';
      return formatContactText(companyName, ico, address, website);
    }
  }
  
  // Fallback to default rule
  if (defaultRule) {
    return formatContactText(defaultRule.companyName, defaultRule.ico, defaultRule.address, defaultRule.website);
  }
  
  // Absolute fallback
  return '';
}

export function resolveSafetyTextForBrand(brand: string | null | undefined, rules: any[]) {
  const cleanBrand = (brand || '').trim().toLowerCase();
  
  const defaultRule = rules.find(r => r.isDefault);
  const brandRules = rules.filter(r => !r.isDefault && r.brandPattern.trim() !== '');
  
  for (const rule of brandRules) {
    const pattern = rule.brandPattern.trim().toLowerCase();
    if (pattern && cleanBrand.includes(pattern)) {
      return rule.safetyText?.trim() || defaultRule?.safetyText || '';
    }
  }
  
  // Fallback to default rule
  if (defaultRule) {
    return defaultRule.safetyText || '';
  }
  
  // Absolute fallback
  return '';
}
