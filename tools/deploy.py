#!/usr/bin/python3 -I
import ctypes
import fcntl
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

LIVE = Path('/opt/openrotmg/site')
STATE = Path('/var/lib/openrotmg-site-deploy')
LOCK = Path('/run/lock/openrotmg-deploy.lock')
REPO = 'https://github.com/OpenRotMG/Open-RotMG-Website.git'
ORIGIN = 'https://openrotmg.org/'
LIMIT = 32 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def files(root):
    require(not any(p.is_symlink() for p in root.rglob('*')), 'Website tree contains a symlink')
    return {str(p.relative_to(root)): digest(p.read_bytes()) for p in root.rglob('*') if p.is_file()}


def atomic(path, data):
    temporary = path.with_name(path.name + '.new')
    with temporary.open('wb') as output:
        output.write(data)
        output.flush()
        os.fsync(output.fileno())
    temporary.chmod(0o644)
    temporary.replace(path)
    fd = os.open(path.parent, os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def payload(raw, revision):
    require(len(raw) <= LIMIT, 'Website archive exceeds 32 MiB')
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as compressed:
        expanded = compressed.read(LIMIT + 1)
    require(len(expanded) <= LIMIT, 'Website archive expanded content exceeds 32 MiB')
    with tarfile.open(fileobj=io.BytesIO(expanded), mode='r:') as archive:
        result = {}
        size = 0
        for entry in archive:
            path = PurePosixPath(entry.name)
            require(entry.isfile() and not path.is_absolute() and '..' not in path.parts
                    and str(path) == entry.name and entry.name not in result,
                    'Unsafe or duplicate website archive path: ' + entry.name)
            size += entry.size
            require(size <= LIMIT and len(result) < 2048, 'Website archive content exceeds limits')
            result[entry.name] = archive.extractfile(entry).read()
    metadata = json.loads(result.pop('metadata.json'))
    require(set(metadata) == {'revision', 'manifest'} and metadata['revision'] == revision, 'Website revision mismatch')
    manifest = metadata['manifest']
    require(set(result) == {'site/' + name for name in manifest}, 'Website archive manifest paths differ')
    site = {name: result['site/' + name] for name in manifest}
    require({n: digest(d) for n, d in site.items()} == manifest, 'Website archive checksum mismatch')
    require({'index.html', '404.html', 'game.js', 'diagnostics-build.json', '.nojekyll'} <= site.keys(), 'Incomplete website build')
    build = json.loads(site['diagnostics-build.json'])
    require(build['website'] == revision and build['dirty'] is False, 'Website build provenance mismatch')
    return site, manifest


def current_main(revision):
    actual = subprocess.check_output(['git', 'ls-remote', '--exit-code', REPO, 'refs/heads/main'], text=True, timeout=30).split()[0]
    require(actual == revision, 'Main advanced; refusing to publish stale website ' + revision)


def exchange(stage):
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.renameat2(-100, os.fsencode(LIVE), -100, os.fsencode(stage), 2):
        code = ctypes.get_errno()
        raise OSError(code, os.strerror(code))


def verify_public(manifest):
    def verify(name):
        request = urllib.request.Request(ORIGIN + name, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response:
            require(digest(response.read(LIMIT + 1)) == manifest[name], 'Public website checksum mismatch: ' + name)
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(verify, manifest))


def deploy(revision, raw):
    site, manifest = payload(raw, revision)
    current_main(revision)
    before = files(LIVE)
    require(before == json.loads(LIVE.with_suffix('.sha256.json').read_text()), 'Live website differs from its recorded manifest; inspect before deploying')
    prior = LIVE.with_suffix('.REVISION').read_text().strip()
    STATE.mkdir(mode=0o700, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix=revision + '-', dir=STATE))
    stage = LIVE.with_name('site-stage-' + work.name)
    status = {'revision': revision, 'prior_revision': prior, 'recovery': str(work), 'state': 'staging'}
    try:
        require(shutil.disk_usage(LIVE.parent).free >= 2 * 1024**3, 'Less than 2 GiB free; retained recovery data needs review')
        stage.mkdir(mode=0o755)
        stage.chmod(0o755)
        for name, data in site.items():
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        for path in stage.rglob('*'):
            path.chmod(0o755 if path.is_dir() else 0o644)
        require(files(stage) == manifest, 'Staged website differs from archive')
        (work / 'previous-metadata.json').write_text(json.dumps({'revision': prior, 'manifest': before}))
        current_main(revision)
        # Never restart game services or execute code from the incoming static archive.
        exchange(stage)
        status.update(state='activated_unverified', previous_site=str(stage))
        atomic(LIVE.with_suffix('.REVISION'), (revision + '\n').encode())
        atomic(LIVE.with_suffix('.sha256.json'), json.dumps(manifest, sort_keys=True).encode())
        verify_public(manifest)
        status.update(state='deployed', files=len(manifest), changed=sorted(n for n in before.keys() | manifest.keys() if before.get(n) != manifest.get(n)))
    except Exception as error:
        status['error'] = str(error)
        raise
    finally:
        status['checked_at'] = int(time.time())
        (work / 'receipt.json').write_text(json.dumps(status, indent=2))
        atomic(STATE / 'status.json', json.dumps(status).encode())
        print(json.dumps(status), flush=True)


def main():
    os.umask(0o077)
    require(len(sys.argv) == 2 and re.fullmatch('[0-9a-f]{40}', sys.argv[1]), 'Only an exact website commit SHA is accepted')
    raw = sys.stdin.buffer.read(LIMIT + 1)
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        deploy(sys.argv[1], raw)


if __name__ == '__main__':
    main()
