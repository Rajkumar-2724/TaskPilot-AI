#!/usr/bin/env python3
"""Parse PAIMANA Flash Report PDFs into a project-level dataset.

The New-Format Flash Reports (July 2025 onwards) contain an "All Ongoing
Projects" table with one row per project:

    Sl.No | Project Name (Agency) (Project Code) | State |
    Date of Approval (Start Date) | Original/Target DoC (Revised DoC) |
    Original Cost (Revised Cost) | Cumulative Expenditure | Physical Progress

This script extracts those rows for every available month into a longitudinal
record set (one row per project per report month), computes cost / time
overrun targets and engineer features that are known *as of the report date*.
It deliberately does NOT expose the "revised" values as features (that would
leak the targets).

Usage:
    python scripts/prepare_dataset.py
"""

import glob
import json
import os
import re
import sys
from datetime import date, datetime

import pdfplumber

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(HERE), "data")
RAW_DIR = os.path.join(DATA_DIR, "paimana", "raw")
OUT_DIR = os.path.join(DATA_DIR, "paimana")
os.makedirs(OUT_DIR, exist_ok=True)

MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11,
    "december": 12,
}


def report_month_from_filename(fname):
    m = re.search(r"_(january|february|march|april|may|june|july|august|september|october|november|december)[a-z]*[\s_]?(\d{4})?", fname, re.I)
    if not m:
        return None
    month = MONTH_MAP[m.group(1).lower()]
    year = int(m.group(2)) if m.group(2) else 2026
    return f"{year:04d}-{month:02d}"


def parse_mm_yyyy(text):
    """'12/2009' -> '2009-12'; 'N.A.'/'-'/'' -> None."""
    if not text:
        return None
    text = text.strip()
    m = re.search(r"(\d{1,2})/(\d{4})", text)
    if not m:
        return None
    return "%s-%02d" % (m.group(2), int(m.group(1)))


def parse_num(text):
    if text is None:
        return None
    text = text.replace(",", "").replace(" ", "").strip()
    if not text or text in ("-", "N.A.", "N.A", "NA", "--"):
        return None
    m = re.search(r"\d+\.?\d*", text)
    if not m:
        return None
    return float(m.group(0))


def month_diff(a, b):
    """Months between two 'YYYY-MM' strings (a - b)."""
    if not a or not b:
        return None
    ya, ma = map(int, a.split("-"))
    yb, mb = map(int, b.split("-"))
    return (ya - yb) * 12 + (ma - mb)


def split_pair(cell):
    """'(orig) (rev)' or 'orig\\n(rev)' -> (orig, rev)."""
    if cell is None:
        return None, None
    cell = cell.replace("\n", " ")
    m = re.search(r"(\S[\d,\.]*\s*)\s*(?:\(([^)]+)\))?\s*$", cell.strip())
    if not m:
        return parse_num(cell), None
    orig = parse_num(m.group(1))
    rev = parse_num(m.group(2))
    # if the whole cell was parenthetical only, take it as revised
    if orig is None and rev is None:
        return None, None
    return orig, rev


def split_date_pair(cell):
    """'12/2009\\n(06/2011)' or '12/2009 (06/2011)' -> ('2009-12', '2011-06')."""
    if cell is None:
        return None, None
    text = cell.replace("\n", " ")
    text = re.sub(r"\s+", " ", text.strip())
    if "(" in text:
        base = text.split("(")[0].strip()
        rev = text.split("(")[1].split(")")[0].strip()
        return parse_mm_yyyy(base), parse_mm_yyyy("(" + rev + ")")
    return parse_mm_yyyy(text), None


def project_id_from_cell(cell):
    """Extract (project_code, legacy_code) from the name/agency cell."""
    code = legacy = None
    codes = re.findall(r"\((N\d+)\)", cell)
    if codes:
        code = codes[-1]
    leg = re.findall(r"\((\d{6,})\)", cell)
    if leg:
        legacy = leg[-1]
    return code or legacy, code, legacy


def clean_name(cell):
    """Project name = lines preceding the agency block."""
    lines = [ln.strip() for ln in (cell or "").split("\n") if ln.strip()]
    name_lines = []
    for ln in lines:
        if ln.startswith("("):
            break
        name_lines.append(ln)
    return " ".join(name_lines).strip()


def parse_year_month(yrm):
    return datetime.strptime(yrm, "%Y-%m").date()


def is_data_row(row, offset):
    slcell = row[offset]
    if slcell is None:
        return False
    return re.match(r"^\s*\d+\s*$", slcell) is not None


def normalize_state(value):
    if not value:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    if value.startswith("Multi-") or value.startswith("PAN ") or value == "Offshore":
        return "Multi-States / Pan-India"
    return value


def extract_all_ongoing(pdf_path):
    """Extract records from 'All Ongoing Projects' tables in one PDF."""
    records = []
    sector = None
    ministry = None
    seen = set()
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables() or []
            for t in tables:
                if not t:
                    continue
                header = t[0]
                header_txt = " ".join(str(c) or "" for c in header)
                if "Physical Progress" not in header_txt or "Sl.No" not in header_txt:
                    # allow the offset variant where header shifts by one
                    if len(t) > 1:
                        header2 = " ".join(str(c) or "" for c in t[1])
                        if "Physical Progress" in header2 and "Sl.No" in header2:
                            t = t[1:]
                            header = t[0]
                            header_txt = header2
                        else:
                            continue
                    else:
                        continue
                # determine column offset: Sl.No may sit in col 0 or col 1
                idx = None
                for j, c in enumerate(header):
                    if c and "Sl.No" in str(c):
                        idx = j
                        break
                if idx is None:
                    continue
                for row in t[1:]:
                    if len(row) <= idx + 6:
                        continue
                    col = row[idx] if idx < len(row) else None
                    name_cell = row[idx + 1] if idx + 1 < len(row) else None
                    is_num = col is not None and re.match(r"^\s*\d+\s*$", str(col))
                    if not is_num:
                        # ministry / sector separator (header-like) row
                        joined = " ".join(str(c) or "" for c in row)
                        joined = re.sub(r"\s+", " ", joined).strip()
                        if re.search(r"\d", joined):
                            continue
                        if "Total" in joined:
                            continue
                        if not joined:
                            continue
                        # skip repeated column-header rows embedded in the table
                        look = joined.lower()
                        if any(w in look for w in ("sl.no", "physical progress",
                                                   "project name", "commissioning",
                                                   "approval", "expenditure")):
                            continue
                        # first non-empty text line becomes ministry or sector label
                        if name_cell and (str(name_cell).strip()):
                            label = re.sub(r"\s+", " ", str(name_cell)).strip()
                        else:
                            continue
                        if label.startswith("Ministry") or label.startswith("Department") or label.startswith("Ministr"):
                            ministry = label
                            sector = None
                        else:
                            sector = label
                        continue
                    sl = str(col).strip()
                    if sl in seen:
                        continue
                    seen.add(sl)

                    state = normalize_state(row[idx + 2] if idx + 2 < len(row) else None)
                    app_cell = row[idx + 3] if idx + 3 < len(row) else None
                    doc_cell = row[idx + 4] if idx + 4 < len(row) else None
                    cost_cell = row[idx + 5] if idx + 5 < len(row) else None
                    exp_cell = row[idx + 6] if idx + 6 < len(row) else None
                    prog_cell = row[idx + 7] if idx + 7 < len(row) else None

                    app_orig, app_rev = split_date_pair(app_cell)
                    doc_orig, doc_rev = split_date_pair(doc_cell)
                    cost_orig, cost_rev = split_pair(cost_cell)

                    code, code_n, legacy = project_id_from_cell(name_cell)
                    rec = {
                        "sl_no": int(sl),
                        "project_name": clean_name(name_cell),
                        "project_id": code,
                        "legacy_code": legacy,
                        "agency": None,
                        "state": state,
                        "sector": sector or ministry,
                        "ministry": ministry,
                        "approval_date_original": app_orig,
                        "approval_date_revised": app_rev,
                        "doc_original": doc_orig,
                        "doc_revised": doc_rev,
                        "cost_original": cost_orig,
                        "cost_revised": cost_rev,
                        "expenditure": parse_num(exp_cell),
                        "physical_progress": parse_num(prog_cell),
                    }
                    # agency from name cell
                    ag_lines = [ln.strip() for ln in (name_cell or "").split("\n") if ln.strip()]
                    agency = None
                    for ln in ag_lines:
                        if ln.startswith("(") and "N" not in ln[:2] and not re.match(r"^\(\d", ln):
                            if ")" in ln:
                                agency = ln.strip("()")
                                break
                    rec["agency"] = agency
                    records.append(rec)
    return records


def build_dataset():
    rows = []
    parse_log = []
    for path in sorted(glob.glob(os.path.join(RAW_DIR, "*.pdf"))):
        fname = os.path.basename(path)
        if "flash" not in fname:
            continue
        yrm = report_month_from_filename(fname)
        if yrm is None:
            parse_log.append({"file": fname, "status": "month-unknown"})
            continue
        recs = extract_all_ongoing(path)
        for r in recs:
            r["report_date"] = "%s-28" % yrm
            r["report_month"] = yrm
        rows.extend(recs)
        parse_log.append({"file": fname, "month": yrm, "rows": len(recs)})
        print("  %-42s %s  rows=%d" % (fname, yrm, len(recs)))

    dataset = []
    for r in rows:
        rec = dict(r)
        rec["cost_overrun_amt"] = None
        rec["cost_overrun_pct"] = None
        if rec["cost_revised"] is not None and rec["cost_original"] and rec["cost_original"] > 0:
            rec["cost_overrun_amt"] = rec["cost_revised"] - rec["cost_original"]
            rec["cost_overrun_pct"] = rec["cost_overrun_amt"] / rec["cost_original"] * 100.0
        rec["time_overrun_months"] = month_diff(rec["doc_revised"], rec["doc_original"])
        rec["original_duration_months"] = month_diff(rec["doc_original"], rec["approval_date_original"])
        if rec["report_date"] and rec["approval_date_original"]:
            rec["project_age_months"] = month_diff(rec["report_date"][:7], rec["approval_date_original"])
        else:
            rec["project_age_months"] = None
        if rec["expenditure"] is not None and rec["cost_original"]:
            rec["expenditure_ratio_orig"] = rec["expenditure"] / rec["cost_original"] * 100.0
        else:
            rec["expenditure_ratio_orig"] = None
        if rec["doc_original"] and rec["report_date"]:
            rec["months_remaining_original"] = month_diff(rec["doc_original"], rec["report_date"][:7])
        else:
            rec["months_remaining_original"] = None
        if rec["physical_progress"] is not None and rec["expenditure_ratio_orig"] is not None:
            rec["progress_minus_expenditure"] = rec["physical_progress"] - rec["expenditure_ratio_orig"]
        else:
            rec["progress_minus_expenditure"] = None
        dataset.append(rec)

    out_csv = os.path.join(OUT_DIR, "paimana_dataset.csv")
    cols = [
        "report_month", "report_date", "sl_no", "project_id", "legacy_code",
        "project_name", "agency", "state", "sector", "ministry",
        "approval_date_original", "approval_date_revised",
        "doc_original", "doc_revised", "cost_original", "cost_revised",
        "expenditure", "physical_progress",
        "original_duration_months", "project_age_months", "months_remaining_original",
        "expenditure_ratio_orig", "progress_minus_expenditure",
        "cost_overrun_amt", "cost_overrun_pct", "time_overrun_months",
    ]
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        import csv
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for rec in dataset:
            w.writerow({c: rec.get(c) for c in cols})

    meta = {
        "generatedAt": datetime.now().isoformat(),
        "source": "PAIMANA Monthly Flash Reports (https://paimana-proj.mospi.gov.in/ReportPage)",
        "parseLog": parse_log,
        "totalRecords": len(dataset),
        "rowsWithCostTarget": sum(1 for r in dataset if r["cost_overrun_pct"] is not None),
        "rowsWithTimeTarget": sum(1 for r in dataset if r["time_overrun_months"] is not None),
        "notes": [
            "Only reports with the new PAIMANA 'All Ongoing Projects' table are parsed (July 2025 onward).",
            "Rows are project-by-month snapshots (longitudinal).",
            "Targets use the latest sanctioned/estimated (revised) figures reported in the same month.",
            "Features never include revised_cost / revised_doc (would leak targets).",
        ],
    }
    with open(os.path.join(OUT_DIR, "paimana_dataset_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    print("\nWrote %d records to %s" % (len(dataset), out_csv))
    print("with cost target:", meta["rowsWithCostTarget"], " time target:", meta["rowsWithTimeTarget"])
    return dataset


if __name__ == "__main__":
    build_dataset()