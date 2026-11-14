import hashlib
import io
import json
from pathlib import Path
import shlex
import tarfile
from urllib.request import urlopen
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

from native_client import with_native_endpoints

RUFFLE_VERSION = '0.7.1-openrotmg.16'
RUFFLE_URL = f'https://github.com/OpenRotMG/Open-RotMG-Client/releases/download/desktop-{RUFFLE_VERSION}/ruffle-linux-x64.tar.gz'
RUFFLE_SHA256 = '511ff464234a3e37e3f2a6ab6fa26f565bc5983eaa8bec23102c44893aa510f1'


def build_downloads(root, source, api, site, identity, fetch=urlopen):
    movie = with_native_endpoints(source, api, site)
    with fetch(RUFFLE_URL, timeout=60) as response:
        runtime = response.read(32 * 1024 * 1024 + 1)
    if hashlib.sha256(runtime).hexdigest() != RUFFLE_SHA256:
        raise ValueError('Desktop Ruffle archive checksum mismatch')
    with tarfile.open(fileobj=io.BytesIO(runtime), mode='r:gz') as archive:
        files = {}
        for name in ['ruffle', 'LICENSE.md', 'README.md', 'openrotmg.json']:
            entry = archive.getmember(name)
            if not entry.isfile() or entry.size > 64 * 1024 * 1024:
                raise ValueError('Invalid desktop Ruffle archive member: ' + name)
            files[name] = archive.extractfile(entry).read()
    provenance = json.loads(files['openrotmg.json'])
    if provenance['version'] != RUFFLE_VERSION:
        raise ValueError('Desktop Ruffle provenance version mismatch')
    files['COPYING-client.txt'] = (Path(__file__).resolve().parents[1] / 'LICENSE').read_bytes()
    files['client.swf'] = movie
    files['Open RotMG.sh'] = (
        '#!/bin/sh\nset -eu\ncd -- "$(dirname -- "$0")"\n'
        f'exec ./ruffle --socket-allow {shlex.quote(identity["native_host"] + ":2050")} client.swf\n'
    ).encode()
    files['READ ME.txt'] = (
        'Open RotMG (online)\n\nRun Open RotMG.sh. An internet connection is required.\n'
        'Requires Linux x64 with glibc 2.39 or newer.\n'
        'Sign in with your existing online account. This is not the offline edition.\n'
        'If launch fails, run the script from a terminal to see the error.\n\n'
        f'Includes Open RotMG Ruffle {RUFFLE_VERSION}. Its licenses are in LICENSE.md.\n'
        f'Ruffle source and patches: https://github.com/OpenRotMG/Open-RotMG-Client/tree/{provenance["client"]}\n'
        'Exact Ruffle source and patch hashes: openrotmg.json\n'
        'Client source: https://github.com/OpenRotMG/Open-RotMG-Client\n'
        f'Server/client transforms: https://github.com/OpenRotMG/Open-RotMG-Server/tree/{identity["server"]}\n'
        f'Download transform: https://github.com/OpenRotMG/Open-RotMG-Website/tree/{identity["website"]}\n'
        'Client license: COPYING-client.txt\n'
    ).encode()
    receipt = {**identity, 'ruffle': RUFFLE_VERSION, 'ruffle_archive_sha256': RUFFLE_SHA256,
               'swf_sha256': hashlib.sha256(movie).hexdigest()}
    files['build.json'] = (json.dumps(receipt, indent=2) + '\n').encode()
    root.mkdir(parents=True, exist_ok=True)
    (root / 'openrotmg.swf').write_bytes(movie)
    with ZipFile(root / 'openrotmg-linux-x64.zip', 'w', compression=ZIP_DEFLATED) as archive:
        for name, data in sorted(files.items()):
            entry = ZipInfo('Open RotMG/' + name, (2026, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = (0o100755 if name in ['ruffle', 'Open RotMG.sh'] else 0o100644) << 16
            entry.compress_type = ZIP_DEFLATED
            archive.writestr(entry, data)
    (root / 'build.json').write_bytes(files['build.json'])
    (root / 'SHA256SUMS').write_text(''.join(
        hashlib.sha256((root / name).read_bytes()).hexdigest() + '  ' + name + '\n'
        for name in ['openrotmg.swf', 'openrotmg-linux-x64.zip']))
    return receipt
