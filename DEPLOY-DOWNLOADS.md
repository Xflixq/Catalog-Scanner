# Host downloads at dtmsuite.xflixq.com/downloads

## 1) Build installers (Windows)

```powershell
pnpm install
pnpm master:app
pnpm master:msi
pnpm android:apk
```

Files land in:
`artifacts/master-server/dist/downloads/`
- `DTMInventorySetup.msi`
- `DTMInventoryMaster.msi`
- `DTMInventory.apk`

## 2) Run downloads portal on your server

```bash
# copy portal + downloads folder to server
export DOWNLOADS_DIR=/var/www/dtmsuite/downloads
export BASE_PATH=/downloads
export PORT=47880
node artifacts/downloads-portal/server.mjs
```

## 3) Reverse proxy (Caddy/Nginx) example

Nginx:
```nginx
location /downloads/ {
  proxy_pass http://127.0.0.1:47880/downloads/;
  proxy_set_header Host $host;
}
```

Caddy:
```
dtmsuite.xflixq.com {
  handle_path /downloads/* {
    reverse_proxy 127.0.0.1:47880
  }
}
```
If using `handle_path`, set `BASE_PATH=` empty and mount portal at `/`.
Or keep `BASE_PATH=/downloads` and proxy without stripping.

## 4) GitHub Releases (mirror)

Tag and push:
```bash
git tag v1.3.2
git push origin v1.3.2
```
GitHub Actions builds Windows MSI and attaches them to the release.

Or locally after build:
```bash
gh release create v1.3.2 artifacts/master-server/dist/downloads/*.msi artifacts/master-server/dist/downloads/*.apk
```
