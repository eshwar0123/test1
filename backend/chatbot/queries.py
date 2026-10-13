"""
Predefined safe database queries for the chatbot.
Each intent maps to a function that runs a parameterized SQL query.
"""

from datetime import datetime, timedelta


def execute_intent(conn, intent, params, user_id, role):
    """
    Execute the appropriate DB query for the given intent.
    Returns a response string for the chatbot.
    """
    handler = INTENT_HANDLERS.get(intent)
    if not handler:
        return None

    try:
        return handler(conn, params, user_id, role)
    except Exception as e:
        print(f"Query error for intent '{intent}': {e}")
        return f"Sorry, I encountered an error while fetching that information."


# ---------------------
# Greeting & Help
# ---------------------

def handle_greeting(conn, params, user_id, role):
    cursor = conn.cursor()
    name = "there"

    if role == "radiologist":
        cursor.execute(
            "SELECT first_name FROM radiology_schema.radiologists WHERE user_id = %s",
            (user_id,)
        )
        row = cursor.fetchone()
        if row and row[0]:
            name = f"Dr. {row[0]}"
    elif role == "organization":
        cursor.execute(
            "SELECT org_name FROM organization_schema.org_profile WHERE user_id = %s",
            (user_id,)
        )
        row = cursor.fetchone()
        if row and row[0]:
            name = row[0]

    cursor.close()
    return f"Hello {name}! I'm your Onix personal assistant. Ask me about your cases, reports, profile, or say 'help' to see what I can do."


def handle_help(conn, params, user_id, role):
    help_text = "Here's what I can help you with:\n\n"
    help_text += "📊 **Cases & Scans**\n"
    help_text += "  • How many cases today / this week / this month?\n"
    help_text += "  • Show recent cases\n"
    help_text += "  • Show pending cases\n\n"
    help_text += "📝 **Reports**\n"
    help_text += "  • How many reports today / this week?\n"
    help_text += "  • Show recent reports\n\n"
    help_text += "👤 **Profile**\n"
    help_text += "  • What is my name / email / qualification?\n"
    help_text += "  • Show my profile\n"
    help_text += "  • Setup my profile (guided form)\n\n"

    if role == "organization":
        help_text += "🏥 **Organization**\n"
        help_text += "  • Show organization info\n"
        help_text += "  • Setup organization profile\n\n"

    help_text += "Just type your question naturally!"
    return help_text


# ---------------------
# Case / Scan queries
# ---------------------

def handle_case_count_today(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM radiology_schema.rad_scans WHERE user_id = %s AND DATE(scan_date) = CURRENT_DATE",
        (user_id,)
    )
    count = cursor.fetchone()[0]
    cursor.close()
    return f"You have **{count}** case(s) today."


def handle_case_count_week(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM radiology_schema.rad_scans WHERE user_id = %s AND scan_date >= CURRENT_DATE - INTERVAL '7 days'",
        (user_id,)
    )
    count = cursor.fetchone()[0]
    cursor.close()
    return f"You have **{count}** case(s) this week."


def handle_case_count_month(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM radiology_schema.rad_scans WHERE user_id = %s AND scan_date >= DATE_TRUNC('month', CURRENT_DATE)",
        (user_id,)
    )
    count = cursor.fetchone()[0]
    cursor.close()
    return f"You have **{count}** case(s) this month."


def handle_case_count_total(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM radiology_schema.rad_scans WHERE user_id = %s",
        (user_id,)
    )
    count = cursor.fetchone()[0]
    cursor.close()
    return f"You have **{count}** total case(s)."


def handle_recent_cases(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        """SELECT case_id, patient_name, scan_type, scan_date
           FROM radiology_schema.rad_scans
           WHERE user_id = %s
           ORDER BY scan_date DESC
           LIMIT 10""",
        (user_id,)
    )
    rows = cursor.fetchall()
    cursor.close()

    if not rows:
        return "No cases found."

    lines = ["**Recent Cases:**\n"]
    for i, (case_id, patient, scan_type, date) in enumerate(rows, 1):
        date_str = date.strftime("%Y-%m-%d %H:%M") if date else "N/A"
        patient = patient or "Unknown"
        scan_type = scan_type or "N/A"
        lines.append(f"{i}. **{case_id}** — {patient} | {scan_type} | {date_str}")

    return "\n".join(lines)


def handle_pending_cases(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        """SELECT s.case_id, s.patient_name, s.scan_type, s.scan_date
           FROM radiology_schema.rad_scans s
           LEFT JOIN radiology_schema.reports r ON s.case_id = r.case_id AND r.user_id = %s
           WHERE s.user_id = %s AND r.report_id IS NULL
           ORDER BY s.scan_date DESC
           LIMIT 10""",
        (user_id, user_id)
    )
    rows = cursor.fetchall()
    cursor.close()

    if not rows:
        return "No pending cases. All cases have reports!"

    lines = [f"**{len(rows)} Pending Case(s):**\n"]
    for i, (case_id, patient, scan_type, date) in enumerate(rows, 1):
        date_str = date.strftime("%Y-%m-%d") if date else "N/A"
        patient = patient or "Unknown"
        lines.append(f"{i}. **{case_id}** — {patient} | {scan_type or 'N/A'} | {date_str}")

    return "\n".join(lines)


def handle_case_search(conn, params, user_id, role):
    field = params.get("field", "patient_name")
    search = params.get("search_term", "")
    if not search:
        return "Please specify what to search for."

    allowed_fields = {
        "patient_name": "patient_name",
        "scan_type": "scan_type",
        "modality": "scan_type",
        "case_id": "case_id",
    }
    db_field = allowed_fields.get(field, "patient_name")

    cursor = conn.cursor()
    cursor.execute(
        f"""SELECT case_id, patient_name, scan_type, scan_date
            FROM radiology_schema.rad_scans
            WHERE user_id = %s AND {db_field} ILIKE %s
            ORDER BY scan_date DESC LIMIT 10""",
        (user_id, f"%{search}%")
    )
    rows = cursor.fetchall()
    cursor.close()

    if not rows:
        return f"No cases found matching '{search}'."

    lines = [f"**Cases matching '{search}':**\n"]
    for i, (case_id, patient, scan_type, date) in enumerate(rows, 1):
        date_str = date.strftime("%Y-%m-%d") if date else "N/A"
        lines.append(f"{i}. **{case_id}** — {patient or 'Unknown'} | {scan_type or 'N/A'} | {date_str}")

    return "\n".join(lines)


# ---------------------
# Report queries
# ---------------------

def handle_report_count_today(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM radiology_schema.reports WHERE user_id = %s AND DATE(created_at) = CURRENT_DATE",
        (user_id,)
    )
    count = cursor.fetchone()[0]
    cursor.close()
    return f"You completed **{count}** report(s) today."


def handle_report_count_week(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM radiology_schema.reports WHERE user_id = %s AND created_at >= CURRENT_DATE - INTERVAL '7 days'",
        (user_id,)
    )
    count = cursor.fetchone()[0]
    cursor.close()
    return f"You completed **{count}** report(s) this week."


def handle_report_count_total(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT COUNT(*) FROM radiology_schema.reports WHERE user_id = %s",
        (user_id,)
    )
    count = cursor.fetchone()[0]
    cursor.close()
    return f"You have **{count}** total report(s)."


def handle_recent_reports(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        """SELECT case_id, patient_name, impression, created_at
           FROM radiology_schema.reports
           WHERE user_id = %s
           ORDER BY created_at DESC
           LIMIT 10""",
        (user_id,)
    )
    rows = cursor.fetchall()
    cursor.close()

    if not rows:
        return "No reports found."

    lines = ["**Recent Reports:**\n"]
    for i, (case_id, patient, impression, date) in enumerate(rows, 1):
        date_str = date.strftime("%Y-%m-%d %H:%M") if date else "N/A"
        imp_short = (impression[:60] + "...") if impression and len(impression) > 60 else (impression or "No impression")
        lines.append(f"{i}. **{case_id}** — {patient or 'Unknown'} | {imp_short} | {date_str}")

    return "\n".join(lines)


def handle_report_search(conn, params, user_id, role):
    field = params.get("field", "impression")
    search = params.get("search_term", "")
    if not search:
        return "Please specify what to search for in reports."

    allowed_fields = {
        "impression": "impression",
        "findings": "findings",
        "technique": "technique",
        "clinical_indication": "clinical_indication",
        "patient_name": "patient_name",
    }
    db_field = allowed_fields.get(field, "impression")

    cursor = conn.cursor()
    cursor.execute(
        f"""SELECT case_id, patient_name, {db_field}, created_at
            FROM radiology_schema.reports
            WHERE user_id = %s AND {db_field} ILIKE %s
            ORDER BY created_at DESC LIMIT 10""",
        (user_id, f"%{search}%")
    )
    rows = cursor.fetchall()
    cursor.close()

    if not rows:
        return f"No reports found with '{search}' in {field}."

    lines = [f"**Reports matching '{search}' in {field}:**\n"]
    for i, (case_id, patient, field_val, date) in enumerate(rows, 1):
        date_str = date.strftime("%Y-%m-%d") if date else "N/A"
        val_short = (field_val[:60] + "...") if field_val and len(field_val) > 60 else (field_val or "N/A")
        lines.append(f"{i}. **{case_id}** — {patient or 'Unknown'} | {val_short} | {date_str}")

    return "\n".join(lines)


# ---------------------
# Profile queries
# ---------------------

def handle_my_name(conn, params, user_id, role):
    cursor = conn.cursor()
    if role == "radiologist":
        cursor.execute(
            "SELECT first_name, last_name FROM radiology_schema.radiologists WHERE user_id = %s",
            (user_id,)
        )
        row = cursor.fetchone()
        cursor.close()
        if row and (row[0] or row[1]):
            return f"Your name is **Dr. {row[0] or ''} {row[1] or ''}**.".strip()
        return "Your name is not set yet. Say 'setup my profile' to get started."
    else:
        cursor.execute("SELECT username FROM core_schema.users WHERE user_id = %s", (user_id,))
        row = cursor.fetchone()
        cursor.close()
        if row and row[0]:
            return f"Your username is **{row[0]}**."
        return "Your name is not set."


def handle_my_email(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute("SELECT email FROM core_schema.users WHERE user_id = %s", (user_id,))
    row = cursor.fetchone()
    cursor.close()
    if row:
        return f"Your email is **{row[0]}**."
    return "Email not found."


def handle_my_qualification(conn, params, user_id, role):
    cursor = conn.cursor()
    cursor.execute(
        "SELECT qualification FROM radiology_schema.radiologists WHERE user_id = %s",
        (user_id,)
    )
    row = cursor.fetchone()
    cursor.close()
    if row and row[0]:
        return f"Your qualification is **{row[0]}**."
    return "Qualification not set. Say 'setup my profile' to add it."


def handle_my_profile(conn, params, user_id, role):
    cursor = conn.cursor()

    if role == "radiologist":
        cursor.execute(
            """SELECT first_name, last_name, email, qualification, designation,
                      user_lab_name, lab_address, department
               FROM radiology_schema.radiologists WHERE user_id = %s""",
            (user_id,)
        )
        row = cursor.fetchone()
        cursor.close()

        if not row:
            return "Profile not found. Say 'setup my profile' to create one."

        fields = [
            ("Name", f"Dr. {row[0] or ''} {row[1] or ''}".strip()),
            ("Email", row[2]),
            ("Qualification", row[3]),
            ("Designation", row[4]),
            ("Lab/Clinic", row[5]),
            ("Address", row[6]),
            ("Department", row[7]),
        ]

        lines = ["**Your Profile:**\n"]
        for label, value in fields:
            lines.append(f"• **{label}:** {value or 'Not set'}")

        return "\n".join(lines)

    elif role == "organization":
        cursor.execute(
            """SELECT org_name, org_type, email, contact_number, address,
                      npi, org_admin_name, profile_completed
               FROM organization_schema.org_profile WHERE user_id = %s""",
            (user_id,)
        )
        row = cursor.fetchone()
        cursor.close()

        if not row:
            return "Organization profile not found. Say 'setup organization' to create one."

        fields = [
            ("Organization", row[0]),
            ("Type", row[1]),
            ("Email", row[2]),
            ("Contact", row[3]),
            ("Address", row[4]),
            ("NPI", row[5]),
            ("Admin", row[6]),
            ("Completed", "Yes" if row[7] else "No"),
        ]

        lines = ["**Organization Profile:**\n"]
        for label, value in fields:
            lines.append(f"• **{label}:** {value or 'Not set'}")

        return "\n".join(lines)

    return "Profile not available."


def handle_org_info(conn, params, user_id, role):
    return handle_my_profile(conn, params, user_id, "organization")


# ---------------------
# Intent → Handler mapping
# ---------------------

INTENT_HANDLERS = {
    "greeting": handle_greeting,
    "help": handle_help,
    # Cases
    "case_count_today": handle_case_count_today,
    "case_count_week": handle_case_count_week,
    "case_count_month": handle_case_count_month,
    "case_count_total": handle_case_count_total,
    "recent_cases": handle_recent_cases,
    "pending_cases": handle_pending_cases,
    "case_search": handle_case_search,
    # Reports
    "report_count_today": handle_report_count_today,
    "report_count_week": handle_report_count_week,
    "report_count_total": handle_report_count_total,
    "recent_reports": handle_recent_reports,
    "report_search": handle_report_search,
    # Profile
    "my_name": handle_my_name,
    "my_email": handle_my_email,
    "my_qualification": handle_my_qualification,
    "my_profile": handle_my_profile,
    "org_info": handle_org_info,
}
