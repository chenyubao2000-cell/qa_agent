# Data Type Resolution

When a handoff entry's `uiElements[]` contains a `dataType` field, resolve it to a concrete inline value. The generated spec must NOT import any factory or utility — all values are hardcoded literals. Append `Date.now()` where applicable to prevent parallel test collisions.

## Resolution Rules

For each `uiElement` with `dataType` set:
1. Look up `dataType` + `dataVariant` in the mapping table below
2. Generate a concrete value following the generation rule
3. Write the value directly into the spec as a string/number literal
4. If `dataType` is absent, fall back to the `value` field as before

## Mapping Table

| dataType | dataVariant | Generation Rule | Example Output |
|----------|-------------|-----------------|----------------|
| `contact.mobile` | `valid` | `"1" + random(38/39/50/51/52/58/59/80/81/82) + 8 random digits` | `"13856781234"` |
| `contact.mobile` | `invalid` | Short string or letters | `"1234"` |
| `contact.email` | `valid` | `"test_" + Date.now() + "@test.com"` | `"test_1711234567890@test.com"` |
| `contact.email` | `invalid` | Missing @ or domain | `"not-an-email"` |
| `contact.address` | `valid` | `"上海市浦东新区测试路" + random(1-999) + "号"` | `"上海市浦东新区测试路42号"` |
| `contact.address` | `long:N` | N characters of repeated address text | `"上海市浦东新区测试路...（500字）"` |
| `identity.name` | `valid` | `"测试用户_" + Date.now()` | `"测试用户_1711234567890"` |
| `identity.name` | `long:N` | N characters of repeated text | `"测测测...（200字）"` |
| `identity.idCard` | `valid` | 6-digit area code + 8-digit birth date + 3-digit sequence + Luhn check digit. Must pass `∑(aᵢ × wᵢ) mod 11` | `"310101199001011234"` |
| `identity.idCard` | `invalid` | Wrong length or bad check digit | `"12345678"` |
| `account.password` | `strong` | `"Aa1@" + 8 random alphanumeric chars` | `"Aa1@xK9mPq2n"` |
| `account.password` | `weak` | Common weak password | `"123456"` |
| `account.captcha` | `valid` | 4-6 random alphanumeric chars | `"a3Kd"` |
| `account.captcha` | `invalid` | Empty string or wrong length | `""` |
| `finance.amount` | `valid` | Random decimal 0.01–99999.99, 2 decimal places | `"128.50"` |
| `finance.amount` | `boundary:0` | Zero or negative value | `"0"` or `"-1"` |
| `finance.bankCard` | `valid` | 16-digit number passing Luhn (prefix 6222/6217/4367/5187) | `"6222021234567890"` |
| `finance.bankCard` | `invalid` | Wrong length or bad Luhn | `"1234"` |
| `datetime.date` | `past` | Date within last 30 days, `YYYY-MM-DD` | `"2026-02-20"` |
| `datetime.date` | `future` | Date within next 7 days, `YYYY-MM-DD` | `"2026-03-28"` |
| `datetime.date` | `invalid` | Malformed date string | `"not-a-date"` |
| `text.random` | `valid` | 10–50 random Chinese characters | `"这是一段测试文本用于验证输入"` |
| `text.random` | `long:N` | N characters (test max-length boundary) | `"测" × N` |
| `text.random` | `xss` | XSS payload | `"<script>alert(1)</script>"` |
| `text.random` | `sqlInject` | SQL injection payload | `"'; DROP TABLE users; --"` |
| `text.random` | `emoji` | Emoji + mixed text | `"😀🎉测试Emoji✅"` |
| `text.random` | `whitespace` | Spaces, tabs, newlines | `"  \t\n  "` |
| `file.image` | `png` | Static fixture file path | `"tests/e2e/test-data/files/sample.png"` |
| `file.image` | `jpg` | Static fixture file path | `"tests/e2e/test-data/files/sample.jpg"` |
| `file.document` | `pdf` | Static fixture file path | `"tests/e2e/test-data/files/sample.pdf"` |
| `file.document` | `csv` | Static fixture file path | `"tests/e2e/test-data/files/sample.csv"` |
| `file.document` | `xlsx` | Static fixture file path | `"tests/e2e/test-data/files/sample.xlsx"` |
| `file.document` | `txt` | Static fixture file path | `"tests/e2e/test-data/files/sample.txt"` |
| `file.document` | `oversized` | Static oversized file (6MB) | `"tests/e2e/test-data/files/oversized-6mb.bin"` |
| `file.document` | `empty` | Static empty file | `"tests/e2e/test-data/files/empty.txt"` |

## File Upload Resolution

For `file.*` dataTypes, the resolved value is a file path relative to `$QA_WORKSPACE_DIR`:

```typescript
// Generated from: { "dataType": "file.image", "dataVariant": "png" }
await profilePage.uploadAvatar('tests/e2e/test-data/files/sample.png');

// Generated from: { "dataType": "file.document", "dataVariant": "oversized" }
await uploadPage.selectFile('tests/e2e/test-data/files/oversized-6mb.bin');
```

## Uniqueness Guarantee

For dataTypes that generate unique values (`contact.email`, `identity.name`, etc.), always append `Date.now()`:

```typescript
const email = `test_${Date.now()}@test.com`;
const name = `测试用户_${Date.now()}`;
```

## Fallback

If a `uiElement` has NO `dataType` (field omitted or `null`), use the `value` field directly. This maintains backward compatibility with handoff files that don't use the dataType system.
