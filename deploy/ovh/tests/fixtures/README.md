# Test fixtures

`gateway-live-20261012.cjs.fixture` is the gateway bundle that was running on the OVH VPS on 13 October 2026
(`/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4/vidfetch-gateway.cjs`, built on 12 October at 16:17, before the
first OVH commit). It is in no commit of the repository, which is why it is kept here: the gateway upgrade test
starts from exactly this file.

- SHA-256: `a703f269641fc6c38fce74d4e7ff7f47ef5fe54a64b3e104dbab2082481dc1d5`
- It contains project code only; no key, secret or environment value.
- Compared with the gateway of `main` it lacks `/auth/deployment`, drain support and the translated download helper.
- The `.fixture` extension keeps linters and bundlers away from it. Do not edit it.
