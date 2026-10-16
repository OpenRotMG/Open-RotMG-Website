from copy import deepcopy
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import deploy
from package import package

REV = 'a' * 40


class WebsiteDeploy(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.build = self.root / 'build'
        self.build.mkdir()
        for name in ['index.html', '404.html', 'game.js', '.nojekyll']:
            (self.build / name).write_text(name)
        (self.build / 'diagnostics-build.json').write_text(json.dumps({'website': REV, 'dirty': False}))
        (self.build / 'updates').mkdir()
        (self.build / 'updates/index.html').write_text('Updates')
        self.archive = self.root / 'site.tar.gz'
        package(self.build, REV, self.archive)
        self.raw = self.archive.read_bytes()
        self.live = self.root / 'site'
        self.live.mkdir()
        (self.live / 'old.html').write_text('previous site')
        self.before = deploy.files(self.live)
        self.live.with_suffix('.sha256.json').write_text(json.dumps(self.before))
        self.live.with_suffix('.REVISION').write_text('b' * 40)
        for name, value in [('LIVE', self.live), ('STATE', self.root / 'state')]:
            p = patch.object(deploy, name, value)
            p.start()
            self.addCleanup(p.stop)

    def rewrite(self, transform):
        with tarfile.open(fileobj=io.BytesIO(self.raw)) as archive:
            entries = [(e, archive.extractfile(e).read()) for e in archive]
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w:gz') as archive:
            for entry, data in transform(entries):
                entry.size = len(data)
                archive.addfile(entry, io.BytesIO(data))
        return output.getvalue()

    def test_package_roundtrip_and_nested_static_deployment(self):
        with patch.object(deploy, 'current_main') as current, patch.object(deploy, 'verify_public') as public:
            deploy.deploy(REV, self.raw)
        _, manifest = deploy.payload(self.raw, REV)
        self.assertEqual(deploy.files(self.live), manifest)
        self.assertEqual(json.loads(self.live.with_suffix('.sha256.json').read_text()), manifest)
        self.assertEqual(self.live.with_suffix('.REVISION').read_text().strip(), REV)
        current.assert_called_with(REV)
        self.assertEqual(current.call_count, 2)
        public.assert_called_once_with(manifest)
        receipt = json.loads((deploy.STATE / 'status.json').read_text())
        self.assertEqual(receipt['state'], 'deployed')
        self.assertEqual(deploy.files(Path(receipt['previous_site'])), self.before)
        self.assertEqual((self.live / 'updates').stat().st_mode & 0o777, 0o755)
        self.assertEqual((self.live / 'updates/index.html').stat().st_mode & 0o777, 0o644)

    def test_unsafe_duplicate_and_nonregular_entries_are_rejected(self):
        for name in ['/etc/evil', 'site/../../evil', 'site//evil']:
            raw = self.rewrite(lambda entries: entries + [(tarfile.TarInfo(name), b'evil')])
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Unsafe'):
                deploy.payload(raw, REV)
        raw = self.rewrite(lambda entries: entries + [deepcopy(entries[0])])
        with self.assertRaisesRegex(ValueError, 'duplicate'):
            deploy.payload(raw, REV)
        def symlink(entries):
            entry = tarfile.TarInfo('site/link')
            entry.type = tarfile.SYMTYPE
            entry.linkname = '/etc/shadow'
            return entries + [(entry, b'')]
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            deploy.payload(self.rewrite(symlink), REV)

    def test_checksum_revision_and_archive_limits_fail_closed(self):
        with self.assertRaisesRegex(ValueError, 'revision'):
            deploy.payload(self.raw, 'b' * 40)
        raw = self.rewrite(lambda entries: [(e, b'corrupt' if e.name == 'site/index.html' else data) for e, data in entries])
        with self.assertRaisesRegex(ValueError, 'checksum'):
            deploy.payload(raw, REV)
        with patch.object(deploy, 'LIMIT', len(self.raw) - 1), self.assertRaisesRegex(ValueError, 'archive exceeds'):
            deploy.payload(self.raw, REV)
        expanded = self.rewrite(lambda entries: [(e, b'x' * 4096 if e.name == 'site/index.html' else data) for e, data in entries])
        with patch.object(deploy, 'LIMIT', 2048), self.assertRaisesRegex(ValueError, 'content exceeds'):
            deploy.payload(expanded, REV)

    def test_stale_main_or_drift_never_exchanges_the_site(self):
        with patch.object(deploy, 'current_main', side_effect=ValueError('Main advanced')), patch.object(deploy, 'exchange') as exchange:
            with self.assertRaisesRegex(ValueError, 'Main advanced'):
                deploy.deploy(REV, self.raw)
            exchange.assert_not_called()
        (self.live / 'old.html').write_text('drift')
        with patch.object(deploy, 'current_main'), patch.object(deploy, 'exchange') as exchange:
            with self.assertRaisesRegex(ValueError, 'recorded manifest'):
                deploy.deploy(REV, self.raw)
            exchange.assert_not_called()

    def test_main_advancing_during_staging_and_public_mismatch_are_observable(self):
        with patch.object(deploy, 'current_main', side_effect=[None, ValueError('Main advanced')]):
            with self.assertRaisesRegex(ValueError, 'Main advanced'):
                deploy.deploy(REV, self.raw)
        self.assertEqual(deploy.files(self.live), self.before)
        self.assertEqual(json.loads((deploy.STATE / 'status.json').read_text())['state'], 'staging')
        with patch.object(deploy, 'current_main'), patch.object(deploy, 'verify_public', side_effect=ValueError('Public mismatch')):
            with self.assertRaisesRegex(ValueError, 'Public mismatch'):
                deploy.deploy(REV, self.raw)
        status = json.loads((deploy.STATE / 'status.json').read_text())
        self.assertEqual(status['state'], 'activated_unverified')
        self.assertEqual(status['error'], 'Public mismatch')
        self.assertEqual(deploy.files(Path(status['previous_site'])), self.before)

    def test_public_verification_compares_real_http_bytes(self):
        from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
        import functools
        import threading
        class Quiet(SimpleHTTPRequestHandler):
            def log_message(self, *args):
                pass
        with ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(self.build))) as http:
            thread = threading.Thread(target=http.serve_forever)
            thread.start()
            try:
                with patch.object(deploy, 'ORIGIN', f'http://127.0.0.1:{http.server_port}/'):
                    deploy.verify_public(deploy.files(self.build))
                    with self.assertRaisesRegex(ValueError, 'checksum mismatch'):
                        deploy.verify_public({'index.html': '0' * 64})
            finally:
                http.shutdown()
                thread.join()


if __name__ == '__main__':
    unittest.main()
