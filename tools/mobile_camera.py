import struct


def u30(value):
    result = bytearray()
    while value >= 128:
        result.append((value & 127) | 128)
        value >>= 7
    return bytes(result) + bytes([value])


class Code:
    def __init__(self):
        self.data, self.labels, self.jumps = bytearray(), {}, []

    def add(self, data):
        self.data.extend(data)

    def label(self, name):
        self.labels[name] = len(self.data)
        self.add(b'\x09')  # AVM2 requires a label instruction at backward jump targets.

    def branch(self, opcode, label):
        self.jumps.append((len(self.data), label))
        self.add(bytes([opcode, 0, 0, 0]))

    def finish(self):
        for offset, label in self.jumps:
            distance = self.labels[label] - offset - 4
            self.data[offset + 1:offset + 4] = distance.to_bytes(3, 'little', signed=True)
        return bytes(self.data)


def camera_abc():
    # Native commands acknowledge camera changes and keyboard focus via trace, without script access or UI automation.
    names = ['getDefinitionByName', 'setInterval', 'clearInterval', 'trace', 'root', 'stage', 'addEventListener',
             'keyCode', 'data_', 'centerOnPlayer', 'allowRotation', 'cameraAngle', 'defaultCameraAngle',
             'openrotmgCameraTimer', 'void', 'focus', 'target', 'parent', 'player_',
             'openrotmgMouseMap', 'dispatchEvent']
    parameters_class = 'com.company.assembleegameclient.parameters.Parameters'
    strings = ['', 'flash.utils'] + names + [parameters_class, 'keyDown', 'openrotmg.camera:on', 'openrotmg.camera:off', 'openrotmg.keyboard:text', 'openrotmg.keyboard:shortcuts',
              'mouseDown', 'mouseUp', 'deactivate', 'flash.events.MouseEvent']
    qname = {name: index + 1 for index, name in enumerate(names)}
    pool = b'\0\0\0' + u30(len(strings))
    pool += b''.join(u30(len(s.encode())) + s.encode() for s in strings[1:])
    pool += b'\x03\x16\x00\x16\x01\x00' + u30(len(names) + 1)
    pool += b''.join(b'\x07' + u30(2 if name in names[:3] else 1) + u30(strings.index(name)) for name in names)

    def op(code, name):
        return bytes([code]) + u30(qname[name])

    def text(value):
        return b'\x2c' + u30(strings.index(value))

    def reset_camera(data):
        return (data + b'\x26' + op(0x61, 'centerOnPlayer')
                + data + b'\x27' + op(0x61, 'allowRotation')
                + data + b'\x24\0' + op(0x61, 'cameraAngle')
                + data + b'\x24\0' + op(0x61, 'defaultCameraAngle'))

    parameters = op(0x5D, 'getDefinitionByName') + text(parameters_class) + op(0x46, 'getDefinitionByName') + b'\x01'
    stage = b'\xd1' + op(0x66, 'root') + op(0x66, 'stage')
    install = Code()
    install.add(parameters + b'\xd5\xd1' + op(0x66, 'root'))
    install.branch(0x12, 'return')
    install.add(stage)
    install.branch(0x12, 'return')
    install.add(b'\xd1' + op(0x66, 'data_'))
    install.branch(0x12, 'return')
    install.add(b'\xd1' + op(0x66, 'data_') + b'\xd6' + reset_camera(b'\xd2'))
    install.add(stage + text('keyDown') + b'\x40\x01' + op(0x4F, 'addEventListener') + b'\x02')
    for event, method in [('mouseDown', 2), ('mouseUp', 3), ('deactivate', 3)]:
        install.add(stage + text(event) + bytes([0x40, method, 0x26]) + op(0x4F, 'addEventListener') + b'\x03')
    install.add(op(0x5D, 'clearInterval') + op(0x60, 'openrotmgCameraTimer') + op(0x4F, 'clearInterval') + b'\x01')
    install.label('return')
    install.add(b'\x47')

    data = b'\xd3'
    command = Code()
    command.add(b'\xd1' + op(0x66, 'keyCode') + b'\xd6\xd2\x24\x7e')
    command.branch(0x13, 'keyboard')
    command.add(b'\xd2\x24\x7c')
    command.branch(0x13, 'accept')
    command.add(b'\xd2\x24\x7d')
    command.branch(0x14, 'return')
    command.label('accept')
    command.add(parameters + op(0x66, 'data_') + b'\xd7\xd2\x24\x7c')
    command.branch(0x14, 'off')
    command.add(data + b'\x27' + op(0x61, 'centerOnPlayer') + data + b'\x26' + op(0x61, 'allowRotation'))
    command.add(op(0x5D, 'trace') + text('openrotmg.camera:on') + op(0x4F, 'trace') + b'\x01\x47')
    command.label('off')
    command.add(reset_camera(data))
    command.add(op(0x5D, 'trace') + text('openrotmg.camera:off') + op(0x4F, 'trace') + b'\x01\x47')
    command.label('keyboard')
    command.add(parameters + op(0x66, 'root') + op(0x66, 'stage') + op(0x66, 'focus'))
    command.branch(0x12, 'shortcuts')
    command.add(op(0x5D, 'trace') + text('openrotmg.keyboard:text') + op(0x4F, 'trace') + b'\x01\x47')
    command.label('shortcuts')
    command.add(op(0x5D, 'trace') + text('openrotmg.keyboard:shortcuts') + op(0x4F, 'trace') + b'\x01')
    command.label('return')
    command.add(b'\x47')

    mouse_down = Code()
    mouse_down.add(b'\xd1' + op(0x66, 'target') + b'\xd6')
    mouse_down.label('parent')
    mouse_down.add(b'\xd2')
    mouse_down.branch(0x12, 'remember')
    mouse_down.add(text('player_') + b'\xd2\xb4')
    mouse_down.branch(0x11, 'remember')
    mouse_down.add(b'\xd2' + op(0x66, 'parent') + b'\xd6')
    mouse_down.branch(0x10, 'parent')
    mouse_down.label('remember')
    mouse_down.add(b'\x64\xd2' + op(0x61, 'openrotmgMouseMap') + b'\x47')

    # The original game listens for mouse-up only on its map; inventory releases and canvas exits must stop firing too.
    mouse_up = Code()
    mouse_up.add(op(0x60, 'openrotmgMouseMap') + b'\xd6\x64\x20' + op(0x61, 'openrotmgMouseMap') + b'\xd2')
    mouse_up.branch(0x12, 'return')
    mouse_up.add(b'\xd2' + op(0x5D, 'getDefinitionByName') + text('flash.events.MouseEvent')
                 + op(0x46, 'getDefinitionByName') + b'\x01' + text('mouseUp') + b'\x27\x42\x02'
                 + op(0x4F, 'dispatchEvent') + b'\x01')
    mouse_up.label('return')
    mouse_up.add(b'\x47')

    initializer = (b'\xd0\x30\xd0' + op(0x5D, 'setInterval') + b'\x40\0\x24\x0a'
                   + op(0x46, 'setInterval') + b'\x02' + op(0x68, 'openrotmgCameraTimer') + b'\x47')
    methods = b''.join(u30(args) + u30(qname['void']) + b'\0' * (args + 2) for args in [0, 1, 1, 1, 0])
    traits = b''.join(u30(qname[name]) + b'\0' + u30(index + 1) + b'\0\0'
                      for index, name in enumerate(['openrotmgCameraTimer', 'openrotmgMouseMap']))

    def body(method, code, locals_, scope):
        return bytes([method, 4, locals_, scope, 1]) + u30(len(code)) + code + b'\0\0'

    return (struct.pack('<HH', 16, 46) + pool + b'\x05' + methods + b'\0\0\x01\x04\x02' + traits + b'\x05'
            + body(0, install.finish(), 3, 1) + body(1, command.finish(), 4, 1)
            + body(2, mouse_down.finish(), 3, 1) + body(3, mouse_up.finish(), 3, 1) + body(4, initializer, 1, 0))


def with_mobile_camera(source):
    if len(source) < 14 or source[:3] != b'FWS' or len(source) != int.from_bytes(source[4:8], 'little'):
        raise ValueError('Mobile camera requires a validated, uncompressed Flash movie')
    if b'openrotmg-mobile-camera\0' in source:
        raise ValueError('Mobile camera bridge is already present')
    bits = source[8] >> 3
    offset = 8 + (5 + 4 * bits + 7) // 8 + 4
    while offset + 2 <= len(source):
        header = int.from_bytes(source[offset:offset + 2], 'little')
        tag, size = header >> 6, header & 63
        start = offset + 2
        if size == 63:
            size = int.from_bytes(source[start:start + 4], 'little')
            start += 4
        if start + size > len(source):
            raise ValueError('Truncated Flash tag in mobile client')
        if tag == 1:
            payload = b'\0\0\0\0openrotmg-mobile-camera\0' + camera_abc()
            addition = struct.pack('<HI', (82 << 6) | 63, len(payload)) + payload
            result = source[:offset] + addition + source[offset:]
            return result[:4] + struct.pack('<I', len(result)) + result[8:]
        offset = start + size
    raise ValueError('Mobile client has no first frame')
