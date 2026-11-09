"""Compatibility entry point for the source-built decoder installer."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('download-decoder.py')), run_name='__main__')
