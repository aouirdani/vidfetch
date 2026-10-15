"""public-dl-ingress.py: the live tester ingress becomes the public-download one with exactly the intended changes."""
import difflib
import importlib.util
import ipaddress
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

root = Path(__file__).parents[3]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


render = load('render_ingress', root / 'deploy/ovh/media/render-ingress.py')
tool = load('public_dl_ingress', root / 'deploy/ovh/media/public-dl-ingress.py')
ranges = json.loads((root / 'deploy/ovh/public-test/cloudflare-ranges.json').read_text())['ranges']


def open80(testers=('203.0.113.9/32',)):
    return render.render([ipaddress.ip_network(t) for t in testers], ranges['4'], ranges['6'], True)


class PublicDlIngress(unittest.TestCase):
    def test_exact_changes(self):
        before = open80()
        after = tool.transform(before)
        diff = [line for line in difflib.ndiff(before.splitlines(), after.splitlines()) if line[:2] in ('- ', '+ ')]
        removed = [line[2:] for line in diff if line.startswith('- ')]
        added = [line[2:].strip() for line in diff if line.startswith('+ ')]
        self.assertEqual(removed, ['        tcp dport 443 ip saddr @testers4 accept'])
        self.assertIn('tcp dport 443 ct state new add @dl_conn4 { ip saddr ct count over 32 } reject with tcp reset', added)
        self.assertIn('tcp dport 443 ct state new update @dl_rate4 { ip saddr limit rate over 120/minute burst 60 packets } reject with tcp reset', added)
        self.assertIn('meta nfproto ipv4 tcp dport 443 accept', added)
        # nothing else moves: SSH, loopback, established, internal ports, port 80, Cloudflare, the tester set, the end
        for kept in ('tcp dport 22 accept', 'iifname "lo" accept', 'ct state established,related accept',
                     'tcp dport { 3000, 3001, 8788, 8789 } reject with tcp reset', 'tcp dport 80 accept',
                     'tcp dport { 80, 443 } ip saddr @cloudflare4 accept', 'tcp dport { 80, 443 } ip6 saddr @cloudflare6 accept',
                     'tcp dport { 80, 443 } reject with tcp reset', 'udp dport 443 drop', 'set testers4 {', 'elements = { 203.0.113.9/32 }'):
            self.assertIn(kept, after)
        # the limits come after Cloudflare (the apex is never limited) and before the final refusal
        order = [after.index(x) for x in ('ip6 saddr @cloudflare6 accept', 'ct count over 32', 'limit rate over', 'meta nfproto ipv4 tcp dport 443 accept', 'tcp dport { 80, 443 } reject')]
        self.assertEqual(order, sorted(order))

    def test_refusals(self):
        public = tool.transform(open80())
        cases = {
            'already public': public,
            'closed80 (no ACME port)': render.render([ipaddress.ip_network('203.0.113.9/32')], ranges['4'], ranges['6'], False),
            'no tester rule': open80().replace(tool.TESTERS_RULE, ''),
            'two tester rules': open80().replace(tool.TESTERS_RULE, tool.TESTERS_RULE * 2),
            'another table': open80().replace('table inet vidfetch_https_test_ingress {', 'table inet other {'),
            'empty file': '',
        }
        for label, text in cases.items():
            with self.subTest(label), self.assertRaises(ValueError):
                tool.transform(text)

    def test_cli_never_overwrites_and_refuses_cleanly(self):
        with tempfile.TemporaryDirectory() as d:
            src, out = Path(d) / 'in.nft', Path(d) / 'out.nft'
            src.write_text(open80())
            ok = subprocess.run([sys.executable, str(root / 'deploy/ovh/media/public-dl-ingress.py'), str(src), str(out)], capture_output=True, text=True)
            self.assertEqual(ok.returncode, 0, ok.stderr)
            self.assertIn('dl_conn4', out.read_text())
            again = subprocess.run([sys.executable, str(root / 'deploy/ovh/media/public-dl-ingress.py'), str(src), str(out)], capture_output=True, text=True)
            self.assertNotEqual(again.returncode, 0)  # the output already exists: never overwritten
            bad = subprocess.run([sys.executable, str(root / 'deploy/ovh/media/public-dl-ingress.py'), str(out), str(Path(d) / 'x.nft')], capture_output=True, text=True)
            self.assertNotEqual(bad.returncode, 0)
            self.assertIn('REFUSED', bad.stderr)
            self.assertFalse((Path(d) / 'x.nft').exists())


if __name__ == '__main__':
    unittest.main()
