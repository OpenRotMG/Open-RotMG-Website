import struct
from urllib.parse import urlsplit

from mobile_camera import u30


def read_u30(data, offset):
    value = 0
    for shift in range(0, 35, 7):
        byte = data[offset]
        offset += 1
        value |= (byte & 127) << shift
        if byte < 128:
            return value, offset
    raise ValueError('Invalid native client ABC integer')


def with_native_endpoints(source, api, site):
    endpoint = urlsplit(api)
    if endpoint.scheme not in ('http', 'https') or not endpoint.netloc or endpoint.path not in ('', '/') or endpoint.query or endpoint.fragment or endpoint.username:
        raise ValueError('Native client requires an API origin')
    replacements = {
        b'127.0.0.1:8080': (endpoint.netloc + '/legacy-api').encode(),
        b'http://': (endpoint.scheme + '://').encode(),
        b'realmofthemadgod.appspot.com': endpoint.netloc.encode(),
        b'/char': b'/native-char',
        b'RotMG': b'OpenRotMGOnline',
        b'AssembleeGameClientOptions': b'OpenRotMGOnlineOptions',
        b'/gold/': (site.rstrip('/') + '/gold/').encode(),
    }
    counts = dict.fromkeys(replacements, 0)
    if len(source) < 14 or source[:3] != b'FWS' or len(source) != int.from_bytes(source[4:8], 'little'):
        raise ValueError('Native client requires a validated uncompressed deployed movie')
    offset = 8 + (5 + 4 * (source[8] >> 3) + 7) // 8 + 4
    result = bytearray(source[:offset])
    while offset + 2 <= len(source):
        header = int.from_bytes(source[offset:offset + 2], 'little')
        tag, size = header >> 6, header & 63
        start = offset + 2
        if size == 63:
            size = int.from_bytes(source[start:start + 4], 'little')
            start += 4
        payload = source[start:start + size]
        if len(payload) != size:
            raise ValueError('Truncated native client tag')
        if tag == 82:
            abc_start = payload.index(b'\0', 4) + 1
            abc = payload[abc_start:]
            pos = 4
            for _ in range(2):
                count, pos = read_u30(abc, pos)
                for _ in range(1, count):
                    _, pos = read_u30(abc, pos)
            count, pos = read_u30(abc, pos)
            pos += max(0, count - 1) * 8
            count, end = read_u30(abc, pos)
            rebuilt = bytearray(abc[:end])
            pos = end
            for _ in range(1, count):
                length, pos = read_u30(abc, pos)
                value = abc[pos:pos + length]
                if len(value) != length:
                    raise ValueError('Truncated native client ABC string')
                pos += length
                if value in replacements:
                    counts[value] += 1
                    value = replacements[value]
                rebuilt.extend(u30(len(value)) + value)
            payload = payload[:abc_start] + rebuilt + abc[pos:]
        result.extend(struct.pack('<HI', (tag << 6) | 63, len(payload)) + payload)
        offset = start + size
    if offset != len(source) or any(count != 1 for count in counts.values()):
        raise ValueError(f'Unexpected native client endpoint layout: {counts}')
    result[4:8] = struct.pack('<I', len(result))
    return bytes(result)
