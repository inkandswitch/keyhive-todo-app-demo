# Keyhive TODO App Demo

A React app demonstrating how [keyhive](https://github.com/inkandswitch/keyhive) might be used.

## Run in standalone mode

```
pnpm install
pnpm dev:standalone
```

If it doesn't open automatically, navigate to http://localhost:5557 to see the app running.

By default, the demo connects to a sync server at `ws://localhost:3030`. This can be overriden by `SYNC_SERVER="wss://my.sync.server.url" pnpm dev:standalone`.
