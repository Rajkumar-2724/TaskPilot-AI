#!/usr/bin/env python3
"""Run the complete PAIMANA ML pipeline: download -> prepare -> train -> evaluate.

Usage:
    python scripts/run_pipeline.py --years 2025-26 --quick
"""

import argparse
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def run(name, extra=None):
    print("\n" + "=" * 70)
    print("STEP:", name)
    print("=" * 70)
    t0 = time.time()
    cmd = [sys.executable, os.path.join(HERE, name)] + (extra or [])
    rc = subprocess.call(cmd, cwd=os.path.dirname(HERE))
    print("finished in %.1fs rc=%d" % (time.time() - t0, rc))
    if rc != 0:
        print("ABORTED at:", name)
        sys.exit(rc)
    return rc


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="*", default=["2025-26"])
    ap.add_argument("--quick", action="store_true")
    ap.add_argument("--skip-download", action="store_true")
    args = ap.parse_args()

    if not args.skip_download:
        yargs = []
        for y in args.years:
            yargs += ["--years", y]
        run("download_paimana_data.py", yargs)
    run("prepare_dataset.py")
    train_args = ["--quick"] if args.quick else []
    run("train_models.py", train_args)
    run("evaluate_models.py")
    print("\nPipeline complete. Models under ml-service/models/paimana/")
    return 0


if __name__ == "__main__":
    sys.exit(main())