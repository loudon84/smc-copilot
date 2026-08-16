# Connect this Windows PC to Lab OPSI (`192.168.102.104`)

Operator-attended. Do not commit passwords.

## Preflight (already verified on ITBJB0676)

- TCP `192.168.102.104:4447` = reachable
- Server = `opsiconfd 4.3.56.11` (`X-opsi-server-role: configserver`)
- Public installer = `https://192.168.102.104:4447/public/opsi-client-agent/opsi-client-agent-installer.exe`
- Local `opsiclientd` was **not** installed before connect

## Enroll this PC as OPSI client

1. Open **elevated** PowerShell.
2. Set an `opsiadmin` account (first enrollment):

```powershell
$env:OPSI_SERVICE_ADDRESS = "https://192.168.102.104:4447"
$env:OPSI_SERVICE_USERNAME = "<opsiadmin-user>"
$env:OPSI_SERVICE_PASSWORD = "<password>"
# optional: $env:OPSI_CLIENT_ID = "itbjb0676.example"
powershell -NoProfile -ExecutionPolicy Bypass -File E:\git\smc-copilot\scripts\opsi-connect-lab-client.ps1
```

3. Confirm service:

```powershell
Get-Service opsiclientd
```

4. On the OPSI server / Management UI, confirm host `itbjb0676…` appears and is online.

## Point opsi-control (lab) at the same server

```powershell
cd E:\git\smc-copilot\services\opsi-control
Copy-Item .env.example .env
# edit .env: opsi_rpc_username / opsi_rpc_password
$env:SMC_OPSI_ENV = "lab"
uv run uvicorn main:app --app-dir src --host 127.0.0.1 --port 8787
```

`GET http://127.0.0.1:8787/ready` should show OPSI RPC healthy once credentials are valid.

## Notes

- Installer TLS uses the Lab server cert; script downloads with `curl -k` for Lab only.
- Do not put `opsi_rpc_password` into production settings files; production must use `opsi_rpc_password_ref` + Secret Provider.
- This does **not** mark v1.1/v1.2 Live Evidence as `proven`.
