# Test fixtures

`gateway-live-20261012.cjs.fixture` is the gateway bundle that was running on the OVH VPS on 13 October 2026
(`/opt/vidfetch/releases/ovh-20261012-rnllrb69-ipv4/vidfetch-gateway.cjs`, built on 12 October at 16:17, before the
first OVH commit). It is in no commit of the repository, which is why it is kept here: the gateway upgrade test
starts from exactly this file.

- SHA-256: `a703f269641fc6c38fce74d4e7ff7f47ef5fe54a64b3e104dbab2082481dc1d5`
- It contains project code only; no key, secret or environment value.
- Compared with the gateway of `main` it lacks `/auth/deployment`, drain support and the translated download helper.
- The `.fixture` extension keeps linters and bundlers away from it. Do not edit it.

`promote-88fbe237.py.fixture` is the CI promoter helper installed on the OVH VPS on 14 October 2026
(`/usr/local/libexec/vidfetch-ci/promote.py`), i.e. `deploy/ovh/ci/promote.py` of commit `88fbe237`, byte for byte. It
predates every CI profile, so its `status` has no `profile` field; `public-launch.test.sh` installs it as the helper that
`09-ci-helper.sh install` replaces and `rollback` restores.

- SHA-256: `d977b793313773f70a9984791fb35f7efe49e7f36dac820e168b13854f4683c5` (the hash read on the VPS).
- Project code only; no key or secret. Do not edit it.
