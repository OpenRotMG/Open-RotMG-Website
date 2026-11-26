"""Read the existing production-closure inspection; never execute native case modules."""
import hashlib
import json
import posixpath
import re
import subprocess
import sys
import xml.etree.ElementTree as xml
from functools import cache
from pathlib import Path

GAME = 'game/123.5.1/game.xml'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False).encode()).hexdigest()


def node(element):
    return [element.tag, element.attrib, (element.text or '').strip(), [node(c) for c in element]]


def shared_manifest(game):
    return [game.attrib, [node(e) for e in game if e.tag not in {'World', 'PortalRoute', 'Root', 'RealmRules', 'LandmarkChest'}]]


def snapshots(read, report, target):
    @cache
    def snapshot(revision, fingerprint):
        inputs = report['inputs']
        manifest = read(revision, 'data/' + GAME)
        # Reuse compiler edges for older data only when every other compiler input is identical.
        # The manifest's World and PortalRoute rows are resolved independently below.
        if digest([1, {**inputs, GAME: hashlib.sha256(manifest).hexdigest()}]) != fingerprint:
            return None
        game = xml.fromstring(manifest)
        if shared_manifest(game) != target:
            return None
        return game, {w.attrib['id']: w for w in game.findall('World')}
    return snapshot


def closure(read, revision, report):
    def checked(file):
        value = read(revision, 'data/' + file)
        if hashlib.sha256(value).hexdigest() != report['inputs'][file]:
            raise ValueError(f'Compiler input does not match {revision}: {file}')
        return xml.fromstring(value)

    manifest = checked(GAME)
    prefix = posixpath.dirname(GAME) + '/'
    definitions, properties = report['definitions'], report['properties']
    actors, lists = {}, []
    geometry = {}
    for entry in manifest:
        if entry.tag == 'Include':
            root = checked(prefix + entry.attrib['file'])
            if root.tag == 'Objects':
                actors.update((int(o.attrib['type'], 16), node(o)) for o in root)
            elif root.tag == 'StringLists':
                lists.extend(root)
            else:
                raise ValueError(f'Unexpected Include: {root.tag}')
        if entry.tag == 'Geometry':
            geometry.update((e.get('name') or e.attrib['id'], node(e))
                            for e in checked(prefix + entry.attrib['file']))
        elif entry.tag == 'Map':
            geometry[entry.attrib['name']] = node(entry)
    maps = report['maps']
    names = {p['name']: int(kind) for kind, p in properties.items()}
    map_indices = {m['name']: i for i, m in enumerate(maps)}

    @cache
    def object_links(kind):
        key = str(kind)
        actor = definitions.get(key, {})
        fields = [f for s in actor.get('states', []) for b in s['behaviors'] for f in b['fields'].values()]
        return ([properties[key], actors.get(kind), [node(lists[f['StringList']]) for f in fields if 'StringList' in f]],
                set(actor.get('dependencies', [])) | set(report['property_dependencies'][key]),
                [f['Map'] for f in fields if 'Map' in f])

    @cache
    def map_links(index):
        entry = maps[index]
        tag, shape = next(iter(entry['geometry'].items()))
        if tag == 'Pool':
            deps, assets = shape['entries'], {}
        elif tag == 'Generator':
            deps = [v['template'] for room in shape['rooms'] if isinstance(room['shape'], dict)
                    for v in room['shape'].get('Templates', [])]
            assets = {}
        elif tag == 'Reconstruction':
            deps, assets = [], shape['input_sha256']
        elif tag == 'Encoded':
            deps, assets = [], (shape.get('elevation') or {}).get('input_sha256', {})
            assets = {**assets, shape['file']: shape['sha256']}
        elif tag == 'Template':
            deps, assets = [], {}
        else:
            raise ValueError(f'Unexpected compiled map type: {tag}')
        return [geometry[entry['name']], assets], entry['objects'], deps

    world_object_fields = {
        'Population': ('object',), 'Instance': ('entrance',), 'Clear': ('boss', 'portal', 'reveal', 'retire'),
        'CornerPlacement': ('object',), 'Unlock': ('item', 'locked', 'opened'), 'RequiredActor': ('object',),
        'CoilPlacement': (), 'Visibility': (), 'AllowTeleport': (), 'SummonLimit': (), 'UsesBreath': (),
        'HelloNotification': (), 'Background': (), 'Difficulty': (),
    }
    destinations = {'nexus': ('nexus',), 'origin-realm': ('realm',), 'random-realm': ('realm',),
                    'named-realm': ('realm',), 'fresh-kitchen': ('kitchen',), 'owned-vault': ('vault',),
                    'guild-hall': tuple(f'guild-hall-{i}' for i in range(1, 5)), 'locked': ()}

    def fingerprint(game, worlds, case, env):
        # Numeric handles are the native fixture's Directory ids; named worlds also appear as templates/display names.
        handles = {-4: 'nexus-limbo', -3: 'realm', -2: 'nexus', -1: 'tutorial', 1: 'realm', 2: 'realm'}
        text = '\n'.join([*case.values(), *(str(v) for group in env.values() for v in group.values())])
        tokens = {t for match in re.findall(r'''"([^"\n]*)"|'([^'\n]*)'|`([^`\n]*)`''', text) for t in match if t}
        lowered = {t.lower() for t in tokens}
        world_ids = {name for name in worlds if name in tokens or name.replace('-', ' ').lower() in lowered}
        world_ids.update(id for id, w in worlds.items() if any(x.get('name') in tokens for x in w.findall('Instance')))
        if 'realm-shore' in tokens:
            world_ids.add('realm')
        if 'guild-hall' in tokens:
            world_ids.update(w for w in worlds if w.startswith('guild-hall-'))
        world_ids.update(handles[int(n)] for n in re.findall(r'\bworld\s*:\s*(-?\d+)\b', text) if int(n) in handles)
        direct = {int(n, 16) for n in re.findall(r'\b0[xX][0-9a-fA-F]+\b', text)} | {int(n) for n in re.findall(r'\b[1-9]\d{2,4}\b', text)}
        direct.update(names[t] for t in tokens if t in names)
        direct.intersection_update(map(int, properties))
        routes = []
        for route in game.findall('PortalRoute'):
            dest = route.attrib['destination']
            if dest not in destinations:
                raise ValueError(f'Unclassified PortalRoute destination: {dest}')
            routes.append((names[route.attrib['object']], route, destinations[dest]))
        routes.extend((names[i.attrib['entrance']], i, (id,)) for id, w in worlds.items() for i in w.findall('Instance'))
        for kind, route, targets in routes:
            scopes = [route.attrib['from']] if 'from' in route.attrib else route.attrib['except'].split(',') if 'except' in route.attrib else []
            if missing := (set(targets) | set(scopes)) - worlds.keys():
                raise ValueError(f'Unresolved Worlds {sorted(missing)} for route object {kind:#x}')
        # Cases with no identifiable starting world cannot justify excluding a world.
        world_ids = world_ids or set(worlds)
        # Do not match stored carry digests made before the route closure was complete.
        scoped = {'schema': 2, 'case': case, 'env': env, 'grounds': report['inputs']['grounds.xml'],
                  'manifest': shared_manifest(game)}
        objects, pending_maps = set(direct), []

        def references(element, attrs):
            return {names[n.attrib[key]] for n in element.iter() for key in attrs if key in n.attrib}

        def include_world(id):
            world = worlds[id]
            scoped['world:' + id] = node(world)
            pending_maps.append(map_indices[world.attrib['map']])
            for child in world:
                if child.tag not in world_object_fields:
                    raise ValueError(f'Unclassified World {id} child: {child.tag}')
                objects.update(references(child, world_object_fields[child.tag]))
            if id == 'realm':
                realm = game.find('RealmRules')
                scoped['realm-rules'] = node(realm)
                objects.update(references(realm, ('root', 'parent', 'child', 'object', 'anchor', 'defender')))
                for key, definition in definitions.items():
                    population = definition.get('population')
                    if population and properties[key]['enemy'] and population['terrain'] is not None and (
                        population['weight'] or 0
                    ) > 0 and population['per_world_max'] is None:
                        objects.add(int(key))
                for chest in game.findall('LandmarkChest'):
                    scoped['chest:' + chest.attrib['landmark']] = node(chest)
                    objects.update(references(chest, ('landmark', 'container', 'platform')))
                if game.findall('LandmarkChest'):
                    # The inspection does not export compiled landmark chest tier pools.
                    scoped['landmark-loot-pool'] = {k: p for k, p in properties.items() if p['tier'] is not None}
        pending_worlds = world_ids
        while True:
            for id in sorted(pending_worlds):
                include_world(id)
            while objects or pending_maps:
                while pending_maps:
                    index = pending_maps.pop()
                    key = 'map:' + maps[index]['name']
                    if key not in scoped:
                        scoped[key], kinds, extra_maps = map_links(index)
                        objects.update(kinds)
                        pending_maps.extend(extra_maps)
                if objects:
                    kind = objects.pop()
                    key = f'object:{kind}'
                    if key not in scoped:
                        scoped[key], children, extra_maps = object_links(kind)
                        objects.update(children)
                        pending_maps.extend(extra_maps)
            applicable = []
            pending_worlds = set()
            for kind, route, targets in routes:
                if f'object:{kind}' in scoped and any(
                    route.get('from', w) == w and w not in route.get('except', '').split(',') for w in world_ids
                ):
                    applicable.append((kind, route))
                    pending_worlds.update(targets)
            pending_worlds.difference_update(world_ids)
            if not pending_worlds:
                break
            world_ids.update(pending_worlds)
        for kind, route in applicable:
            scoped.setdefault(f'route:{kind}', []).append(node(route))
        scoped['admission'] = sorted(r.attrib['object'] for r in game.findall('Root')
                                     if f"object:{names[r.attrib['object']]}" in scoped)
        return digest(scoped)
    return fingerprint


def main():
    repo, path = sys.argv[1:]
    revision, expected, requests = json.load(sys.stdin)
    report = json.loads(Path(path).read_bytes())
    if report['fingerprint'] != expected:
        raise ValueError('Compiler inspection must match the target data fingerprint')

    @cache
    def read(rev, file):
        if not re.fullmatch('[0-9a-f]{40}', rev):
            raise ValueError(f'Not a committed server revision: {rev}')
        return subprocess.check_output(['git', '-C', repo, 'show', f'{rev}:{file}'])

    @cache
    def case(rev, file):
        source = read(rev, file).decode()
        sources = {file: source}
        for child in re.findall(r'''(?:\bfrom\s*|\bimport\s*\(?\s*)["'](\.{1,2}/[^"']+\.mjs)["']''', source):
            path = posixpath.normpath(posixpath.join(posixpath.dirname(file), child))
            if path.startswith(('scripts/cases/', 'examples/testing/')):
                sources.update(case(rev, path))
        return sources

    snapshot = snapshots(read, report, shared_manifest(xml.fromstring(read(revision, 'data/' + GAME))))
    fingerprint = closure(read, revision, report)
    target = snapshot(revision, expected)
    if target is None:
        raise ValueError('Compiler input hashes do not reproduce target GameData fingerprint')
    out = {}
    for name, file, env, captured_revision, captured_fingerprint in requests:
        prior = snapshot(captured_revision, captured_fingerprint)
        # Changed non-manifest inputs need an existing scoped capture hash or a fresh native run.
        out[name] = [fingerprint(*target, case(revision, file), env),
                     fingerprint(*prior, case(captured_revision, file), env) if prior else None]
    print(json.dumps(out))


if __name__ == '__main__':
    main()
