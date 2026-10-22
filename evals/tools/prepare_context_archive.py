#!/usr/bin/env python3
"""Prepare an isolated contextual eval archive; logs stay in evals/private."""
import argparse
from contextlib import closing
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
from datetime import datetime


def main():
    root = Path.home() / 'Library/Application Support/Rewind'
    repo = Path(__file__).resolve().parents[2]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=root / 'eval-memory')
    parser.add_argument('--output', type=Path, default=root / 'eval-memory-context-haiku')
    parser.add_argument('--endpoint', default='https://openrouter.ai/api/v1/chat/completions')
    args = parser.parse_args()
    if args.endpoint != 'https://openrouter.ai/api/v1/chat/completions':
        parser.error('Haiku preparation requires the official OpenRouter endpoint')
    source, output = args.source.resolve(), args.output.resolve()
    # Restrict this helper to the two authorized eval archives, including resolved symlinks.
    if source != root / 'eval-memory' or output != root / 'eval-memory-context-haiku':
        parser.error('only eval-memory -> eval-memory-context-haiku is permitted')
    marker = output / '.rewind-context-eval-copy'
    if output.exists():
        if not marker.is_file() or (output / '.rewind-context-eval-ready').exists():
            parser.error('output exists and is not a marked unfinished context copy')
    else:
        output.mkdir(mode=0o700)
        try:
            with closing(sqlite3.connect((source / 'memory.sqlite3').as_uri() + '?mode=ro', uri=True)) as src:
                with closing(sqlite3.connect(output / 'memory.sqlite3')) as dst:
                    src.backup(dst)
            os.chmod(output / 'memory.sqlite3', 0o600)
            if (source / 'captures.jsonl').is_file():
                shutil.copy2(source / 'captures.jsonl', output / 'captures.jsonl')
                os.chmod(output / 'captures.jsonl', 0o600)
            marker.write_text('Isolated copy for contextual retrieval evaluation.\n')
        except BaseException:
            shutil.rmtree(output)
            raise
    env = os.environ.copy()
    env.update(REWIND_CONTEXT_ENABLED='1', REWIND_CONTEXT_STRICT='1',
               REWIND_CONTEXT_PROVIDER='openrouter',
               REWIND_CONTEXT_MODEL='anthropic/claude-haiku-4.5',
               REWIND_CONTEXT_MAX_TOKENS='160', REWIND_CONTEXT_URL=args.endpoint)
    env.update(RAYON_NUM_THREADS='2', OMP_NUM_THREADS='2', TOKENIZERS_PARALLELISM='false')
    env.setdefault('REWIND_MODEL_DIR', str(root / 'local-memory/models/1e5a03f8eeb2c98b928fbbd846f22f816360919f'))
    logs = repo / 'evals/private'
    logs.mkdir(exist_ok=True)
    log = logs / f'context-generation_{datetime.now():%Y%m%d-%H%M%S}.log'
    with log.open('x') as stream:
        os.chmod(log, 0o600)
        result = subprocess.run([str(repo / 'target/release/rewind'), 'prepare-context-eval', str(output)], env=env, stdout=stream, stderr=subprocess.STDOUT)
    print(f'Generation log: {log}', flush=True)
    if result.returncode:
        raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
