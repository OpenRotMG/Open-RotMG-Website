import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
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
        self.client = self.root / 'source'
        self.client.mkdir()
        for name in ['index.html', 'client.swf']:
            (self.client / name).write_text(name)
        (self.client / '.gitignore').write_text('vendor/\n')
        subprocess.run(['git', 'init', '-q', str(self.client)], check=True)
        subprocess.run(['git', '-C', str(self.client), 'add', '.'], check=True)
        subprocess.run(['git', '-C', str(self.client), '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture'], check=True)
        self.client_revision = subprocess.check_output(['git', '-C', str(self.client), 'rev-parse', 'HEAD'], text=True).strip()
        (self.client / 'vendor').mkdir()
        (self.client / 'vendor/ruffle.js').write_text('runtime')
        (self.client / 'vendor/openrotmg.json').write_text('{}')
        (self.build / 'diagnostics-build.json').write_text(json.dumps({
            'website': REV, 'client': self.client_revision, 'dirty': False,
            'runtime': deploy.digest(b'{}')[:16]}))
        archive = self.root / 'bundle.tar.gz'
        package(self.build, self.client, REV, archive)
        self.raw = archive.read_bytes()
        self.live = self.root / 'site'
        self.live.mkdir()
        (self.live / 'old.html').write_text('previous site')
        self.live_client = self.root / 'client'
        self.live_client.mkdir()
        for name in ['index.html', 'client.swf', '.gitignore', 'vendor/ruffle.js', 'vendor/openrotmg.json']:
            path = self.live_client / name
            path.parent.mkdir(exist_ok=True)
            path.write_bytes((self.client / name).read_bytes())
        self.before = deploy.files(self.live)
        for tree, revision in [(self.live, 'b' * 40), (self.live_client, self.client_revision)]:
            tree.with_suffix('.sha256.json').write_text(json.dumps(deploy.files(tree)))
            tree.with_suffix('.REVISION').write_text(revision)
        for name, value in [('LIVE', self.live), ('CLIENT', self.live_client), ('STATE', self.root / 'state')]:
            p = patch.object(deploy, name, value)
            p.start()
            self.addCleanup(p.stop)

    def publish(self):
        deploy.deploy(REV, self.client_revision, self.raw)

    def rewrite(self, transform):
        with tarfile.open(fileobj=io.BytesIO(self.raw)) as archive:
            entries = [(e.name, archive.extractfile(e).read()) for e in archive]
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w:gz') as archive:
            for name, data in transform(entries):
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                archive.addfile(entry, io.BytesIO(data))
        return output.getvalue()

    def test_website_only_publishes_without_loading_server_updater(self):
        with patch.object(deploy, 'current_main') as current, patch.object(deploy, 'verify_public'), \
                patch.object(deploy, 'server_updater') as updater:
            self.publish()
        updater.assert_not_called()
        self.assertEqual(current.call_count, 2)
        self.assertEqual(self.live.with_suffix('.REVISION').read_text().strip(), REV)
        status = json.loads((deploy.STATE / 'status.json').read_text())
        self.assertEqual(status['state'], 'deployed')
        self.assertFalse(status['client_restarted'])
        self.assertEqual(deploy.files(Path(status['previous_site'])), self.before)
        self.assertEqual((self.live / 'index.html').stat().st_mode & 0o777, 0o644)

    def updater(self):
        (self.root / 'backup.lock').touch()
        config = self.root / 'config.json'
        config.write_text(json.dumps({'state': str(self.root), 'bind': '127.0.0.1:18923'}))
        (self.root / 'server.pem').write_text('private fixture')
        return SimpleNamespace(CONFIG=config, LAST_BACKUP=self.root / 'receipt.json', LIVE=self.root / 'server',
                               start_backup=Mock(), rehearse=Mock(), warn_restart=Mock(), run=Mock(),
                               copy_db=Mock(side_effect=lambda src, dst: dst.write_text('frozen')), ready=Mock())

    def test_readme_only_client_revision_rehearses_saves_restarts_and_retains_both_trees(self):
        self.live_client.with_suffix('.REVISION').write_text('c' * 40)
        updater = self.updater()
        with patch.object(deploy, 'current_main'), patch.object(deploy, 'verify_public'), \
                patch.object(deploy, 'server_updater', return_value=updater), \
                patch.object(deploy.subprocess, 'check_output', return_value='success'):
            self.publish()
        self.assertEqual(updater.start_backup.call_count, 2)
        updater.rehearse.assert_called_once()
        self.assertNotEqual(updater.rehearse.call_args.args[2]['client'], str(self.live_client))
        self.assertEqual([c.args for c in updater.run.call_args_list], [
            ('systemctl', 'stop', 'openrotmg.service'), ('systemctl', 'start', 'openrotmg.service')])
        self.assertEqual(self.live_client.with_suffix('.REVISION').read_text().strip(), self.client_revision)
        receipt = json.loads((deploy.STATE / 'status.json').read_text())
        self.assertTrue(Path(receipt['previous_client']).is_dir())
        self.assertTrue((Path(receipt['recovery']) / 'cutover/game.db').is_file())

    def test_rehearsal_or_save_failure_never_exchanges_live_files(self):
        for step in ['rehearse', 'save']:
            updater = self.updater()
            self.live_client.with_suffix('.REVISION').write_text('c' * 40)
            if step == 'rehearse':
                updater.rehearse.side_effect = ValueError('rehearsal failed')
            with patch.object(deploy, 'current_main'), patch.object(deploy, 'server_updater', return_value=updater), \
                    patch.object(deploy.subprocess, 'check_output', return_value='failed'), \
                    patch.object(deploy, 'exchange') as exchange:
                with self.assertRaisesRegex(ValueError, 'failed'):
                    self.publish()
                exchange.assert_not_called()
            self.assertEqual(deploy.files(self.live), self.before)

    def test_stale_main_and_drift_fail_closed(self):
        with patch.object(deploy, 'current_main', side_effect=ValueError('Main advanced')), patch.object(deploy, 'exchange') as exchange:
            with self.assertRaisesRegex(ValueError, 'Main advanced'):
                self.publish()
            exchange.assert_not_called()
        (self.live / 'old.html').write_text('drift')
        with patch.object(deploy, 'current_main'), self.assertRaisesRegex(ValueError, 'recorded manifest'):
            self.publish()

    def test_archive_paths_hashes_and_revisions_are_checked(self):
        for name in ['/etc/evil', 'client/../../evil', 'site//evil', 'site/index.html']:
            raw = self.rewrite(lambda entries: entries + [(name, b'evil')])
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Unsafe|duplicate'):
                deploy.payload(raw, REV, self.client_revision)
        raw = self.rewrite(lambda entries: [(n, b'corrupt' if n == 'client/client.swf' else d) for n, d in entries])
        with self.assertRaisesRegex(ValueError, 'checksum'):
            deploy.payload(raw, REV, self.client_revision)
        with self.assertRaisesRegex(ValueError, 'revision'):
            deploy.payload(self.raw, REV, 'c' * 40)
        with patch.object(deploy, 'LIMIT', len(self.raw) - 1), self.assertRaisesRegex(ValueError, 'exceeds'):
            deploy.payload(self.raw, REV, self.client_revision)

    def test_public_mismatch_is_not_success_or_rolled_back(self):
        with patch.object(deploy, 'current_main'), patch.object(deploy, 'verify_public', side_effect=ValueError('Public mismatch')):
            with self.assertRaisesRegex(ValueError, 'Public mismatch'):
                self.publish()
        status = json.loads((deploy.STATE / 'status.json').read_text())
        self.assertEqual(status['state'], 'activated_unverified')
        self.assertEqual(status['error'], 'Public mismatch')
        self.assertEqual(deploy.files(Path(status['previous_site'])), self.before)

    def test_public_verification_compares_real_http_bytes(self):
        from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
        import functools
        import threading
        with ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(SimpleHTTPRequestHandler, directory=str(self.build))) as http:
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
