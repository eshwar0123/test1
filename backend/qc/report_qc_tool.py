#!/usr/bin/env python3
"""
ONIX Report QC Tool — Terminal CLI
====================================
Mirrors ReportQCTool.jsx — same 4 checks, same logic, same pass/error/warn levels.

Run:
    python report_qc_tool.py                 # interactive prompt
    python report_qc_tool.py --json          # JSON output mode
    python report_qc_tool.py --file report.json   # load from JSON file
    python report_qc_tool.py --demo          # run with demo data

Requirements: Python 3.8+  (no extra packages needed)
"""

import sys
import os
import json
import re
import argparse
from datetime import datetime, date

# ══════════════════════════════════════════════════════════
# COLOURS  (ANSI — auto-disabled if not a TTY)
# ══════════════════════════════════════════════════════════
USE_COLOR = hasattr(sys.stdout, "isatty") and sys.stdout.isatty()

def c(text, code): return f"\033[{code}m{text}\033[0m" if USE_COLOR else text

def red(t):    return c(t, "91")
def green(t):  return c(t, "92")
def yellow(t): return c(t, "93")
def blue(t):   return c(t, "94")
def bold(t):   return c(t, "1")
def dim(t):    return c(t, "2")
def cyan(t):   return c(t, "96")

GRP_LABELS = {
    "ID Check":      "ID Check     ",
    "Slice Check":   "Slice Check  ",
    "Content Check": "Content Check",
    "Pixel Check":   "Pixel Check  ",
}

# ══════════════════════════════════════════════════════════
# CHECK RESULT FACTORY  — mirrors mk()
# ══════════════════════════════════════════════════════════
class Check:
    def __init__(self, check, passed, severity, detail, value=None):
        self.check    = check
        self.passed   = passed
        self.severity = severity
        self.detail   = detail
        self.value    = value

    def group(self):
        for g in ("ID Check","Slice Check","Content Check","Pixel Check"):
            if self.check.startswith(g):
                return g
        return "Check"

    def short_name(self):
        return re.sub(r"^(ID|Slice|Content|Pixel) Check · ", "", self.check)

# ══════════════════════════════════════════════════════════
# CONSTANTS
# ══════════════════════════════════════════════════════════
PLACEHOLDERS = {
    "unknown","anon","anonymous","test","temp","patient","dummy",
    "n/a","na","-","none","pending","tbd","see above",
    "see impression","see findings","...","n.a",
}

VALID_MODALITIES = {
    "CT","MRI","MR","X-RAY","XR","CR","DR","DX","XRAY",
    "US","ULTRASOUND","PET","PET-CT","PET CT",
    "NM","NUCLEAR MEDICINE","MG","MAMMOGRAPHY","XA","RF","FLUOROSCOPY",
}
VALID_SEX      = {"M","F","MALE","FEMALE","OTHER"}

# ══════════════════════════════════════════════════════════
# CHECK 1 — ID CHECK   (Patient Identity)
# ══════════════════════════════════════════════════════════
def run_id_check(f):
    results = []

    pid    = f.get("patientId","").strip()
    pid_ok = bool(pid) and pid.lower() not in PLACEHOLDERS
    results.append(Check(
        "ID Check · Patient ID", pid_ok, "error",
        f'Patient ID: "{pid}"' if pid_ok
        else (f'Placeholder: "{pid}" — cannot link to patient' if pid
              else "Patient ID empty — hard block, report cannot be released"),
        pid or None))

    pname   = f.get("patientName","").strip()
    name_ok = bool(pname) and pname.lower() not in PLACEHOLDERS
    results.append(Check(
        "ID Check · Patient name", name_ok, "error",
        f'Patient name: "{pname}"' if name_ok
        else (f'Placeholder: "{pname}"' if pname
              else "Patient name empty — required for audit trail and delivery"),
        pname or None))

    age_raw = f.get("age","").strip()
    try:    age_ok = int(age_raw) > 0
    except: age_ok = False
    results.append(Check(
        "ID Check · Age / DOB", age_ok, "warning",
        f"Age: {age_raw} years — OK" if age_ok
        else (f'Invalid age: "{age_raw}"' if age_raw
              else "Age/DOB not provided — affects age-appropriate interpretation"),
        age_raw or None))

    sex    = f.get("sex","").strip().upper()
    sex_ok = sex in VALID_SEX
    results.append(Check(
        "ID Check · Sex / gender", sex_ok, "warning",
        f"Sex: {sex}" if sex_ok
        else (f'Unrecognised: "{sex}" — expected M / F / Other' if sex
              else "Sex not provided — affects normal range interpretation"),
        sex or None))

    return results

# ══════════════════════════════════════════════════════════
# CHECK 2 — SLICE CHECK   (Study Information)
# ══════════════════════════════════════════════════════════
def run_slice_check(f):
    results = []

    study_date = f.get("studyDate","").strip()
    date_ok = False; date_msg = ""
    if study_date:
        for fmt in ("%Y-%m-%d","%d/%m/%Y","%d-%m-%Y","%Y/%m/%d"):
            try:
                d = datetime.strptime(study_date, fmt).date()
                if d > date.today(): date_msg = f"Future date: {study_date} — scanner clock error?"
                elif d.year < 1950: date_msg = f"Implausibly old: {study_date}"
                else: date_ok = True; date_msg = f"Study date: {d.strftime('%d %b %Y')}"
                break
            except ValueError: continue
        if not date_ok and not date_msg:
            date_msg = f'Invalid format: "{study_date}" — use YYYY-MM-DD'
    else:
        date_msg = "Study date not provided — required for TAT and SLA audit"
    results.append(Check("Slice Check · Study date", date_ok, "error", date_msg, study_date or None))

    mod    = f.get("modality","").strip().upper()
    mod_ok = mod in VALID_MODALITIES
    results.append(Check(
        "Slice Check · Modality", mod_ok, "error",
        f"Modality: {mod}" if mod_ok
        else (f'Unrecognised: "{mod}" — expected CT/MRI/X-ray/US/PET' if mod
              else "Modality not specified — determines interpretation context"),
        mod or None))

    bp    = f.get("bodyPart","").strip()
    bp_ok = bool(bp) and bp.lower() not in PLACEHOLDERS
    results.append(Check(
        "Slice Check · Body part / region", bp_ok, "error",
        f'Body part: "{bp}"' if bp_ok
        else (f'Placeholder: "{bp}"' if bp else "Body part not specified — must match ordered scan"),
        bp or None))

    ind    = f.get("clinicalIndication","").strip()
    ind_ok = len(ind) >= 5 and ind.lower() not in PLACEHOLDERS
    results.append(Check(
        "Slice Check · Clinical indication", ind_ok, "error",
        f'Indication: "{ind}"' if ind_ok
        else (f'Too short: "{ind}" — must be a meaningful clinical reason' if ind and len(ind) < 5
              else (f'Placeholder: "{ind}"' if ind
                    else "Clinical indication empty — reason for scan not documented")),
        ind or None))

    return results

# ══════════════════════════════════════════════════════════
# CHECK 3 — CONTENT CHECK   (Report Content)
# ══════════════════════════════════════════════════════════
def run_content_check(f):
    results = []

    technique = f.get("technique","").strip()
    tech_ok   = len(technique) >= 5 and technique.lower() not in PLACEHOLDERS
    results.append(Check(
        "Content Check · Technique / protocol", tech_ok, "warning",
        f'Technique: "{technique[:80]}{"…" if len(technique)>80 else ""}"' if tech_ok
        else (f'Too short/placeholder: "{technique}"' if technique
              else "Technique not documented — slice thickness and sequences should be noted"),
        f"{len(technique)} chars" if technique else None))

    findings = f.get("findings","").strip()
    find_ok  = len(findings) >= 20 and findings.lower() not in PLACEHOLDERS
    results.append(Check(
        "Content Check · Findings", find_ok, "error",
        f"Findings filled — {len(findings)} characters" if find_ok
        else (f"Too brief: only {len(findings)} chars — detailed description required"
              if findings and len(findings) < 20
              else (f'Placeholder: "{findings}"' if findings
                    else "Findings section empty — hard block, report cannot be released")),
        f"{len(findings)} chars" if findings else None))

    impression = f.get("impression","").strip()
    imp_ok     = len(impression) >= 10 and impression.lower() not in PLACEHOLDERS
    results.append(Check(
        "Content Check · Impression / conclusion", imp_ok, "error",
        f"Impression filled — {len(impression)} characters" if imp_ok
        else (f"Too brief: only {len(impression)} chars — complete clinical summary required"
              if impression and len(impression) < 10
              else (f'Placeholder: "{impression}"' if impression
                    else "Impression empty — most read section by clinicians, hard block")),
        f"{len(impression)} chars" if impression else None))

    rec = f.get("recommendation","").strip()
    results.append(Check(
        "Content Check · Recommendation", bool(rec), "warning",
        f'Recommendation: "{rec[:80]}{"…" if len(rec)>80 else ""}"' if rec
        else "No follow-up recommendation — good practice to guide referring doctor",
        f"{len(rec)} chars" if rec else None))

    return results

# ══════════════════════════════════════════════════════════
# CHECK 4 — PIXEL CHECK   (Sign-off & Legal)
# ══════════════════════════════════════════════════════════
def run_pixel_check(f):
    results = []

    rad_name  = f.get("radiologistName","").strip()
    has_creds = bool(re.search(r'\b(MD|MBBS|DNB|FRCR|DMRD|DA|Dr\.)\b', rad_name, re.IGNORECASE))
    rad_ok    = len(rad_name) > 5 and has_creds
    results.append(Check(
        "Pixel Check · Radiologist name & credentials", rad_ok, "error",
        f'Radiologist: "{rad_name}"' if rad_ok
        else (f'Credentials missing: "{rad_name}" — add MBBS/MD/DNB' if rad_name and not has_creds
              else (f'Name too short: "{rad_name}"' if rad_name
                    else "Radiologist name and credentials not provided — legally required")),
        rad_name or None))

    esig   = f.get("eSigned","").strip().lower()
    sig_ok = esig in ("yes","signed","true","1")
    results.append(Check(
        "Pixel Check · Electronic signature", sig_ok, "error",
        "Electronically signed — legally valid" if sig_ok
        else (f'Unrecognised: "{esig}" — must be Yes/Signed' if esig
              else "Not signed — e-signature required. Cannot release unsigned."),
        esig or None))

    rep_date = f.get("reportDate","").strip()
    rep_ok = False; rep_msg = ""
    if rep_date:
        for fmt in ("%Y-%m-%dT%H:%M","%Y-%m-%d %H:%M","%Y-%m-%d","%d/%m/%Y"):
            try:
                d = datetime.strptime(rep_date, fmt)
                if d > datetime.now(): rep_msg = f"Future date: {rep_date} — system clock error?"
                elif d.year < 2000:   rep_msg = f"Implausibly old: {rep_date}"
                else: rep_ok = True;  rep_msg = f"Report date/time: {d.strftime('%d %b %Y %H:%M')}"
                break
            except ValueError: continue
        if not rep_ok and not rep_msg:
            rep_msg = f'Invalid format: "{rep_date}" — use YYYY-MM-DD HH:MM'
    else:
        rep_msg = "Report date/time not recorded — required for TAT and SLA audit"
    results.append(Check("Pixel Check · Report date & time", rep_ok, "error", rep_msg, rep_date or None))

    ref    = f.get("referringDoctor","").strip()
    ref_ok = bool(ref) and ref.lower() not in PLACEHOLDERS
    results.append(Check(
        "Pixel Check · Referring doctor & facility", ref_ok, "error",
        f'Referring doctor: "{ref}"' if ref_ok
        else (f'Placeholder: "{ref}"' if ref
              else "Referring doctor not provided — determines delivery destination"),
        ref or None))

    return results

# ══════════════════════════════════════════════════════════
# Run all 4 checks
# ══════════════════════════════════════════════════════════
def run_all_checks(fields):
    return (
        run_id_check(fields)      +
        run_slice_check(fields)   +
        run_content_check(fields) +
        run_pixel_check(fields)
    )

# ══════════════════════════════════════════════════════════
# DISPLAY
# ══════════════════════════════════════════════════════════
W = 72

def div(ch="─"): print(dim(ch * W))

def print_check(chk: Check):
    grp = GRP_LABELS.get(chk.group(), "Check       ")
    if chk.passed:           status_str = green("✓ pass ")
    elif chk.severity=="error":   status_str = red("✗ error")
    elif chk.severity=="warning": status_str = yellow("⚠ warn ")
    else:                         status_str = blue("ℹ info ")

    if "ID Check"      in chk.group(): grp_col = blue(grp)
    elif "Slice"       in chk.group(): grp_col = cyan(grp)
    elif "Content"     in chk.group(): grp_col = green(grp)
    else:                              grp_col = yellow(grp)

    print(f"  {grp_col}  {status_str}  {bold(chk.short_name())}")
    # Wrap long detail lines
    detail = chk.detail
    wrap   = W - 30
    while len(detail) > wrap:
        print(f"  {' '*30}{dim(detail[:wrap])}")
        detail = detail[wrap:]
    print(f"  {' '*30}{dim(detail)}")
    if chk.value:
        print(f"  {' '*30}{dim('value: ')}{dim(str(chk.value))}")

def print_summary_bar(checks):
    groups = ["ID Check","Slice Check","Content Check","Pixel Check"]
    parts  = []
    for g in groups:
        gc    = [c for c in checks if c.check.startswith(g)]
        h_err = any(not c.passed and c.severity=="error"   for c in gc)
        h_wrn = any(not c.passed and c.severity=="warning" for c in gc)
        short = g.split()[0]
        if h_err:       parts.append(red(f"[{short} ✗]"))
        elif h_wrn:     parts.append(yellow(f"[{short} !]"))
        else:           parts.append(green(f"[{short} ✓]"))
    print("  " + "  ".join(parts))

def print_results(checks):
    errors   = [c for c in checks if not c.passed and c.severity=="error"]
    warnings = [c for c in checks if not c.passed and c.severity=="warning"]
    status   = "FAIL" if errors else ("WARN" if warnings else "PASS")

    print(); div("═")
    print(bold("  ONIX  QC · Report Validation — Results"))
    div("═"); print()

    print_summary_bar(checks); print(); div()

    cur_grp = None
    for i, chk in enumerate(checks):
        g = chk.group()
        if g != cur_grp:
            cur_grp = g; print()
            labels = {"ID Check": blue("  ── ID Check · Patient Identity ─────────────"),
                      "Slice Check": cyan("  ── Slice Check · Study Information ──────────"),
                      "Content Check": green("  ── Content Check · Report Content ────────────"),
                      "Pixel Check": yellow("  ── Pixel Check · Sign-off & Legal ────────────")}
            print(labels.get(g, f"  ── {g}"))
        print_check(chk)
        if i < len(checks) - 1: print(dim("  " + "·"*68))

    print(); div("═")

    total  = len(checks)
    passed = len([c for c in checks if c.passed])
    if status == "PASS":
        print(green(bold(f"  ✓  ALL CHECKS PASSED ({passed}/{total})")))
        print(green("     Report cleared — can be released to referring doctor"))
    elif status == "WARN":
        print(yellow(bold(f"  ⚠  {len(warnings)} WARNING(S)  ·  {passed}/{total} checks passed")))
        print(yellow("     Report can release — admin should review flagged fields"))
    else:
        print(red(bold(f"  ✗  {len(errors)} ERROR(S)  ·  {len(warnings)} WARNING(S)  ·  {passed}/{total} passed")))
        print(red("     REPORT BLOCKED — fix all errors before releasing"))
    div("═"); print()

    if errors:
        print(red(bold("  Errors to fix:")))
        for e in errors:
            print(red(f"    ✗  [{e.group().split()[0]}] {e.short_name()}"))
            print(red(f"       {e.detail}"))
        print()
    if warnings:
        print(yellow(bold("  Warnings to review:")))
        for w in warnings:
            print(yellow(f"    ⚠  [{w.group().split()[0]}] {w.short_name()}"))
            print(yellow(f"       {w.detail}"))
        print()

# ══════════════════════════════════════════════════════════
# INTERACTIVE INPUT
# ══════════════════════════════════════════════════════════
def ask(label, hint="", default=""):
    if hint: print(dim(f"  → {hint}"))
    sfx = f" [{default}]" if default else ""
    val = input(f"  {bold(label)}{sfx}: ").strip()
    return val if val else default

def ask_multi(label, hint=""):
    if hint: print(dim(f"  → {hint}"))
    print(f"  {bold(label)} (blank line to finish):")
    lines = []
    while True:
        line = input("  │ ")
        if not line and lines: break
        lines.append(line)
    return "\n".join(lines)

def section(title, color_fn):
    print(); print(color_fn(bold(f"  ── {title} ─────────────────────────────────────────────"))); print()

def run_interactive():
    print(); div("═")
    print(bold("  ONIX QC · Report Validation Tool — Interactive"))
    print(dim("  Checks: ID Check · Slice Check · Content Check · Pixel Check"))
    div("═"); print()

    f = {}

    section("CHECK 1 — ID Check · Patient Identity", blue)
    f["patientId"]   = ask("Patient ID",   "Must match DICOM tag (0010,0020) and Excel record")
    f["patientName"] = ask("Patient name", "Full name as in referral form")
    f["age"]         = ask("Age (years)",  "Number — e.g. 53")
    print(dim("  → Options: M / F / Other"))
    f["sex"]         = ask("Sex")

    section("CHECK 2 — Slice Check · Study Information", cyan)
    f["studyDate"]   = ask("Study date",   "YYYY-MM-DD  e.g. 2026-04-16")
    print(dim("  → Options: CT / MRI / X-RAY / US / PET-CT / MG / NM"))
    f["modality"]    = ask("Modality")
    f["bodyPart"]    = ask("Body part",    "e.g. Brain, Chest, Abdomen, Knee")
    f["clinicalIndication"] = ask("Clinical indication", '"Rule out PE" / "Follow-up mass"')

    section("CHECK 3 — Content Check · Report Content", green)
    f["technique"]      = ask("Technique / protocol", "Sequences, slices, phases (leave blank to skip)")
    f["findings"]       = ask_multi("Findings",   "Detailed description, min 20 characters")
    f["impression"]     = ask_multi("Impression", "Clinical summary, min 10 characters")
    f["recommendation"] = ask("Recommendation",       "e.g. Repeat CT in 3 months (blank if none)")

    section("CHECK 4 — Pixel Check · Sign-off & Legal", yellow)
    f["radiologistName"]  = ask("Radiologist name & credentials", "Full name + MBBS/MD/DNB")
    print(dim("  → Type 'yes' if report has been electronically signed"))
    f["eSigned"]          = ask("Electronically signed", "yes / no")
    f["reportDate"]       = ask("Report date & time",    "YYYY-MM-DD HH:MM  e.g. 2026-04-16 14:32")
    f["referringDoctor"]  = ask("Referring doctor & facility", "e.g. Dr. P. Suresh — Apollo Hospital")

    print_results(run_all_checks(f))

# ══════════════════════════════════════════════════════════
# DEMO DATA  (intentional errors for testing)
# ══════════════════════════════════════════════════════════
DEMO = {
    "patientId":          "APL-2024-001",
    "patientName":        "Rajan Kumar",
    "age":                "53",
    "sex":                "M",
    "studyDate":          "2026-04-16",
    "modality":           "CT",
    "bodyPart":           "Abdomen",
    "clinicalIndication": "",                  # ← intentionally empty → error
    "technique":          "",                  # ← missing → warning
    "findings":           (
        "Liver shows a hypodense mass in segment VI measuring 4.2 cm. "
        "There is associated arterial enhancement and washout on portal venous phase. "
        "No ascites. Spleen, pancreas, kidneys are normal."
    ),
    "impression":         (
        "Hepatocellular carcinoma segment VI — 4.2 cm. "
        "Recommend urgent MDT review and staging MRI."
    ),
    "recommendation":     "Urgent MDT review. Staging MRI liver.",
    "radiologistName":    "Dr. Rajesh Menon MD DNB Radiology",
    "eSigned":            "yes",
    "reportDate":         "2026-04-16 14:32",
    "referringDoctor":    "Dr. P. Suresh — Apollo Hospital Chennai",
}

# ══════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════
def main():
    parser = argparse.ArgumentParser(
        prog="report_qc_tool.py",
        description="ONIX Report QC Tool — validates radiology report fields (4 checks)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python report_qc_tool.py                 → interactive prompt (default)
  python report_qc_tool.py --demo          → run with demo data (shows errors)
  python report_qc_tool.py --file r.json   → load fields from JSON file
  python report_qc_tool.py --json          → JSON output (pipe-friendly)

Minimal JSON format:
  {
    "patientId": "APL-2024-001",  "patientName": "Rajan Kumar",
    "age": "53",  "sex": "M",  "studyDate": "2026-04-16",
    "modality": "CT",  "bodyPart": "Abdomen",
    "clinicalIndication": "Follow-up hepatic mass",
    "technique": "CECT 3-phase",  "findings": "...",  "impression": "...",
    "recommendation": "",
    "radiologistName": "Dr. R. Menon MD",  "eSigned": "yes",
    "reportDate": "2026-04-16 14:32",  "referringDoctor": "Dr. P. Suresh — Apollo"
  }
        """,
    )
    parser.add_argument("--demo", action="store_true", help="Run with built-in demo data (shows intentional errors)")
    parser.add_argument("--json", action="store_true", help="Output results as JSON")
    parser.add_argument("--file", type=str,            help="Path to JSON file with report fields")
    args = parser.parse_args()

    try:
        if args.demo:
            if args.json:
                output_json(DEMO)
            else:
                print(); div("═")
                print(bold("  ONIX QC · Report Validation — DEMO"))
                print(dim("  Intentional errors: clinical indication empty, critical flag not raised"))
                div("═")
                print_results(run_all_checks(DEMO))

        elif args.file:
            with open(args.file) as fh:
                fields = json.load(fh)
            if args.json:
                output_json(fields)
            else:
                print(bold(f"\n  Loaded: {args.file}"))
                print_results(run_all_checks(fields))

        elif args.json:
            print("Paste JSON fields (empty line to run):"); lines=[]
            while True:
                line=input()
                if not line.strip(): break
                lines.append(line)
            output_json(json.loads("\n".join(lines)))

        else:
            run_interactive()

    except KeyboardInterrupt:
        print("\n\n  Cancelled.")
        sys.exit(0)
    except FileNotFoundError as e:
        print(red(f"\n  File not found: {e}")); sys.exit(1)
    except json.JSONDecodeError as e:
        print(red(f"\n  Invalid JSON: {e}")); sys.exit(1)


def output_json(fields):
    checks = run_all_checks(fields)
    errors   = [c for c in checks if not c.passed and c.severity=="error"]
    warnings = [c for c in checks if not c.passed and c.severity=="warning"]
    print(json.dumps({
        "status":   "fail" if errors else "warn" if warnings else "pass",
        "errors":   len(errors),
        "warnings": len(warnings),
        "passed":   len([c for c in checks if c.passed]),
        "total":    len(checks),
        "checks": [{
            "check":    c.check, "group": c.group(),
            "passed":   c.passed, "severity": c.severity,
            "detail":   c.detail, "value":   c.value,
        } for c in checks],
    }, indent=2))


if __name__ == "__main__":
    main()
