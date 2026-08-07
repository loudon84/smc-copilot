# PDF Parsing Tools for contact_to_order

## Installed tools (checked during 2026-06-02 session)

| Tool | Found? | Install command |
|------|--------|------|
| pdftotext (Poppler) | No | `apt install poppler-utils` / `brew install poppler` / `choco install poppler` |
| pdfplumber (Python) | No (in terminal) | `pip install pdfplumber` |
| PyMuPDF (fitz) | Unknown | `pip install PyMuPDF` |
| pypdf (Pure Python) | Likely available | `pip install pypdf` (fallback for simple PDFs without complex forms) |

## ⚠️ Critical: `execute_code` sandbox limitations

The `execute_code` tool runs in an isolated Python sandbox that **does NOT** have third-party PDF parsing libraries installed (pdfplumber, PyMuPDF, python-docx, etc.). Never import them inside `execute_code` — always use `terminal` for PDF/Office text extraction.

## ✅ Recommended fallback chain

When primary tools are missing, use this priority:
1. `pdftotext` (fastest, most reliable)
2. `pdfplumber` (good for complex layouts)
3. `PyMuPDF` (fast, good for scanned PDFs with OCR)
4. `pypdf` (pure Python, fallback — limited layout preservation)

## 🔧 One-line installation (Windows/WSL/Linux)

```bash
# Linux/macOS
pip install pdfplumber PyMuPDF pypdf
apt install poppler-utils   # or: brew install poppler

# Windows (Chocolatey)
choco install poppler

# Windows (pip only — slower but works for most PDFs)
pip install pdfplumber pypdf -q
```

## 📝 Debugging checklist

When PDF text extraction fails inside `extract_text.py`:

1. Check tool availability:
   ```bash
   which pdftotext && pdftotext -v
   python -c "import pdfplumber" && echo "OK"
   ```
2. If all tools missing and pip unavailable (`pip` binary is corrupted), try `python -m pip install pdfplumber`.
3. For encrypted/scan PDFs, `pdftotext` may return empty — use PyMuPDF with OCR (`pip install pymupdf[ocr]`).
