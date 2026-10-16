#!/usr/bin/env python3
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import tarfile


def package(root, revision, output):
    root = Path(root)
    if not re.fullmatch('[0-9a-f]{40}', revision) or any(p.is_symlink() for p in root.rglob('*')):
        raise ValueError('Invalid revision or symlink in website build')
    files = {str(p.relative_to(root)): p.read_bytes() for p in sorted(root.rglob('*')) if p.is_file()}
    build = json.loads(files['diagnostics-build.json'])
    if build['website'] != revision or build['dirty'] is not False:
        raise ValueError('Website build does not match the clean source revision')
    metadata = {'revision': revision, 'manifest': {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}}
    with tarfile.open(output, 'w:gz') as archive:
        for name, data in {'metadata.json': json.dumps(metadata).encode(), **{'site/' + n: d for n, d in files.items()}}.items():
            entry = tarfile.TarInfo(name)
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))


if __name__ == '__main__':
    package(*sys.argv[1:])
