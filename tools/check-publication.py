"""Check the public Git file set without printing potentially sensitive values."""
import json
from pathlib import Path, PurePosixPath
import re
import subprocess

root = Path(__file__).resolve().parents[1]
names = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split(chr(0))
patterns = {
    'private-network-address': re.compile(r'(?<![\d.])(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(?![\d.])'),
    'device-mac-address': re.compile(r'(?i)(?<![\da-f])(?:[\da-f]{2}:){5}[\da-f]{2}(?![\da-f])'),
    'personal-windows-path': re.compile(r'(?i)[a-z]:[/\\]Users[/\\][^/\\\s]+'),
    'personal-unix-path': re.compile(r'/(?:Users|home)/[\w.-]+/'),
    'private-key': re.compile(r'-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----'),
    'github-token': re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'),
}
blocked_parts = {'.secrets', '.git', '.playwright-cli', 'node_modules', 'output', 'dist', 'ffmpeg-runtime', '__pycache__'}
blocked_suffixes = {'.enc', '.key', '.pem', '.p12', '.pfx', '.log', '.har', '.ipk', '.zip', '.tgz', '.wasm', '.a'}
findings = []
checked = 0
for name in filter(None, names):
    relative = PurePosixPath(name)
    if blocked_parts.intersection(relative.parts) or relative.suffix.lower() in blocked_suffixes or relative.name == '.env' or relative.name.startswith('.env.') and relative.name != '.env.example':
        findings.append({'file': name, 'rule': 'private-or-generated-file'})
        continue
    path = root / name
    if not path.is_file():
        findings.append({'file': name, 'rule': 'tracked-file-missing'})
        continue
    checked += 1
    if path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp', '.h264', '.h265'}:
        continue
    content = path.read_bytes()
    if b'\x00' in content:
        findings.append({'file': name, 'rule': 'unexpected-binary-file'})
        continue
    text = content.decode('utf-8-sig')
    for label, pattern in patterns.items():
        for match in pattern.finditer(text):
            findings.append({'file': name, 'line': text.count('\n', 0, match.start()) + 1, 'rule': label})
print(json.dumps({'checked_files': checked, 'findings': findings}, ensure_ascii=True))
raise SystemExit(1 if findings else 0)
