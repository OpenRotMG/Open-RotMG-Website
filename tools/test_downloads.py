import hashlib
from pathlib import Path
import struct
import tempfile
import unittest

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

    def test_downloads_publish_the_native_swf(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            receipt = downloads.build_downloads(root, movie(), 'https://game.example.test', 'https://example.test')
            self.assertEqual(receipt['swf_sha256'], hashlib.sha256((root / 'openrotmg.swf').read_bytes()).hexdigest())
