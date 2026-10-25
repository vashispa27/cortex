//! Best-effort credential and financial-identifier redaction for model requests.
use super::*;

fn luhn(value: &str) -> bool {
    let digits: Vec<u32> = value.chars().filter_map(|c| c.to_digit(10)).collect();
    if !(13..=19).contains(&digits.len()) {
        return false;
    }
    let sum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, d)| {
            if i % 2 == 1 {
                let n = d * 2;
                if n > 9 {
                    n - 9
                } else {
                    n
                }
            } else {
                *d
            }
        })
        .sum();
    sum % 10 == 0
}

pub fn redact_sensitive(text: &str) -> Result<String> {
    let mut s = text.to_owned();
    let patterns = [
        (
            r"(?s)-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
            "[SECRET]",
        ),
        (
            r"(?i)\b(?:sk-|gh[pousr]_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_\-]{12,}\b",
            "[SECRET]",
        ),
        (r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+", "Bearer [SECRET]"),
        (
            r"(?i)([a-z][a-z0-9+.-]*://)[^/@\s:]+:[^/@\s]+@",
            "${1}[SECRET]@",
        ),
        (
            r#"(?i)\b((?:[a-z0-9]+[_-])*(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|passwd|pwd|secret)["']?\s*[:=]\s*)"[^"\n]*""#,
            "${1}[SECRET]",
        ),
        (
            r#"(?i)\b((?:[a-z0-9]+[_-])*(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|passwd|pwd|secret)["']?\s*[:=]\s*)'[^'\n]*'"#,
            "${1}[SECRET]",
        ),
        (
            r#"(?i)\b((?:[a-z0-9]+[_-])*(?:api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|password|passwd|pwd|secret|cvv|cvc|pin)["']?\s*[:=]\s*["']?)[^\r\n"'&,;]+"#,
            "${1}[SECRET]",
        ),
        (
            r"(?i)\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]){11,30}\b",
            "[FINANCIAL_ID]",
        ),
        (
            r#"(?i)\b((?:(?:bank\s+account(?:\s+(?:number|no\.?|#))?|account\s+(?:number|no\.?|#))|routing(?:\s+(?:number|no\.?|#))?|sort\s+code|bank\s+transfer\s+reference|transaction\s+(?:reference|id)|ifsc|iban|swift(?:\s+code)?|(?:credit\s+|debit\s+)?card(?:\s+(?:number|no\.?|#))?)\s*["']?\s*[:=#-]\s*["']?)[A-Z0-9][A-Z0-9 -]*[A-Z0-9]"#,
            "${1}[FINANCIAL_ID]",
        ),
    ];
    static COMPILED: std::sync::OnceLock<Vec<Regex>> = std::sync::OnceLock::new();
    let compiled = COMPILED.get_or_init(|| {
        patterns
            .iter()
            .map(|(pattern, _)| Regex::new(pattern).expect("valid redaction pattern"))
            .collect()
    });
    for (regex, (_, replacement)) in compiled.iter().zip(patterns) {
        s = regex.replace_all(&s, replacement).into_owned();
    }
    // Currency amounts and explicitly labelled income/balance amounts are financial data.
    let amounts = [
        r"(?i)(?:[$€£₹¥]\s*\d[\d,]*(?:\.\d{1,2})?|\b(?:USD|EUR|GBP|INR|CAD|AUD)\s*\d[\d,]*(?:\.\d{1,2})?)",
        r"(?i)\b\d[\d,]*(?:\.\d{1,2})?\s*(?:USD|EUR|GBP|INR|CAD|AUD|dollars?|euros?|pounds?|rupees?)\b",
        r"(?i)\b(?:salary|wages?|income|rent|budget|balance|deposit|payment|revenue|profit)\s*(?:[:=]|is|was|of|at)\s*\d[\d,]*(?:\.\d{1,2})?",
    ];
    static AMOUNTS: std::sync::OnceLock<Vec<Regex>> = std::sync::OnceLock::new();
    for regex in AMOUNTS.get_or_init(|| {
        amounts
            .iter()
            .map(|p| Regex::new(p).expect("valid amount pattern"))
            .collect()
    }) {
        s = regex.replace_all(&s, "[FINANCIAL_AMOUNT]").into_owned();
    }
    static CARDS: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    s = CARDS
        .get_or_init(|| Regex::new(r"\b(?:\d[ -]?){13,19}\b").unwrap())
        .replace_all(&s, |c: &regex::Captures| {
            if luhn(&c[0]) {
                "[PAYMENT_CARD]".to_owned()
            } else {
                c[0].to_owned()
            }
        })
        .into_owned();
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn masks_credentials_and_financial_identifiers() {
        let input = "password: hunter2\npassword: \"two secret words\"\napi_key=supersecretkey123\nAuthorization: Bearer abcdefghijklmnop\ncard: 4111 1111 1111 1111\nAccount number: 12345678\nBank transfer reference: HP-4471-2026\nIBAN: GB82 WEST 1234 5698 7654 32\nSalary: 85000\nCost: $2,050\nFee: 3200 euros\nAccount: alice@example.com\nContact: alice@example.com +1 212 555 0134 on 2026-10-14";
        let redacted = redact_sensitive(input).unwrap();
        for secret in [
            "hunter2",
            "two secret words",
            "supersecretkey123",
            "abcdefghijklmnop",
            "4111 1111 1111 1111",
            "12345678",
            "HP-4471-2026",
            "GB82 WEST 1234 5698 7654 32",
            "85000",
            "$2,050",
            "3200 euros",
        ] {
            assert!(
                !redacted.contains(secret),
                "not masked: {secret}: {redacted}"
            );
        }
        for visible in [
            "Account: alice@example.com",
            "+1 212 555 0134",
            "2026-10-14",
        ] {
            assert!(
                redacted.contains(visible),
                "not preserved: {visible}: {redacted}"
            );
        }
    }
}
