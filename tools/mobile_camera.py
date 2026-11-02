import math
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
    names = ['getDefinitionByName', 'setInterval', 'clearInterval', 'trace', 'root', 'stage', 'addEventListener',
             'keyCode', 'data_', 'centerOnPlayer', 'allowRotation', 'cameraAngle', 'defaultCameraAngle',
             'openrotmgCameraTimer', 'void', 'focus', 'target', 'parent', 'player_',
             'openrotmgMouseMap', 'dispatchEvent', 'openrotmgMoveGame', 'openrotmgMoving', 'openrotmgMoveAngle',
             'mui_', 'map_', 'numChildren', 'getChildAt', '_-Dk', '_-ky', '_-vr', 'x', 'y', 'Math', 'cos', 'sin',
             'stopImmediatePropagation', 'text', 'charCodeAt', 'preventDefault', 'moveRight', 'miniMapZoomIn', 'miniMapZoomOut', 'chat', 'charCode']
    parameters_class = 'com.company.assembleegameclient.parameters.Parameters'
    strings = ['', 'flash.utils'] + names + [parameters_class, 'keyDown', 'keyUp', 'openrotmg.camera:on', 'openrotmg.camera:off',
              'openrotmg.keyboard:text', 'openrotmg.keyboard:shortcuts', 'mouseDown', 'mouseUp', 'deactivate', 'flash.events.MouseEvent',
              'flash.events.KeyboardEvent', 'textInput', 'openrotmg.move:ready', 'openrotmg.move:idle', 'openrotmg.move:direction',
              'openrotmg.move:off', 'openrotmg.zoom:done', 'openrotmg.chat:ready', 'openrotmg.chat:idle', '_-iX']
    qname = {name: index + 1 for index, name in enumerate(names)}
    pool = b'\x04' + u30(0xe000) + u30(0xe000 + 3600) + u30(0xffff) + b'\0\x02' + struct.pack('<d', math.tau / 3600)
    pool += u30(len(strings)) + b''.join(u30(len(s.encode())) + s.encode() for s in strings[1:])
    # Player's movement slots use its protected namespace; public QNames cannot resolve them.
    pool += b'\x04\x16\0\x16\x01\x18' + u30(strings.index('_-iX')) + b'\0' + u30(len(names) + 1)
    pool += b''.join(b'\x07' + u30(3 if name in ['_-Dk', '_-ky'] else 2 if name in names[:3] else 1)
                     + u30(strings.index(name)) for name in names)

    def op(code, name):
        return bytes([code]) + u30(qname[name])

    def text(value):
        return b'\x2c' + u30(strings.index(value))

    def call(method, arguments=b'', count=0):
        return bytes([0x40, method, 0x20]) + arguments + bytes([0x41, count])

    def trace(value):
        return op(0x5D, 'trace') + text(value) + op(0x4F, 'trace') + b'\x01'

    def reset_camera(data):
        return (data + b'\x26' + op(0x61, 'centerOnPlayer')
                + data + b'\x27' + op(0x61, 'allowRotation')
                + data + b'\x24\0' + op(0x61, 'cameraAngle')
                + data + b'\x24\0' + op(0x61, 'defaultCameraAngle'))

    parameters = op(0x5D, 'getDefinitionByName') + text(parameters_class) + op(0x46, 'getDefinitionByName') + b'\x01'
    root = parameters + op(0x66, 'root')
    stage = root + op(0x66, 'stage')
    data = parameters + op(0x66, 'data_')
    find_game = call(4, root, 1)
    send_key = lambda key, event: call(8, key + text(event), 2) + b'\x29'
    send_pair = lambda key: send_key(key, 'keyDown') + send_key(key, 'keyUp')
    install = Code()
    install.add(parameters + b'\xd5\xd1' + op(0x66, 'root'))
    install.branch(0x12, 'return')
    install.add(stage)
    install.branch(0x12, 'return')
    install.add(data)
    install.branch(0x12, 'return')
    install.add(reset_camera(data))
    for event, method, capture, priority in [('keyDown', 1, False, 1000), ('keyDown', 6, False, -1000),
                                             ('keyUp', 6, False, -1000), ('textInput', 7, False, 1000),
                                             ('mouseDown', 2, True, 0), ('mouseUp', 3, True, 0), ('deactivate', 3, True, 0)]:
        install.add(stage + text(event) + bytes([0x40, method, 0x26 if capture else 0x27, 0x25])
                    + u30(priority & 0xffff) + op(0x4F, 'addEventListener') + b'\x04')
    install.add(op(0x5D, 'clearInterval') + op(0x60, 'openrotmgCameraTimer') + op(0x4F, 'clearInterval') + b'\x01')
    install.label('return')
    install.add(b'\x47')

    command = Code()
    # Internal binding events must not recursively invoke reserved mobile commands after a player remaps keys.
    command.add(b'\xd1' + op(0x66, 'charCode') + b'\x2d\x03')
    command.branch(0x13, 'return')
    command.add(b'\xd1' + op(0x66, 'keyCode') + b'\xd6\xd2\x2d\x01')
    command.branch(0x15, 'keys')
    command.add(b'\xd2\x2d\x02')
    command.branch(0x18, 'keys')
    command.add(b'\xd1' + op(0x4F, 'stopImmediatePropagation') + b'\0' + op(0x60, 'openrotmgMoving'))
    command.branch(0x12, 'return')
    command.add(b'\x64\xd2\x2d\x01\xa1\x2f\x01\xa2' + op(0x61, 'openrotmgMoveAngle') + call(5) + b'\x29')
    command.add(trace('openrotmg.move:direction') + b'\x47')
    command.label('keys')
    for key, label in [(124, 'on'), (125, 'off'), (126, 'keyboard'), (127, 'move'), (128, 'stop'), (129, 'zoom_in'), (130, 'zoom_out'), (131, 'chat')]:
        command.add(b'\xd2\x25' + u30(key))
        command.branch(0x13, label)
    command.add(b'\x47')
    command.label('on')
    command.add(data + b'\x27' + op(0x61, 'centerOnPlayer') + data + b'\x26' + op(0x61, 'allowRotation') + trace('openrotmg.camera:on') + b'\x47')
    command.label('off')
    command.add(reset_camera(data) + trace('openrotmg.camera:off') + b'\x47')
    command.label('keyboard')
    command.add(stage + op(0x66, 'focus'))
    command.branch(0x12, 'shortcuts')
    command.add(trace('openrotmg.keyboard:text') + b'\x47')
    command.label('shortcuts')
    command.add(trace('openrotmg.keyboard:shortcuts') + b'\x47')
    command.label('move')
    command.add(b'\xd1' + op(0x4F, 'stopImmediatePropagation') + b'\0' + stage + op(0x66, 'focus'))
    command.branch(0x11, 'move_idle')
    command.add(find_game + b'\xd7\xd3')
    command.branch(0x12, 'move_idle')
    command.add(b'\xd3' + op(0x66, 'map_') + op(0x66, 'player_'))
    command.branch(0x12, 'move_idle')
    command.add(b'\x64\xd3' + op(0x61, 'openrotmgMoveGame') + b'\x64\x26' + op(0x61, 'openrotmgMoving'))
    command.add(send_key(data + op(0x66, 'moveRight'), 'keyDown') + trace('openrotmg.move:ready') + b'\x47')
    command.label('move_idle')
    command.add(trace('openrotmg.move:idle') + b'\x47')
    command.label('stop')
    command.add(b'\xd1' + op(0x4F, 'stopImmediatePropagation') + b'\0' + op(0x60, 'openrotmgMoving'))
    command.branch(0x12, 'stop_ack')
    command.add(b'\x64\x27' + op(0x61, 'openrotmgMoving') + send_key(data + op(0x66, 'moveRight'), 'keyUp'))
    command.label('stop_ack')
    command.add(trace('openrotmg.move:off') + b'\x47')
    for label, binding in [('zoom_in', 'miniMapZoomIn'), ('zoom_out', 'miniMapZoomOut')]:
        command.label(label)
        command.add(find_game)
        command.branch(0x12, 'return')
        command.add(send_pair(data + op(0x66, binding)) + trace('openrotmg.zoom:done') + b'\x47')
    command.label('chat')
    command.add(find_game)
    command.branch(0x12, 'chat_idle')
    command.add(stage + op(0x66, 'focus'))
    command.branch(0x11, 'chat_ready')
    command.add(send_pair(data + op(0x66, 'chat')) + stage + op(0x66, 'focus'))
    command.branch(0x12, 'chat_idle')
    command.label('chat_ready')
    command.add(trace('openrotmg.chat:ready') + b'\x47')
    command.label('chat_idle')
    command.add(trace('openrotmg.chat:idle'))
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

    find = Code()
    find.add(text('mui_') + b'\xd1\xb4')
    find.branch(0x12, 'children')
    find.add(b'\xd1\x48')
    find.label('children')
    find.add(text('numChildren') + b'\xd1\xb4')
    find.branch(0x12, 'empty')
    find.add(b'\x24\0\xd6')
    find.label('loop')
    find.add(b'\xd2\xd1' + op(0x66, 'numChildren'))
    find.branch(0x18, 'empty')
    find.add(call(4, b'\xd1\xd2' + op(0x46, 'getChildAt') + b'\x01', 1) + b'\xd7\xd3')
    find.branch(0x12, 'next')
    find.add(b'\xd3\x48')
    find.label('next')
    find.add(b'\xc2\x02')
    find.branch(0x10, 'loop')
    find.label('empty')
    find.add(b'\x20\x48')

    # Reuse native input gating and status-effect handling; never replace rotation or move a paused/text-focused player.
    apply = Code()
    apply.add(op(0x60, 'openrotmgMoving'))
    apply.branch(0x12, 'return')
    apply.add(op(0x60, 'openrotmgMoveGame') + b'\xd5\xd1' + op(0x66, 'parent'))
    apply.branch(0x12, 'return')
    apply.add(b'\xd1' + op(0x66, 'map_') + op(0x66, 'player_') + b'\xd6\xd2')
    apply.branch(0x12, 'return')
    apply.add(b'\xd2' + op(0x66, '_-Dk') + b'\xd7\xd3')
    apply.branch(0x12, 'return')
    apply.add(b'\xd3' + op(0x66, 'x'))
    apply.branch(0x11, 'moving')
    apply.add(b'\xd3' + op(0x66, 'y'))
    apply.branch(0x12, 'return')
    apply.label('moving')
    apply.add(b'\xd2' + op(0x66, '_-ky') + b'\x63\x04' + stage + op(0x66, 'focus'))
    apply.branch(0x12, 'direction')
    apply.add(b'\xd2\x24\0\x24\0\x24\0' + op(0x4F, '_-vr') + b'\x03')
    apply.branch(0x10, 'rotation')
    apply.label('direction')
    apply.add(b'\xd2\x24\0')
    for function in ['cos', 'sin']:
        apply.add(op(0x60, 'Math') + op(0x60, 'openrotmgMoveAngle') + op(0x46, function) + b'\x01')
    apply.add(op(0x4F, '_-vr') + b'\x03')
    apply.label('rotation')
    apply.add(b'\xd2\x62\x04' + op(0x61, '_-ky'))
    apply.label('return')
    apply.add(b'\x47')
    late = call(5) + b'\x29\x47'

    text_input = Code()
    text_input.add(op(0x60, 'openrotmgMoving'))
    text_input.branch(0x12, 'return')
    text_input.add(b'\xd1' + op(0x66, 'text') + b'\x24\0' + op(0x46, 'charCodeAt') + b'\x01\xd6\xd2\x2d\x01')
    text_input.branch(0x15, 'return')
    text_input.add(b'\xd2\x2d\x02')
    text_input.branch(0x18, 'return')
    text_input.add(b'\xd1' + op(0x4F, 'preventDefault') + b'\0')
    text_input.label('return')
    text_input.add(b'\x47')

    dispatch = (stage + op(0x5D, 'getDefinitionByName') + text('flash.events.KeyboardEvent')
                + op(0x46, 'getDefinitionByName') + b'\x01\xd2\x26\x27\x2d\x03\xd1\x42\x05'
                + op(0x4F, 'dispatchEvent') + b'\x01\x47')
    initializer = (b'\xd0\x30\x64\x27' + op(0x61, 'openrotmgMoving') + b'\x64\x24\0' + op(0x61, 'openrotmgMoveAngle')
                   + b'\xd0' + op(0x5D, 'setInterval') + b'\x40\0\x24\x0a'
                   + op(0x46, 'setInterval') + b'\x02' + op(0x68, 'openrotmgCameraTimer') + b'\x47')
    arities = [0, 1, 1, 1, 1, 0, 1, 1, 2, 0]
    methods = b''.join(u30(args) + u30(0 if index == 4 else qname['void']) + b'\0' * (args + 2) for index, args in enumerate(arities))
    globals_ = ['openrotmgCameraTimer', 'openrotmgMouseMap', 'openrotmgMoveGame', 'openrotmgMoving', 'openrotmgMoveAngle']
    traits = b''.join(u30(qname[name]) + b'\0' + u30(index + 1) + b'\0\0' for index, name in enumerate(globals_))

    def body(method, code, locals_, scope):
        return bytes([method, 9, locals_, scope, 1]) + u30(len(code)) + code + b'\0\0'

    bodies = [body(0, install.finish(), 2, 1), body(1, command.finish(), 4, 1), body(2, mouse_down.finish(), 3, 1),
              body(3, mouse_up.finish(), 3, 1), body(4, find.finish(), 4, 1), body(5, apply.finish(), 5, 1),
              body(6, late, 2, 1), body(7, text_input.finish(), 3, 1), body(8, dispatch, 3, 1), body(9, initializer, 1, 0)]
    return (struct.pack('<HH', 16, 46) + pool + u30(len(arities)) + methods + b'\0\0\x01\x09' + u30(len(globals_))
            + traits + u30(len(bodies)) + b''.join(bodies))


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
