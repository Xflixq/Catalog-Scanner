# Catalog Scanner Master

Native desktop Master app + local pairing API.

## Design

Black / white only:

- bg `#FFFFFF`
- fg `#000000`
- border `#262626`
- soft `#F2F2F2`
- radius `14`
- primary button: black fill, white text; hover invert

## Run

```bash
pnpm master:dev   # Master GUI
pnpm setup:dev    # Setup GUI (product installer)
pnpm master:api   # headless API only
```

## Build

```bash
pnpm master:build
pnpm master:setup
```

Outputs under `artifacts/master-server/dist/installer/`.
