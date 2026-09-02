# Test fixtures

## `onotest.brooklynzelenka.com.chained.onc`

An onomancy certificate binding `onotest.brooklynzelenka.com` to the document
`automerge:2nuSYdXmDNwcZG61XBXVQqjs5z1ExPDYZTsYVm9toa5Qh5iu5V`, minted by
`onomancer bind` and carrying a live DNSSEC chain fetched after the TXT record
was published.

```
sha256  4e0ff5d7cfbe36fc082978fc545a072fbc4d27e6bd6506d55882fcd020d0151c
size    3064 bytes    magic 4f 4e 43 00 (ONC\0)
```

Safe to commit and to serve: a certificate is **self-authenticating**, so where
it came from confers nothing. A hostile courier can withhold it or serve a
stale copy, never forge one. It contains no secret.

### Why a fixture is needed at all

The document it binds cannot sync. Its id is a self-certifying ed25519 key,
which ARK classifies as keyhive-protected by shape — but it was minted outside
keyhive, so no keyhive state exists for it, no relay can be granted, and no
replica ever reaches another device. See ADR-023.

So a browser wanting to exercise the certificate path has to seed the document
locally rather than receive it. That is what `seedOnotest` in
`src/devFixtures.ts` does.

### Freshness

The chain's validity window ends at unix `1788243119`. After that the same
bytes grade `stale` rather than `fresh` — correct behaviour, not a broken
artifact. Chain refresh is keyless, so anyone holding the bytes may re-attach
fresher evidence without a signing key.
