"""
Full AI chatbot engine — every message goes through Gemma 3 27B.
The model gets real DB data as context and responds naturally.
"""

import os
import json
from huggingface_hub import InferenceClient

HF_MODEL = "google/gemma-3-27b-it"

# In-memory conversation history per user (last 10 messages)
_conversations = {}

# In-memory form sessions
_form_sessions = {}


def get_user_context(conn, user_id, role):
    """Fetch real data from DB to give the AI context about the user."""
    context = {}
    cursor = conn.cursor()

    try:
        # Basic user info
        cursor.execute("SELECT email, username, role FROM core_schema.users WHERE user_id = %s", (str(user_id),))
        row = cursor.fetchone()
        if row:
            context["email"] = row[0]
            context["username"] = row[1]
            context["role"] = row[2]

        if role == "radiologist":
            # Profile
            cursor.execute(
                """SELECT first_name, last_name, qualification, designation,
                          user_lab_name, lab_address, department
                   FROM radiology_schema.radiologists WHERE user_id = %s""",
                (str(user_id),)
            )
            row = cursor.fetchone()
            if row:
                context["profile"] = {
                    "first_name": row[0], "last_name": row[1],
                    "qualification": row[2], "designation": row[3],
                    "lab_name": row[4], "lab_address": row[5], "department": row[6],
                }

            # Case stats
            cursor.execute("SELECT COUNT(*) FROM radiology_schema.rad_scans WHERE user_id = %s AND DATE(scan_date) = CURRENT_DATE", (str(user_id),))
            context["cases_today"] = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM radiology_schema.rad_scans WHERE user_id = %s AND scan_date >= CURRENT_DATE - INTERVAL '7 days'", (str(user_id),))
            context["cases_this_week"] = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM radiology_schema.rad_scans WHERE user_id = %s AND scan_date >= DATE_TRUNC('month', CURRENT_DATE)", (str(user_id),))
            context["cases_this_month"] = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM radiology_schema.rad_scans WHERE user_id = %s", (str(user_id),))
            context["cases_total"] = cursor.fetchone()[0]

            # Report stats
            cursor.execute("SELECT COUNT(*) FROM radiology_schema.reports WHERE user_id = %s AND DATE(created_at) = CURRENT_DATE", (str(user_id),))
            context["reports_today"] = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM radiology_schema.reports WHERE user_id = %s AND created_at >= CURRENT_DATE - INTERVAL '7 days'", (str(user_id),))
            context["reports_this_week"] = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM radiology_schema.reports WHERE user_id = %s", (str(user_id),))
            context["reports_total"] = cursor.fetchone()[0]

            # Pending cases (scans without reports)
            cursor.execute(
                """SELECT COUNT(*) FROM radiology_schema.rad_scans s
                   LEFT JOIN radiology_schema.reports r ON s.case_id = r.case_id AND r.user_id = %s
                   WHERE s.user_id = %s AND r.report_id IS NULL""",
                (str(user_id), str(user_id))
            )
            context["pending_cases"] = cursor.fetchone()[0]

            # Recent cases (last 5)
            cursor.execute(
                """SELECT case_id, patient_name, scan_type, patient_age, patient_sex, scan_date
                   FROM radiology_schema.rad_scans WHERE user_id = %s
                   ORDER BY scan_date DESC LIMIT 5""",
                (str(user_id),)
            )
            context["recent_cases"] = [
                {"case_id": r[0], "patient": r[1], "type": r[2], "age": r[3], "sex": r[4],
                 "date": r[5].strftime("%Y-%m-%d %H:%M") if r[5] else None}
                for r in cursor.fetchall()
            ]

            # Recent reports (last 5)
            cursor.execute(
                """SELECT case_id, patient_name, impression, findings, created_at
                   FROM radiology_schema.reports WHERE user_id = %s
                   ORDER BY created_at DESC LIMIT 5""",
                (str(user_id),)
            )
            context["recent_reports"] = [
                {"case_id": r[0], "patient": r[1], "impression": r[2], "findings": r[3],
                 "date": r[4].strftime("%Y-%m-%d %H:%M") if r[4] else None}
                for r in cursor.fetchall()
            ]

        elif role == "organization":
            # Org profile
            cursor.execute(
                """SELECT org_name, org_type, email, contact_number, address,
                          npi, org_admin_name, org_admin_email, profile_completed
                   FROM organization_schema.org_profile WHERE user_id = %s""",
                (str(user_id),)
            )
            row = cursor.fetchone()
            if row:
                context["org_profile"] = {
                    "org_name": row[0], "org_type": row[1], "email": row[2],
                    "contact": row[3], "address": row[4], "npi": row[5],
                    "admin_name": row[6], "admin_email": row[7],
                    "profile_completed": row[8],
                }

    except Exception as e:
        print(f"Error fetching user context: {e}")
    finally:
        cursor.close()

    return context


def _build_system_prompt(user_context, role, form_session=None):
    """Build the system prompt with real user data."""

    profile_info = json.dumps(user_context, indent=2, default=str)

    form_instruction = ""
    if form_session:
        form_type = form_session["form_type"]
        step = form_session["step"]
        steps = form_session["steps"]
        collected = form_session["data"]

        if step < len(steps):
            current_field = steps[step]
            form_instruction = f"""

IMPORTANT — You are currently in PROFILE SETUP mode for a {form_type}.
You are collecting information step by step.
Data collected so far: {json.dumps(collected)}
Current field to collect: "{current_field['field']}" — {current_field['question']}
Step {step + 1} of {len(steps)}.

Your job: Extract the value for "{current_field['field']}" from the user's message.
Respond with EXACTLY this JSON on a NEW LINE at the END of your response:
FORM_DATA:{{"field": "{current_field['field']}", "value": "<extracted value>"}}

If the user says "skip", respond with:
FORM_DATA:{{"field": "{current_field['field']}", "value": null}}

If the user wants to cancel, respond with:
FORM_DATA:{{"action": "cancel"}}

Be conversational and friendly while collecting the data. After acknowledging their answer, ask the next question naturally.
"""

    return f"""You are Onix Assistant — a friendly, intelligent personal AI assistant for the Onix radiology platform.

Your role:
- You help radiologists and organizations with their daily workflow
- You answer questions about their cases, reports, and profile using REAL data provided below
- You speak naturally and conversationally, like a helpful colleague
- Keep responses concise but informative
- Use markdown formatting (bold, bullet points) when listing data
- Always be accurate — only use the data provided, never make up numbers

User's role: {role}
User's real-time data:
{profile_info}

If the user asks about something not in the data above, say you don't have that information.
If the user wants to set up or update their profile, start collecting their details one by one conversationally.
{form_instruction}"""


# Form step definitions
RADIOLOGIST_FORM_STEPS = [
    {"field": "first_name", "question": "What is your first name?", "db_column": "first_name", "table": "radiology_schema.radiologists"},
    {"field": "last_name", "question": "What is your last name?", "db_column": "last_name", "table": "radiology_schema.radiologists"},
    {"field": "qualification", "question": "What is your qualification? (e.g. MBBS, MD, DNB)", "db_column": "qualification", "table": "radiology_schema.radiologists"},
    {"field": "designation", "question": "What is your designation?", "db_column": "designation", "table": "radiology_schema.radiologists"},
    {"field": "department", "question": "What department?", "db_column": "department", "table": "radiology_schema.radiologists"},
    {"field": "user_lab_name", "question": "What is your hospital/lab name?", "db_column": "user_lab_name", "table": "radiology_schema.radiologists"},
    {"field": "lab_address", "question": "What is the lab address?", "db_column": "lab_address", "table": "radiology_schema.radiologists"},
]

ORGANIZATION_FORM_STEPS = [
    {"field": "org_name", "question": "What is the organization name?", "db_column": "org_name", "table": "organization_schema.org_profile"},
    {"field": "org_type", "question": "What type of organization? (Hospital, Diagnostic Center, Clinic)", "db_column": "org_type", "table": "organization_schema.org_profile"},
    {"field": "contact_number", "question": "What is the contact number?", "db_column": "contact_number", "table": "organization_schema.org_profile"},
    {"field": "email", "question": "What is the organization email?", "db_column": "email", "table": "organization_schema.org_profile"},
    {"field": "address", "question": "What is the full address?", "db_column": "address", "table": "organization_schema.org_profile"},
    {"field": "npi", "question": "What is the NPI number? (say skip if not applicable)", "db_column": "npi", "table": "organization_schema.org_profile"},
    {"field": "org_admin_name", "question": "What is the admin/contact person name?", "db_column": "org_admin_name", "table": "organization_schema.org_profile"},
    {"field": "org_admin_email", "question": "What is the admin email?", "db_column": "org_admin_email", "table": "organization_schema.org_profile"},
]


def _detect_form_start(ai_response, user_message, role):
    """Check if the AI or user wants to start a profile setup."""
    msg = user_message.lower()
    triggers = ["setup", "set up", "fill", "create", "update", "edit"]
    targets_rad = ["profile", "my profile", "my details"]
    targets_org = ["organization", "organisation", "org", "company"]

    for t in triggers:
        if t in msg:
            for target in targets_org:
                if target in msg:
                    return "organization"
            for target in targets_rad:
                if target in msg:
                    return "radiologist" if role == "radiologist" else "organization"

    return None


def _save_form_field(conn, user_id, form_type, step, value):
    """Save a form field to DB."""
    cursor = conn.cursor()
    table = step["table"]
    column = step["db_column"]

    if form_type == "radiologist":
        cursor.execute(
            "INSERT INTO radiology_schema.radiologists (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING",
            (str(user_id),)
        )
    elif form_type == "organization":
        cursor.execute(
            "INSERT INTO organization_schema.org_profile (user_id) VALUES (%s) ON CONFLICT (user_id) DO NOTHING",
            (str(user_id),)
        )

    cursor.execute(
        f"UPDATE {table} SET {column} = %s, updated_at = NOW() WHERE user_id = %s",
        (value, str(user_id))
    )
    conn.commit()
    cursor.close()


def chat(conn, user_id, user_message, role):
    """
    Main AI chat function. Every message goes through Gemma 3 27B.
    Returns the AI response string.
    """
    uid = str(user_id)
    hf_token = os.getenv("HF_API_TOKEN")
    if not hf_token:
        return "AI is not configured. Please set HF_API_TOKEN in .env."

    # Get user context from DB
    user_context = get_user_context(conn, user_id, role)

    # Check for form session
    form_session = _form_sessions.get(uid)

    # Check if user wants to start a form
    if not form_session:
        form_type = _detect_form_start("", user_message, role)
        if form_type:
            steps = RADIOLOGIST_FORM_STEPS if form_type == "radiologist" else ORGANIZATION_FORM_STEPS
            form_session = {"form_type": form_type, "step": 0, "steps": steps, "data": {}}
            _form_sessions[uid] = form_session

    # Build system prompt
    system_prompt = _build_system_prompt(user_context, role, form_session)

    # Get conversation history
    history = _conversations.get(uid, [])

    # Build messages for the API
    messages = [{"role": "system", "content": system_prompt}]
    for h in history[-8:]:  # last 8 messages for context
        messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": user_message})

    try:
        client = InferenceClient(api_key=hf_token)
        result = client.chat_completion(
            model=HF_MODEL,
            messages=messages,
            max_tokens=800,
        )
        ai_response = result.choices[0].message.content.strip()

        # Process form data if in form mode
        if form_session and "FORM_DATA:" in ai_response:
            ai_text, form_result = _process_form_response(conn, uid, ai_response, form_session)
            ai_response = ai_text

        # Save to conversation history
        if uid not in _conversations:
            _conversations[uid] = []
        _conversations[uid].append({"role": "user", "content": user_message})
        _conversations[uid].append({"role": "assistant", "content": ai_response})

        # Keep only last 20 messages
        if len(_conversations[uid]) > 20:
            _conversations[uid] = _conversations[uid][-20:]

        return ai_response

    except Exception as e:
        print(f"AI chat error: {e}")
        return f"Sorry, I'm having trouble connecting to the AI service right now. Please try again in a moment."


def _process_form_response(conn, uid, ai_response, form_session):
    """Extract FORM_DATA from AI response and save to DB."""
    lines = ai_response.split("\n")
    clean_lines = []
    form_data = None

    for line in lines:
        if line.strip().startswith("FORM_DATA:"):
            try:
                json_str = line.strip().replace("FORM_DATA:", "")
                form_data = json.loads(json_str)
            except:
                pass
        else:
            clean_lines.append(line)

    ai_text = "\n".join(clean_lines).strip()

    if form_data:
        if form_data.get("action") == "cancel":
            _form_sessions.pop(uid, None)
            return ai_text, None

        field = form_data.get("field")
        value = form_data.get("value")
        step_idx = form_session["step"]
        steps = form_session["steps"]

        if step_idx < len(steps) and field == steps[step_idx]["field"]:
            if value and value.lower() != "null":
                _save_form_field(conn, uid, form_session["form_type"], steps[step_idx], value)
                form_session["data"][field] = value

            form_session["step"] = step_idx + 1

            if form_session["step"] >= len(steps):
                _form_sessions.pop(uid, None)

    return ai_text, form_data
