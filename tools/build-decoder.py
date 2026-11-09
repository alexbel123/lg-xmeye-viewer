"""Build scalar/SIMD decoders from pinned source, on Linux or Windows/WSL."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def fetch_sources():
    lock = json.loads((ROOT / 'decoder/dependencies.json').read_text())
    cache = ROOT / 'output/decoder-sources'
    cache.mkdir(parents=True, exist_ok=True)
    for source in lock.values():
        destination = cache / source['archive']
        if not destination.exists():
            bundled = ROOT / 'third_party' / source['archive']
            if bundled.exists():
                data = bundled.read_bytes()
            else:
                with urllib.request.urlopen(source['url'], timeout=30) as response:
                    data = response.read(64 * 1024 * 1024 + 1)
            if len(data) > 64 * 1024 * 1024 or hashlib.sha256(data).hexdigest() != source['sha256']:
                raise RuntimeError('Source download checksum mismatch: ' + source['archive'])
            destination.write_bytes(data)
        if digest(destination) != source['sha256']:
            raise RuntimeError('Source archive checksum mismatch: ' + source['archive'])
    return lock, cache


def extract(archive, destination):
    destination.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as bundle:
        members = bundle.getmembers()
        for member in members:
            member.name = '/'.join(member.name.split('/')[1:])
            if not member.name:
                continue
            target = (destination / member.name).resolve()
            if not target.is_relative_to(destination.resolve()) or not (member.isfile() or member.isdir()):
                raise RuntimeError('Unsafe source archive member')
            bundle.extract(member, destination, filter='data')


def verify_runtime_sources(archive, sdk):
    """Verify code shipped in the SDK against the separately supplied source."""
    with tarfile.open(archive) as bundle:
        code = {}
        for member in bundle.getmembers():
            name = '/'.join(member.name.split('/')[1:])
            if member.isfile() and name.startswith(('src/', 'system/lib/')):
                code[name] = member
        checked = 0
        for directory in ['src', 'system/lib']:
            for path in (sdk / 'upstream/emscripten' / directory).rglob('*'):
                if not path.is_file() or path.suffix not in {'.c', '.h', '.js', '.cpp', '.cc', '.S', '.s', '.py'}:
                    continue
                name = path.relative_to(sdk / 'upstream/emscripten').as_posix()
                if name not in code or hashlib.sha256(bundle.extractfile(code[name]).read()).hexdigest() != digest(path):
                    raise RuntimeError('SDK runtime source mismatch: ' + name)
                checked += 1
        if checked < 100:
            raise RuntimeError('Incomplete SDK runtime source check')
        return checked


def build(args):
    if sys.version_info < (3, 12):
        raise RuntimeError('Source builds require Python 3.12+ on Linux/WSL')
    lock, cache = fetch_sources()
    work = Path(os.environ.get('VIEWER_DECODER_CACHE', '/var/tmp')) / ('lg-xmeye-decoder-' + lock['ffmpeg']['version'] + '-' + lock['emsdk']['version'])
    work.mkdir(parents=True, exist_ok=True)
    sdk = Path(args.sdk_dir).resolve() if args.sdk_dir else work / 'emsdk'
    if not (sdk / 'emsdk').exists():
        extract(cache / lock['emsdk']['archive'], sdk)
    if not (sdk / 'upstream/emscripten/emcc').exists():
        subprocess.run([str(sdk / 'emsdk'), 'install', lock['emsdk']['version']], cwd=sdk, check=True)
    subprocess.run([str(sdk / 'emsdk'), 'activate', lock['emsdk']['version']], cwd=sdk, check=True, stdout=subprocess.DEVNULL)
    environment = json.loads(subprocess.check_output([
        'bash', '-c', 'source "$1/emsdk_env.sh" >/dev/null 2>&1; python3 -c "import json,os;print(json.dumps(dict(os.environ)))"',
        'decoder-sdk-env', str(sdk)
    ]))
    compiler = subprocess.check_output(['emcc', '--version'], env=environment, text=True).splitlines()[0]
    if lock['emsdk']['version'] not in compiler:
        raise RuntimeError('Unexpected Emscripten version: ' + compiler)
    runtime_files = verify_runtime_sources(cache / lock['emscripten']['archive'], sdk)
    source = work / 'ffmpeg'
    if not (source / 'configure').exists():
        extract(cache / lock['ffmpeg']['archive'], source)
    adapter = work / 'viewer_decoder.c'
    shutil.copyfile(ROOT / 'decoder/viewer_decoder.c', adapter)
    output = ROOT / 'app/vendor/decoder'
    output.mkdir(parents=True, exist_ok=True)
    provenance = {'format': 1, 'ffmpeg': lock['ffmpeg'], 'emsdk': lock['emsdk'], 'emscripten': lock['emscripten'], 'compiler': compiler, 'runtime_source_files_verified': runtime_files,
                  'adapter_sha256': digest(adapter), 'builder_sha256': digest(Path(__file__)), 'variants': {}}
    for variant in ['scalar', 'simd']:
        directory = work / variant
        directory.mkdir(exist_ok=True)
        cflags = '-O3 -DNDEBUG -fno-ident -ffile-prefix-map=' + str(work) + '=/decoder-build -fmacro-prefix-map=' + str(work) + '=/decoder-build'
        if variant == 'simd':
            cflags += ' -msimd128'
        options = [
            '--arch=wasm32', '--cpu=generic', '--target-os=none', '--enable-cross-compile',
            '--cc=emcc', '--cxx=em++', '--ar=emar', '--ranlib=emranlib', '--nm=emnm',
            '--disable-stripping', '--disable-everything', '--disable-autodetect',
            '--disable-programs', '--disable-doc', '--disable-network', '--disable-debug',
            '--disable-avdevice', '--disable-avformat', '--disable-avfilter', '--disable-swresample', '--disable-swscale',
            '--disable-pthreads', '--disable-w32threads', '--disable-os2threads',
            '--disable-x86asm', '--disable-inline-asm', '--disable-runtime-cpudetect',
            '--disable-gpl', '--disable-nonfree', '--disable-version3',
            '--enable-avcodec', '--enable-avutil', '--enable-decoder=h264,hevc', '--enable-parser=h264,hevc',
            '--extra-cflags=' + cflags,
        ]
        if variant == 'scalar':
            options.append('--disable-simd128')
        print('Configuring ' + variant, flush=True)
        subprocess.run([str(source / 'configure'), *options], cwd=directory, env=environment, check=True)
        subprocess.run(['make', '-j' + str(args.jobs), 'libavcodec/libavcodec.a', 'libavutil/libavutil.a'], cwd=directory, env=environment, check=True)
        name = 'videodec_simd' if variant == 'simd' else 'videodec'
        artifact = directory / (name + '.js')
        link = [
            'emcc', str(adapter), '-I' + str(source), '-I' + str(directory),
            '-Wl,--start-group', str(directory / 'libavcodec/libavcodec.a'), str(directory / 'libavutil/libavutil.a'), '-Wl,--end-group',
            '-O3', '-g0', '-fno-ident', '-ffile-prefix-map=' + str(work) + '=/decoder-build',
            '-sMODULARIZE=1', '-sEXPORT_NAME=createVideoDecoder', '-sENVIRONMENT=worker,node',
            '-sFILESYSTEM=0', '-sALLOW_MEMORY_GROWTH=1', '-sINITIAL_MEMORY=33554432', '-sMAXIMUM_MEMORY=268435456',
            '-sSTACK_SIZE=1048576', '-sASSERTIONS=0', '-sMIN_CHROME_VERSION=87', '-sMIN_FIREFOX_VERSION=78', '-sMIN_SAFARI_VERSION=140000',
            '-sEXPORTED_FUNCTIONS=' + json.dumps(['_viewer_create', '_viewer_decode', '_viewer_flush', '_viewer_destroy', '_viewer_error', '_malloc', '_free']),
            '-sEXPORTED_RUNTIME_METHODS=' + json.dumps(['HEAPU8', 'UTF8ToString']),
            '-o', str(artifact)
        ]
        if variant == 'simd':
            link.insert(1, '-msimd128')
        subprocess.run(link, cwd=directory, env=environment, check=True)
        for extension in ['.js', '.wasm']:
            shutil.copyfile(directory / (name + extension), output / (name + extension))
        provenance['variants'][variant] = {
            'configure': options,
            'configuration_sha256': digest(directory / 'config.h'),
            'loader_sha256': digest(output / (name + '.js')),
            'wasm_sha256': digest(output / (name + '.wasm')),
            'wasm_bytes': (output / (name + '.wasm')).stat().st_size,
        }
    for origin, name in [
        (source / 'COPYING.LGPLv2.1', 'COPYING.FFMPEG.LGPLv2.1'),
        (sdk / 'upstream/emscripten/LICENSE', 'COPYING.EMSCRIPTEN'),
        (sdk / 'upstream/emscripten/system/lib/libc/musl/COPYRIGHT', 'COPYING.MUSL'),
    ]:
        license_path = ROOT / 'decoder' / name
        shutil.copyfile(origin, license_path)
        shutil.copyfile(license_path, output / name)
    (output / 'build-manifest.json').write_text(json.dumps(provenance, indent=2) + '\n')
    print(json.dumps({'decoder_build': 'passed', 'variants': provenance['variants']}, indent=2), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk-dir', help='Existing Linux Emscripten SDK directory')
    parser.add_argument('--jobs', type=int, default=min(8, os.cpu_count() or 2))
    parser.add_argument('--fetch-only', action='store_true')
    options = parser.parse_args()
    if options.fetch_only:
        fetch_sources()
    elif sys.platform == 'win32':
        distro = os.environ.get('VIEWER_WSL_DISTRO', 'Ubuntu')
        linux_root = subprocess.check_output(['wsl', '-d', distro, '--exec', 'wslpath', '-a', ROOT.as_posix()], text=True).strip()
        command = ['wsl', '-d', distro, '--exec', 'python3', linux_root + '/tools/build-decoder.py', '--jobs', str(options.jobs)]
        if options.sdk_dir:
            command += ['--sdk-dir', options.sdk_dir]
        subprocess.run(command, check=True)
    else:
        build(options)
