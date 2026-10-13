"""Media-test ingress renderer: fail closed, tester-only 443, nothing else opened."""
import importlib.util
import ipaddress
import json
from pathlib import Path
import re
import tempfile
import unittest

media = Path(__file__).parents[1] / 'media'
spec = importlib.util.spec_from_file_location('render_ingress', media / 'render-ingress.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
RANGES = json.loads((Path(__file__).parents[1] / 'public-test' / 'cloudflare-ranges.json').read_text())['ranges']
CF4 = [ipaddress.ip_network(n) for n in RANGES['4']]
# Public addresses used purely as syntax fixtures; they are NOT real testers.
A, B = '8.8.8.0/28', '9.9.9.9/32'


def table(testers=(), port80=False):
    return r.render([ipaddress.ip_network(t) for t in testers], RANGES['4'], RANGES['6'], port80)


class Validation(unittest.TestCase):
    def load(self, text):
        return r.load_testers(text, CF4)

    def test_accepts_public_entries_and_comments(self):
        self.assertEqual([str(n) for n in self.load(f'# fake\n{B}  # laptop\n\n{A}\n')], [A, B] if A < B else [B, A])

    def test_refuses_dangerous_entries(self):
        for bad in ['0.0.0.0/0', '8.0.0.0/8', '8.8.0.0/16', '8.8.8.0/24', '8.8.8.0/27', '10.0.0.1', '192.168.1.0/24', '127.0.0.1', '169.254.1.1',
                    '100.64.0.1', '192.0.2.1/32', '198.51.100.7', '224.0.0.1', '8.8.8.1/24', 'not-an-ip',
                    '2001:db8::1', '2606:4700::1',
                    '104.16.0.1', '173.245.48.0/24', '162.159.1.1', '172.64.0.0/24']:
            with self.assertRaises(ValueError, msg=bad):
                self.load(bad)

    def test_refuses_overlap_duplicates_collapse_and_limit(self):
        with self.assertRaises(ValueError):
            self.load('8.8.8.0/28\n8.8.8.8/32')
        self.assertEqual(len(self.load('9.9.9.9\n9.9.9.9/32')), 1)
        with self.assertRaises(ValueError):
            self.load('\n'.join(f'9.9.{i}.1' for i in range(r.MAX_TESTERS + 1)))


class Rendering(unittest.TestCase):
    def test_empty_list_is_fail_closed(self):
        text = table()
        self.assertRegex(text, r'set testers4 \{\s+type ipv4_addr\s+flags interval\s+\}')
        self.assertNotIn('elements = {  }', text)

    def test_preserved_rules_of_the_existing_table(self):
        old = (Path(__file__).parents[1] / 'public-test' / 'ingress.nft').read_text()
        new = table([A])
        for line in re.findall(r'^\s+(?:iifname|ct state|tcp dport 22|ip protocol|meta l4proto|udp sport|udp dport|drop$|tcp dport \{ 3000).*$', old, re.M):
            self.assertIn(line.strip(), new)
        self.assertIn('tcp dport { 3000, 3001, 8788, 8789 } reject with tcp reset', new)
        for ranges in RANGES['4'] + RANGES['6']:
            self.assertIn(ranges, new)

    def test_testers_only_get_443_not_80_and_never_internal_ports(self):
        text = table([A, B])
        accepts = [l.strip() for l in text.splitlines() if 'accept' in l]
        self.assertIn('tcp dport 443 ip saddr @testers4 accept', accepts)
        self.assertFalse([l for l in accepts if re.search(r'\b(3000|3001|8788|8789)\b', l)])
        self.assertNotIn('tcp dport 80 accept', accepts)
        self.assertFalse([l for l in accepts if 'testers4' in l and '80' in l])
        self.assertIn(A, text)
        self.assertIn(B, text)

    def test_open_port_80_is_explicit_and_precedes_the_reject(self):
        self.assertNotIn('tcp dport 80 accept', table())
        text = table(port80=True)
        self.assertLess(text.index('tcp dport 80 accept'), text.index('tcp dport { 80, 443 } reject'))
        self.assertNotIn('tcp dport 443 accept', text)  # 443 is never world-open

    def test_compatible_with_firewall_py_assertions_and_no_global_changes(self):
        text = table([A])
        self.assertEqual(text.count('table inet vidfetch_https_test_ingress {'), 1)
        self.assertNotIn('flush ruleset', text)
        self.assertNotIn('delete table', text)
        self.assertEqual(text.count('{') , text.count('}'))
        self.assertLess(text.index('tcp dport 22 accept'), text.index('reject with tcp reset'))

    def test_cli_writes_files_and_matching_caddy_list(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            (d / 't').write_text(f'{A}\n{B}\n')
            r.main(['--testers', str(d / 't'), '--out-nft', str(d / 'n'), '--out-caddy-env', str(d / 'e')])
            self.assertEqual((d / 'e').read_text(), f'VIDFETCH_MEDIA_TEST_IPS={" ".join(sorted([A, B], key=lambda x: ipaddress.ip_network(x)))}\n')
            r.main(['--out-nft', str(d / 'n'), '--out-caddy-env', str(d / 'e')])
            self.assertEqual((d / 'e').read_text(), 'VIDFETCH_MEDIA_TEST_IPS=192.0.2.1/32\n')  # denies everyone
            with self.assertRaises(ValueError):
                (d / 't').write_text('0.0.0.0/0\n')
                r.main(['--testers', str(d / 't'), '--out-nft', str(d / 'n2'), '--out-caddy-env', str(d / 'e2')])
            self.assertFalse((d / 'n2').exists())


if __name__ == '__main__':
    unittest.main()
