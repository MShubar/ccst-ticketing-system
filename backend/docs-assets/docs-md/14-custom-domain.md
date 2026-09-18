# Custom domain — ccst.website → Azure

**Status (2026-09-12):** Live. Primary URL **https://ccst.website** (and **https://www.ccst.website**). App Service managed TLS (SNI) bound for both hostnames.

Point GoDaddy domain **ccst.website** at App Service **ccst-ticketing** (Central India).

## DNS records at GoDaddy (applied)

| Type | Name / Host | Value | TTL |
| --- | --- | --- | --- |
| **TXT** | `asuid` | `2E485BB1C32DFE16762513B4DF9BCEACF4CDB7B7A6DD589FBDFDE11D6725D429` | 1 hour |
| **A** | `@` (root) | `20.192.171.20` | 1 hour |
| **TXT** | `asuid.www` | `2E485BB1C32DFE16762513B4DF9BCEACF4CDB7B7A6DD589FBDFDE11D6725D429` | 1/2–1 hour |
| **CNAME** | `www` | `ccst-ticketing.azurewebsites.net` | 1 hour |

Notes:

- No domain forwarding. Apex uses **A**, not CNAME.
- Some resolvers cache old GoDaddy parking IPs for up to an hour — if `https://ccst.website` times out locally, try phone/cellular or `dig @8.8.8.8 ccst.website A` (expect `20.192.171.20`).

## Azure (already done)

```bash
az webapp config hostname add -g ccst-ticketing --webapp-name ccst-ticketing --hostname ccst.website
az webapp config hostname add -g ccst-ticketing --webapp-name ccst-ticketing --hostname www.ccst.website
az webapp config ssl create -g ccst-ticketing -n ccst-ticketing --hostname ccst.website
az webapp config ssl create -g ccst-ticketing -n ccst-ticketing --hostname www.ccst.website
az webapp config ssl bind -g ccst-ticketing -n ccst-ticketing --certificate-thumbprint <THUMB> --ssl-type SNI
```

HTTPS is forced (`httpsOnly`). Default host `ccst-ticketing.azurewebsites.net` still works.

## Check

```bash
dig +short ccst.website A @8.8.8.8
dig +short www.ccst.website CNAME @8.8.8.8
curl -sS https://ccst.website/api/health
curl -sS https://www.ccst.website/api/health
```

Expect A → `20.192.171.20`, www CNAME → `ccst-ticketing.azurewebsites.net`, health `"ok": true`.

## Account

GoDaddy login for this domain is the Google account **mohsen.salman099@gmail.com**. Azure remains resource group **ccst-ticketing**.
