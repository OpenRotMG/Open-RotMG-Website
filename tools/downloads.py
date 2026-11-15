import hashlib
import json

from native_client import with_native_endpoints


def build_downloads(root, source, api, site, identity):
    movie = with_native_endpoints(source, api, site)
    receipt = {**identity, 'swf_sha256': hashlib.sha256(movie).hexdigest()}
    root.mkdir(parents=True, exist_ok=True)
    (root / 'openrotmg.swf').write_bytes(movie)
    (root / 'build.json').write_text(json.dumps(receipt, indent=2) + '\n')
    (root / 'SHA256SUMS').write_text(receipt['swf_sha256'] + '  openrotmg.swf\n')
    return receipt
