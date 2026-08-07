# Windows Bash pip corruption workaround

## Symptom
Running `pip install ...` in a Git-Bash / MSYS terminal on Windows produces:
```
SyntaxError: source code string cannot contain null bytes
```
`pip --version` may also fail or produce garbled output. This happens because the `pip.exe` binary was installed/compiled under a different Python distribution (e.g., official python.org installer vs. Microsoft Store variant) and has embedded null bytes that cause the syntax error.

## Fix
Always use `python -m pip` instead of bare `pip`:
```bash
python -m pip install pdfplumber pypdf -q
```

## When to check
Before any `pip install` in a Windows bash session, run:
```bash
pip --version 2>&1 | grep -i "syntax\|error" && echo "USE 'python -m pip' INSTEAD"
```
