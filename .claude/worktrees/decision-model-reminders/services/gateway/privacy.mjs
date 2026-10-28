/** Defense in depth before selected context leaves the gateway. The device redacts first. */
const patterns = [
  ['private_key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i],
  ['aws_key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['openai_or_stripe_key', /\b(?:sk-(?:proj-|live-|test-)?|sk_live_|sk_test_|pk_live_)[A-Za-z0-9_-]{12,}\b/],
  ['github_token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/],
  ['gitlab_token', /\bglpat-[A-Za-z0-9_-]{16,}\b/],
  ['slack_token', /\bxox[a-z]-[A-Za-z0-9-]{16,}\b/i],
  ['huggingface_token', /\bhf_[A-Za-z0-9]{20,}\b/],
  ['authorization_header', /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/-]{12,}={0,2}\b/i],
  ['credential_url', /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/i],
  ['credential_query', /[?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|auth[_-]?token|password|secret)=[^\s&#"']{4,}/i],
  ['credential_assignment', /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|auth[_-]?token|password|passwd|secret|private[_-]?key|authorization|_authToken)\b\s*[:=]\s*["']?[^\s,"';&}]{6,}/i],
  ['payment_identifier', /\b(?:acct|cus|card|pm)_[A-Za-z0-9]{14,}\b/]
];

function luhn(value) {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0; let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) { n *= 2; if (n > 9) n -= 9; }
    sum += n; double = !double;
  }
  return sum % 10 === 0;
}

export function sensitiveCategory(input) {
  // Scan values, not JSON keys, so benign field names cannot trigger a block.
  const values = [];
  const collect = (value) => { if (typeof value === 'string') values.push(value); else if (Array.isArray(value)) value.forEach(collect); else if (value && typeof value === 'object') Object.values(value).forEach(collect); };
  collect(input);
  for (const value of values) {
    for (const [category, regex] of patterns) if (regex.test(value)) return category;
    for (const candidate of value.match(/\b(?:\d[ -]?){13,19}\b/g) || []) if (luhn(candidate)) return 'payment_card';
  }
  return null;
}
