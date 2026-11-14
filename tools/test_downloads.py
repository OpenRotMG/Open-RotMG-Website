import hashlib
import io
import json
from pathlib import Path
import struct
import tarfile
import tempfile
import unittest
from unittest.mock import patch
from zipfile import ZipFile

import downloads
from mobile_camera import u30
from native_client import with_native_endpoints


def movie():
    values = [b'127.0.0.1:8080', b'http://', b'realmofthemadgod.appspot.com', b'/char',
              b'/sfx/music/sorc.mp3', b'/gold/', b'RotMG', b'AssembleeGameClientOptions', b'unchanged-gameplay']
    abc = b'\x10\0\x2e\0\0\0\0' + u30(len(values) + 1)
    abc += b''.join(u30(len(value)) + value for value in values) + b'\0\0\0\0\0'
    payload = b'\0\0\0\0test\0' + abc
    body = b'\x08\0\0\x18\x01\0' + struct.pack('<HI', (82 << 6) | 63, len(payload)) + payload + b'\0\0'
    return b'FWS\x0a' + struct.pack('<I', len(body) + 8) + body


class DownloadsTest(unittest.TestCase):
    def test_standalone_movie_has_https_account_audio_and_native_character_endpoints(self):
        result = with_native_endpoints(movie(), 'https://game.example.test', 'https://example.test/')
        self.assertEqual(int.from_bytes(result[4:8], 'little'), len(result))
        for value in [b'game.example.test/legacy-api', b'https://', b'/native-char',
                      b'/sfx/music/sorc.mp3', b'https://example.test/gold/', b'OpenRotMGOnline', b'OpenRotMGOnlineOptions', b'unchanged-gameplay']:
            self.assertIn(value, result)
        for value in [b'127.0.0.1:8080', b'realmofthemadgod.appspot.com', b'\x07http://']:
            self.assertNotIn(value, result)
        with self.assertRaisesRegex(ValueError, 'layout'):
            with_native_endpoints(result, 'https://game.example.test', 'https://example.test')

    def test_incompatible_input_is_not_published_as_a_working_swf(self):
        for source in [movie()[:-1], b'HTML error', movie().replace(b'/char', b'/oops')]:
            with self.assertRaises(ValueError):
                with_native_endpoints(source, 'https://game.example.test', 'https://example.test')
        with self.assertRaisesRegex(ValueError, 'API origin'):
            with_native_endpoints(movie(), 'https://user:secret@example.test', 'https://example.test')

    def test_zip_contains_the_same_swf_executable_launchers_and_exact_build_identity(self):
        runtime = io.BytesIO()
        with tarfile.open(fileobj=runtime, mode='w:gz') as archive:
            for name in ['ruffle', 'LICENSE.md', 'README.md', 'openrotmg.json']:
                entry = tarfile.TarInfo(name)
                data = (json.dumps({'version': downloads.RUFFLE_VERSION, 'client': 'f' * 40}).encode()
                        if name == 'openrotmg.json' else ('fixture ' + name).encode())
                entry.size = len(data)
                archive.addfile(entry, io.BytesIO(data))
        data = runtime.getvalue()
        identity = {'native_host': 'game.example.test', 'server': 'a' * 40, 'website': 'b' * 40, 'client': 'c' * 40}
        fetch = lambda *args, **kwargs: io.BytesIO(data)
        with tempfile.TemporaryDirectory() as directory, patch.object(downloads, 'RUFFLE_SHA256', hashlib.sha256(data).hexdigest()):
            root = Path(directory)
            receipt = downloads.build_downloads(root, movie(), 'https://game.example.test', 'https://example.test', identity, fetch)
            swf = (root / 'openrotmg.swf').read_bytes()
            first = (root / 'openrotmg-linux-x64.zip').read_bytes()
            with ZipFile(io.BytesIO(first)) as archive:
                self.assertEqual(archive.read('Open RotMG/client.swf'), swf)
                self.assertEqual(json.loads(archive.read('Open RotMG/build.json')), receipt)
                for name in ['ruffle', 'Open RotMG.sh']:
                    self.assertEqual(archive.getinfo('Open RotMG/' + name).external_attr >> 16, 0o100755)
                launcher = archive.read('Open RotMG/Open RotMG.sh')
                self.assertIn(b'--socket-allow game.example.test:2050 client.swf', launcher)
                self.assertIn(b'umask 077\n', launcher)
                self.assertIn(b'--save-directory "$PWD/player-data"', launcher)
            downloads.build_downloads(root, movie(), 'https://game.example.test', 'https://example.test', identity, fetch)
            self.assertEqual(first, (root / 'openrotmg-linux-x64.zip').read_bytes())
            for line in (root / 'SHA256SUMS').read_text().splitlines():
                digest, name = line.split('  ')
                self.assertEqual(digest, hashlib.sha256((root / name).read_bytes()).hexdigest())
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, 'checksum'):
                downloads.build_downloads(Path(directory), movie(), 'https://game.example.test', 'https://example.test', identity, fetch)
            self.assertFalse((Path(directory) / 'openrotmg.swf').exists())
