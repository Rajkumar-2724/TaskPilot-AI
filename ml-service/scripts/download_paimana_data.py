#!/usr/bin/env python3
"""Download PAIMANA (MoSPI) project-monitoring Flash Reports.

Source: https://paimana-proj.mospi.gov.in/ReportPage
The portal does not expose a CSV/XLSX download for project-level records. The
officially published project-level data is available inside the monthly
"Flash Report" PDFs published via the Report Archive endpoint
(``/ReportPage/Report`` -> ``ViewPdf`` links).

This script discovers the report listing from the *official* archive
interface and downloads the monthly Flash Report PDFs for the requested
financial years into ``ml-service/data/paimana/raw``.

Usage:
    python scripts/download_paimana_data.py [--years 2025-26] [--types F]
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
from datetime import datetime

BASE_URL = "https://paimana-proj.mospi.gov.in"
HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(HERE), "data")
RAW_DIR = os.path.join(DATA_DIR, "paimana", "raw")
META_FILE = os.path.join(DATA_DIR, "paimana", "download_manifest.json")

DEFAULT_YEARS = [
    "2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21",
    "2019-20", "2018-19", "2017-18", "2016-17", "2015-16", "2014-15",
    "2013-14", "2012-13", "2011-12", "2010-11", "2009-10", "2008-09",
    "2007-08", "2006-07", "2005-06", "2004-05", "2003-04", "2002-03",
    "2001-02",
]

# reportType: F = Monthly Flash Report, Q = Quarterly Report
REPORT_TYPES = {"F": "flash", "Q": "quarterly"}


def http_get(url, timeout=120, retries=3):
    last_err = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            resp = urllib.request.urlopen(req, timeout=timeout)
            return resp.read()
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(3 * (i + 1))
    raise last_err


def discover_report_links(years, types):
    """Return {year: {rtype: [absolute_pdf_url, ...]}} from the official archive UI."""
    result = {}
    for year in years:
        result[year] = {}
        for rtype in types:
            url = BASE_URL + "/ReportPage/Report?fyear=%s&month=0&quater=0&reportType=%s" % (
                urllib.parse.quote(year), rtype)
            body = http_get(url).decode("utf-8", "ignore")
            try:
                payload = json.loads(body)
                html = payload.get("html", "")
            except ValueError:
                html = body
            links = re.findall(r"href=[\"']([^\"']*(?:ViewPdf|\.pdf)[^\"']*)[\"']", html)
            clean = []
            for l in links:
                l = l.replace("../", "/").replace("..\\", "/").replace("\\", "/")
                if l.startswith("/"):
                    l = l[1:]
                clean.append(BASE_URL + "/" + l)
            result[year][rtype] = clean
            print("  %s %s -> %d PDFs" % (year, rtype, len(clean)))
            time.sleep(0.6)
    return result


def slugify(url):
    """Derive a readable filename from the ViewPdf 'path' query parameter."""
    query = urllib.parse.urlparse(url).query
    params = urllib.parse.parse_qs(query)
    path = params.get("path", [url])[0]
    base = os.path.basename(path.replace("\\", "/"))
    base = base if base else os.path.basename(url.split("?")[0])
    return re.sub(r"[^A-Za-z0-9._-]+", "_", base)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--years", nargs="*", default=DEFAULT_YEARS,
                    help="Financial years to download (default: all known).")
    ap.add_argument("--types", nargs="*", default=["F"],
                    choices=["F", "Q"], help="Report types: F flash, Q quarterly.")
    ap.add_argument("--limit", type=int, default=None,
                    help="Limit PDFs downloaded per year (debug).")
    args = ap.parse_args(argv)

    os.makedirs(RAW_DIR, exist_ok=True)
    print("Discovering report listings from", BASE_URL + "/ReportPage")
    links = discover_report_links(args.years, args.types)

    manifest = {"source": BASE_URL + "/ReportPage",
                "downloadedAt": datetime.now().isoformat(),
                "years": args.years,
                "reportTypes": args.types,
                "files": []}
    total = 0
    for year in args.years:
        for rtype in args.types:
            typ = REPORT_TYPES[rtype]
            url_list = links.get(year, {}).get(rtype, [])
            if args.limit:
                url_list = url_list[: args.limit]
            for url in url_list:
                fname = "%s__%s__%s" % (year, typ, slugify(url))
                path = os.path.join(RAW_DIR, fname)
                if os.path.exists(path) and os.path.getsize(path) > 100_000:
                    print("  skip (exists):", fname)
                else:
                    data = http_get(url)
                    with open(path, "wb") as f:
                        f.write(data)
                    print("  saved %s (%d bytes)" % (fname, len(data)))
                manifest["files"].append({
                    "file": fname,
                    "financialYear": year,
                    "reportType": typ,
                    "sourceUrl": url,
                    "size": os.path.getsize(path),
                })
                total += 1
    with open(META_FILE, "w") as f:
        json.dump(manifest, f, indent=2)
    print("\nDownloaded %d PDFs into %s" % (total, RAW_DIR))
    return 0


if __name__ == "__main__":
    sys.exit(main())