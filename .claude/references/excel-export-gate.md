# Excel Export + Retry Gate

Export all test-case `.md` files into a single Excel workbook (one sheet per area/module).
Only executes AFTER verification gate passes.

```bash
node skills/excel-case-export/scripts/generate-excel.js \
  --input-dir $QA_WORKSPACE_DIR/test-cases/generated \
  --output $QA_WORKSPACE_DIR/test-cases/excel/{name}-all-cases.xlsx
```

Verify Excel output exists — retry once on failure:
```
if NOT Glob("$QA_WORKSPACE_DIR/test-cases/excel/{name}-all-cases.xlsx"):
  WARN: "Excel export failed — retrying..."
  node skills/excel-case-export/scripts/generate-excel.js \
    --input-dir $QA_WORKSPACE_DIR/test-cases/generated \
    --output $QA_WORKSPACE_DIR/test-cases/excel/{name}-all-cases.xlsx
  if NOT Glob("$QA_WORKSPACE_DIR/test-cases/excel/{name}-all-cases.xlsx"):
    ERROR: "Excel export failed after retry — file not written"
```

**Caller substitutes** `{name}` with the appropriate slug (e.g., `{slug}`, `{prd-name}`).
