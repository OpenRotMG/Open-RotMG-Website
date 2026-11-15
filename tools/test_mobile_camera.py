import hashlib
import struct
import unittest
from mobile_camera import Code, camera_abc, with_mobile_camera


class MobileCameraTest(unittest.TestCase):
    def movie(self, tags=b'\x40\0\0\0'):
        body = b'\x08\0\0\x18\x01\0' + tags
        return b'FWS\x0e' + struct.pack('<I', len(body) + 8) + body

    def test_bridge_is_additive_and_keeps_the_existing_header_and_frame_tags(self):
        source = self.movie()
        result = with_mobile_camera(source)
        self.assertEqual(result[:4], source[:4])
        self.assertEqual(int.from_bytes(result[4:8], 'little'), len(result))
        self.assertEqual(result[8:14], source[8:14])
        self.assertEqual(result[-4:], source[-4:])
        self.assertEqual(result[14:16], struct.pack('<H', 82 << 6 | 63))
        self.assertIn(b'openrotmg.camera:on', result)
        self.assertIn(b'openrotmg.camera:off', result)
        self.assertIn(b'openrotmg.keyboard:text', result)
        self.assertIn(b'openrotmg.keyboard:shortcuts', result)
        self.assertNotIn(b'ExternalInterface', result, 'camera commands must not require JavaScript access')
        self.assertIn(b'centerOnPlayer', result)
        self.assertIn(b'allowRotation', result)
        self.assertIn(b'cameraAngle', result)
        self.assertIn(b'openrotmgCamera', result)
        self.assertIn(b'openrotmgMouseMap', result)
        self.assertIn(b'mouseUp', result)
        for name in [b'openrotmg.move:ready', b'openrotmg.move:direction', b'openrotmg.move:off', b'openrotmg.chat:ready', b'openrotmg.zoom:done', b'miniMapZoomIn', b'miniMapZoomOut', b'_-Dk', b'_-ky', b'_-vr', b'preventDefault', b'charCode']:
            self.assertIn(name, result)
        self.assertNotIn(b'save', result, 'camera mode must not persistently change the player’s preferences')
        with self.assertRaisesRegex(ValueError, 'already present'):
            with_mobile_camera(result)

    def test_invalid_and_missing_frames_fail_instead_of_silently_serving_a_client_without_camera_controls(self):
        for source in [b'', b'FWS', self.movie()[:-1], self.movie(b'\0\0'), self.movie(b'\xff\xff\xff\xff\xff\xff')]:
            with self.assertRaises(ValueError):
                with_mobile_camera(source)

    def test_backward_branch_targets_are_verifiable_avm2_labels(self):
        code = Code()
        code.label('loop')
        code.branch(0x10, 'loop')
        self.assertEqual(code.finish(), b'\x09\x10\xfb\xff\xff')

    def test_bytecode_is_deterministic(self):
        self.assertEqual(hashlib.sha256(camera_abc()).hexdigest(), '8eae4ccb668b99f4336f9a226522a45abb5724075027a1af809ccc3c9a710b43')
