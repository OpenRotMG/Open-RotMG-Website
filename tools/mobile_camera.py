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

    def branch(self, opcode, label):
        self.jumps.append((len(self.data), label))
        self.add(bytes([opcode, 0, 0, 0]))

    def finish(self):
        for offset, label in self.jumps:
            distance = self.labels[label] - offset - 4
            self.data[offset + 1:offset + 4] = distance.to_bytes(3, 'little', signed=True)
        return bytes(self.data)


def camera_abc():
    # Native F13/F14 commands change the real settings and acknowledge via trace, without script access or UI automation.
    names = ['getDefinitionByName', 'setInterval', 'clearInterval', 'trace', 'root', 'stage', 'addEventListener',
             'keyCode', 'data_', 'centerOnPlayer', 'allowRotation', 'length', 'push', '0', '1',
             'openrotmgCameraState', 'openrotmgCameraTimer', 'void']
    strings = ['', 'flash.utils'] + names + ['com.company.assembleegameclient.parameters.Parameters', 'keyDown', 'openrotmg.camera:on', 'openrotmg.camera:off']
    qname = {name: index + 1 for index, name in enumerate(names)}
    pool = b'\0\0\0' + u30(len(strings))
    pool += b''.join(u30(len(s.encode())) + s.encode() for s in strings[1:])
    pool += b'\x03\x16\x00\x16\x01\x00' + u30(len(names) + 1)
    pool += b''.join(b'\x07' + u30(2 if name in names[:3] else 1) + u30(strings.index(name)) for name in names)

    def op(code, name):
        return bytes([code]) + u30(qname[name])

    def text(value):
        return b'\x2c' + u30(strings.index(value))

    parameters = op(0x5D, 'getDefinitionByName') + text(strings[-4]) + op(0x46, 'getDefinitionByName') + b'\x01'
    stage = b'\xd1' + op(0x66, 'root') + op(0x66, 'stage')
    install = Code()
    install.add(parameters + b'\xd5\xd1' + op(0x66, 'root'))
    install.branch(0x12, 'return')
    install.add(stage)
    install.branch(0x12, 'return')
    install.add(stage + text('keyDown') + b'\x40\x01' + op(0x4F, 'addEventListener') + b'\x02')
    install.add(op(0x5D, 'clearInterval') + op(0x60, 'openrotmgCameraTimer') + op(0x4F, 'clearInterval') + b'\x01')
    install.label('return')
    install.add(b'\x47')

    state = op(0x60, 'openrotmgCameraState')
    data = b'\xd3'
    command = Code()
    command.add(b'\xd1' + op(0x66, 'keyCode') + b'\xd6\xd2\x24\x7c')
    command.branch(0x13, 'accept')
    command.add(b'\xd2\x24\x7d')
    command.branch(0x14, 'return')
    command.label('accept')
    command.add(parameters + op(0x66, 'data_') + b'\xd7\xd2\x24\x7c')
    command.branch(0x14, 'off')
    command.add(state + op(0x66, 'length'))
    command.branch(0x11, 'on')
    command.add(state + data + op(0x66, 'centerOnPlayer') + data + op(0x66, 'allowRotation') + op(0x4F, 'push') + b'\x02')
    command.label('on')
    command.add(data + b'\x27' + op(0x61, 'centerOnPlayer') + data + b'\x26' + op(0x61, 'allowRotation'))
    command.add(op(0x5D, 'trace') + text('openrotmg.camera:on') + op(0x4F, 'trace') + b'\x01\x47')
    command.label('off')
    command.add(state + op(0x66, 'length'))
    command.branch(0x12, 'ack')
    for name, index in [('centerOnPlayer', '0'), ('allowRotation', '1')]:
        command.add(data + state + op(0x66, index) + op(0x61, name))
    command.add(state + b'\x24\0' + op(0x61, 'length'))
    command.label('ack')
    command.add(op(0x5D, 'trace') + text('openrotmg.camera:off') + op(0x4F, 'trace') + b'\x01')
    command.label('return')
    command.add(b'\x47')

    initializer = (b'\xd0\x30\xd0\x56\0' + op(0x68, 'openrotmgCameraState')
                   + b'\xd0' + op(0x5D, 'setInterval') + b'\x40\0\x24\x0a'
                   + op(0x46, 'setInterval') + b'\x02' + op(0x68, 'openrotmgCameraTimer') + b'\x47')
    methods = b'\x00' + u30(qname['void']) + b'\0\0' + b'\x01' + u30(qname['void']) + b'\0\0\0' + b'\x00' + u30(qname['void']) + b'\0\0'
    traits = b''.join(u30(qname[name]) + b'\0' + u30(index + 1) + b'\0\0' for index, name in enumerate(names[15:17]))

    def body(method, code, locals_, scope):
        return bytes([method, 4, locals_, scope, 1]) + u30(len(code)) + code + b'\0\0'

    return (struct.pack('<HH', 16, 46) + pool + b'\x03' + methods + b'\0\0\x01\x02\x02' + traits + b'\x03'
            + body(0, install.finish(), 2, 1) + body(1, command.finish(), 4, 1) + body(2, initializer, 1, 0))


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
