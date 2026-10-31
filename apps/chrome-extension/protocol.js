// protocol.json is generated from the canonical agent-api resource; tests verify byte equality.
let schema;
export const ready = fetch(chrome.runtime.getURL('protocol.json')).then(response => response.json()).then(value => {schema=value;});
export function validateAction(value) {
  const rule = schema?.oneOf.find(item => item.properties.action.const === value?.action);
  if (!rule || typeof value !== 'object' || Array.isArray(value)) return false;
  if (rule.required.some(key => !(key in value))) return false;
  if (rule.anyOf && !rule.anyOf.some(part => part.required.every(key => key in value))) return false;
  return Object.entries(value).every(([key, item]) => {
    const property = rule.properties[key];
    if (!property) return false;
    if (property.const !== undefined && item !== property.const) return false;
    if (property.enum && !property.enum.includes(item)) return false;
    if (property.pattern && (typeof item !== 'string' || !new RegExp(property.pattern).test(item))) return false;
    if (property.type === 'string' && (typeof item !== 'string' || item.length < (property.minLength || 0) || item.length > property.maxLength)) return false;
    if (property.type === 'boolean' && typeof item !== 'boolean') return false;
    if (property.type === 'integer' && (!Number.isInteger(item) || item < property.minimum || item > property.maximum)) return false;
    return true;
  });
}
