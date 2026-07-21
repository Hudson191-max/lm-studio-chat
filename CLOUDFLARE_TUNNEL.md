# Cloudflare Tunnel — Remote Access Guide

This guide explains how to expose your local LM Studio Chat instance to the internet using **Cloudflare Tunnel** (formerly Argo Tunnel). With this setup, you can access your chat UI from anywhere using a custom domain — no port forwarding, no public IP, no VPN required.

---

## Quick Comparison

| Method | URL | Persistent? | Custom Domain? | Setup Effort |
|--------|-----|-------------|----------------|--------------|
| Quick tunnel (`cloudflared tunnel --url`) | `https://xxx.trycloudflare.com` | No — changes every restart | No | One command |
| **Named tunnel** | `https://your-domain.com` | Yes — permanent | Yes | ~10 min setup |

The quick tunnel is great for testing. For a permanent setup with a custom domain (e.g. `chat.yourdomain.com`), follow the Named Tunnel guide below.

---

## Prerequisites

- A [Cloudflare](https://dash.cloudflare.com/) account (free tier works)
- A domain name added to your Cloudflare account (you can register one through Cloudflare or transfer an existing domain)
- Your LM Studio Chat app running locally (default: `http://localhost:3000`)
- [cloudflared](https://github.com/cloudflare/cloudflared/releases) installed on your machine

---

## Step 1: Install cloudflared

### Windows

```powershell
winget install Cloudflare.cloudflared
```

Or download the latest `.msi` installer from the [releases page](https://github.com/cloudflare/cloudflared/releases).

### macOS

```bash
brew install cloudflared
```

### Linux (Debian/Ubuntu)

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

Verify the installation:

```bash
cloudflared --version
```

---

## Step 2: Authenticate cloudflared

Log in to your Cloudflare account from the CLI. This grants `cloudflared` permission to create and manage tunnels on your account.

```bash
cloudflared tunnel login
```

A browser window will open asking you to select a domain. **Choose the domain you want to use for your chat UI** (e.g. `yourdomain.com`). After approving, `cloudflared` saves a certificate file to your machine.

---

## Step 3: Create a Named Tunnel

Run the following command to create a new tunnel. Replace `lm-studio-chat` with whatever name you like:

```bash
cloudflared tunnel create lm-studio-chat
```

Cloudflare will respond with a tunnel ID and generate a credentials file, typically saved at:

- **Windows**: `%USERPROFILE%\.cloudflared\<tunnel-id>.json`
- **macOS/Linux**: `~/.cloudflared/<tunnel-id>.json`

**Important:** Keep this credentials file safe — it grants access to manage your tunnel.

---

## Step 4: Configure the Tunnel

Create or edit the cloudflared configuration file:

- **Windows**: `%USERPROFILE%\.cloudflared\config.yml`
- **macOS/Linux**: `~/.cloudflared/config.yml`

```yaml
tunnel: <YOUR-TUNNEL-ID>
credentials-file: <PATH-TO-CREDENTIALS-FILE>

ingress:
  - hostname: chat.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

Replace:
- `<YOUR-TUNNEL-ID>` with the tunnel ID from Step 3
- `<PATH-TO-CREDENTIALS-FILE>` with the full path to the `.json` credentials file
- `chat.yourdomain.com` with your desired subdomain
- `3000` with the port your app runs on (if different)

> **Note:** The last ingress rule (`- service: http_status:404`) is required as a catch-all. All traffic that doesn't match a hostname rule will get a 404.

### Multiple services (optional)

If you also want to expose LM Studio's API itself (e.g. for other apps), you can add another ingress rule:

```yaml
ingress:
  - hostname: chat.yourdomain.com
    service: http://localhost:3000
  - hostname: api.yourdomain.com
    service: http://localhost:1234
  - service: http_status:404
```

---

## Step 5: Create a DNS Record

Cloudflare Tunnel needs a DNS CNAME record pointing your subdomain to the tunnel. Run:

```bash
cloudflared tunnel route dns lm-studio-chat chat.yourdomain.com
```

This automatically creates a CNAME record in your Cloudflare DNS:

```
chat.yourdomain.com → <tunnel-id>.cfargotunnel.com
```

> Alternatively, you can create this record manually in the Cloudflare dashboard under **DNS > Records**:
> - Type: `CNAME`
> - Name: `chat`
> - Target: `<tunnel-id>.cfargotunnel.com`
> - Proxy status: Proxied (orange cloud)

---

## Step 6: Start the Tunnel

Run the tunnel using your config file:

```bash
cloudflared tunnel run lm-studio-chat
```

Your tunnel is now live. Visit `https://chat.yourdomain.com` from any device to access your LM Studio Chat instance.

---

## Step 7: Run on Startup (Recommended)

To keep the tunnel running permanently, set it up as a system service.

### Windows — Task Scheduler

1. Open **Task Scheduler**
2. Click **Create Task** (not Basic Task)
3. **General tab**: Name it "Cloudflare Tunnel", check "Run whether user is logged on or not"
4. **Triggers tab**: Add "At startup"
5. **Actions tab**: Add action "Start a program":
   - Program: `cloudflared.exe` (full path, e.g. `C:\Program Files (x86)\cloudflared\cloudflared.exe`)
   - Arguments: `tunnel run lm-studio-chat`
6. **Conditions tab**: Uncheck "Start only if on AC power"
7. Click **OK** and enter your Windows password when prompted

### Linux — systemd

Create a systemd service file:

```bash
sudo nano /etc/systemd/system/cloudflared.service
```

```ini
[Unit]
Description=Cloudflare Tunnel (lm-studio-chat)
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/cloudflared tunnel run lm-studio-chat
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start it:

```bash
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

Check the status:

```bash
sudo systemctl status cloudflared
```

### macOS — launchd

Create a plist file at `~/Library/LaunchAgents/com.cloudflare.cloudflared.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cloudflare.cloudflared</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/cloudflared</string>
        <string>tunnel</string>
        <string>run</string>
        <string>lm-studio-chat</string>
    </array>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

Load it:

```bash
launchctl load ~/Library/LaunchAgents/com.cloudflare.cloudflared.plist
```

---

## Security Best Practices

### Add Cloudflare Access (Optional but Recommended)

You can add an additional authentication layer on top of your app using [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/applications/):

1. Go to **Cloudflare Zero Trust** > **Access** > **Applications**
2. Click **Add an application** > **Self-hosted**
3. Set the application domain to `chat.yourdomain.com`
4. Configure a policy (e.g. allow only your email, or allow anyone with a Cloudflare account)
5. Save — visitors will now be prompted to authenticate before reaching your chat UI

This works alongside the app's built-in NextAuth login for defense in depth.

### TLS / HTTPS

Cloudflare Tunnel automatically provides HTTPS. Your traffic between the browser and Cloudflare is encrypted, and the tunnel itself uses TLS. You don't need to manage any SSL certificates.

### Restrict Access to Your Network

If you only want access from certain IPs or countries, you can configure this in the Cloudflare dashboard under **Security** > **WAF** or by using Cloudflare Access policies.

---

## Troubleshooting

### Tunnel connects but page won't load

- Make sure your LM Studio Chat app is running on the port specified in the config (default `3000`)
- Check the app logs for errors: `npm run dev` or check `server.log`
- Verify the service URL in `config.yml` matches your app's port

### DNS not resolving

- Run `cloudflared tunnel route dns lm-studio-chat chat.yourdomain.com` again
- Check in the Cloudflare dashboard that the CNAME record exists and is proxied (orange cloud)

### "502 Bad Gateway" from Cloudflare

- This means the tunnel is up but can't reach your local service
- Confirm the app is actually listening on the configured port
- On Windows, check if a firewall is blocking the connection

### Tunnel keeps disconnecting

- Set up the startup service (Step 7) so it auto-reconnects
- Check `cloudflared` logs: `cloudflared tunnel run lm-studio-chat -v`

### Want to expose multiple apps on the same domain?

Use path-based routing in your ingress rules:

```yaml
ingress:
  - hostname: chat.yourdomain.com
    service: http://localhost:3000
  - hostname: chat.yourdomain.com
    path: /api/*
    service: http://localhost:3000
  - service: http_status:404
```

Or use different subdomains (see the "Multiple services" example in Step 4).

---

## Getting a Free Domain

You need a domain name to use a named Cloudflare Tunnel with a custom domain. Here are the options, from easiest to most involved:

### Option 1: Free Subdomain Services

| Service | Domain Format | Cost | Approval Time | Notes |
|---------|--------------|------|---------------|-------|
| [eu.org](https://nic.eu.org/) | `yourname.eu.org` | Free | Days to weeks | Classic free domain, very popular, can be slow to approve |
| [pp.ua](https://pp.ua/) | `yourname.pp.ua` | Free | Instant to days | Ukrainian free domain, reliable |
| [US.KG](https://nic.us.kg/) | `yourname.us.kg` | Free | Instant | Free subdomains, quick registration |
| [Afraid.org](https://freedns.afraid.org/) | `yourname.mooo.com` and 100+ others | Free | Instant | Huge selection of free subdomains |

### Option 2: Cheap Domains (Recommended)

If you want a proper `.com`, `.net`, or `.dev` domain without paying full price:

- **Cloudflare Registrar** — Cloudflare sells domains at wholesale cost (no markup). A `.com` is ~$10/year, `.dev` ~$12/year, `.xyz` ~$2/year. If you already use Cloudflare for the tunnel, managing everything in one dashboard is convenient.
- **Namecheap** — Often has $1-5 first-year promos for `.xyz`, `.site`, `.online`, `.store`
- **Porkbun** — Transparent pricing, `.xyz` from ~$2/year, good privacy

### Option 3: Quick Tunnel (No Domain Needed)

If you just want to test remotely without buying anything:

```bash
cloudflared tunnel --url http://localhost:3000
```

This gives you a random `https://something.trycloudflare.com` URL instantly. It changes every time you restart, but it's free and requires no setup at all.

### Recommended Path

1. **Just testing?** Use the quick tunnel (no domain needed)
2. **Want it permanent for free?** Register a `yourname.eu.org` or `yourname.pp.ua` domain, then follow the Named Tunnel guide above
3. **Want a real domain cheap?** Buy a `.xyz` for ~$2/year on Cloudflare Registrar, then follow the Named Tunnel guide

---

## Quick Tunnel (For Temporary Testing)

If you just need temporary access without setting up a custom domain, you can use a quick tunnel:

```bash
cloudflared tunnel --url http://localhost:3000
```

This will output a random `https://xxx-xxx-xxx.trycloudflare.com` URL that you can use immediately. **This URL changes every time you restart the tunnel** and is not suitable for permanent setups, but it's perfect for quick demos or testing from your phone.

---

## Summary

| What | Command / Action |
|------|-----------------|
| Install | `winget install Cloudflare.cloudflared` (or brew/apt) |
| Login | `cloudflared tunnel login` |
| Create tunnel | `cloudflared tunnel create lm-studio-chat` |
| Configure | Edit `~/.cloudflared/config.yml` |
| DNS | `cloudflared tunnel route dns lm-studio-chat chat.yourdomain.com` |
| Run | `cloudflared tunnel run lm-studio-chat` |
| Auto-start | Set up Task Scheduler / systemd / launchd |
