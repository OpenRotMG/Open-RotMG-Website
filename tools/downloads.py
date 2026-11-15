import hashlib

from native_client import with_native_endpoints


def build_downloads(root, source, api, site):
    movie = with_native_endpoints(source, api, site)
    root.mkdir(parents=True, exist_ok=True)
    (root / 'openrotmg.swf').write_bytes(movie)
    return {'swf_sha256': hashlib.sha256(movie).hexdigest()}
