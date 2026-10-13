"""
Conversational form filling for profile setup.
Guides user step-by-step through profile fields, saving each answer to DB.
"""


# ---------------------
# Radiologist profile form
# ---------------------

RADIOLOGIST_FORM_STEPS = [
    {
        "field": "first_name",
        "question": "What is your **first name**?",
        "db_column": "first_name",
        "table": "radiology_schema.radiologists",
    },
    {
        "field": "last_name",
        "question": "What is your **last name**?",
        "db_column": "last_name",
        "table": "radiology_schema.radiologists",
    },
    {
        "field": "qualification",
        "question": "What is your **qualification**? (e.g. MBBS, MD, DNB, DM)",
        "db_column": "qualification",
        "table": "radiology_schema.radiologists",
    },
    {
        "field": "designation",
        "question": "What is your **designation**? (e.g. Consultant Radiologist, Senior Resident)",
        "db_column": "designation",
        "table": "radiology_schema.radiologists",
    },
    {
        "field": "department",
        "question": "What is your **department**? (e.g. Radiology, Neuro Imaging)",
        "db_column": "department",
        "table": "radiology_schema.radiologists",
    },
    {
        "field": "user_lab_name",
        "question": "What is your **hospital/lab/clinic name**?",
        "db_column": "user_lab_name",
        "table": "radiology_schema.radiologists",
    },
    {
        "field": "lab_address",
        "question": "What is your **lab/clinic address**?",
        "db_column": "lab_address",
        "table": "radiology_schema.radiologists",
    },
]


# ---------------------
# Organization profile form
# ---------------------

ORGANIZATION_FORM_STEPS = [
    {
        "field": "org_name",
        "question": "What is your **organization name**?",
        "db_column": "org_name",
        "table": "organization_schema.org_profile",
    },
    {
        "field": "org_type",
        "question": "What **type of organization** is it? (e.g. Hospital, Diagnostic Center, Clinic)",
        "db_column": "org_type",
        "table": "organization_schema.org_profile",
    },
    {
        "field": "contact_number",
        "question": "What is the **contact number**?",
        "db_column": "contact_number",
        "table": "organization_schema.org_profile",
    },
    {
        "field": "email",
        "question": "What is the **organization email**?",
        "db_column": "email",
        "table": "organization_schema.org_profile",
    },
    {
        "field": "address",
        "question": "What is the **full address**?",
        "db_column": "address",
        "table": "organization_schema.org_profile",
    },
    {
        "field": "npi",
        "question": "What is the **NPI number**? (type 'skip' if not applicable)",
        "db_column": "npi",
        "table": "organization_schema.org_profile",
    },
    {
        "field": "org_admin_name",
        "question": "What is the **admin/contact person name**?",
        "db_column": "org_admin_name",
        "table": "organization_schema.org_profile",
    },
    {
        "field": "org_admin_email",
        "question": "What is the **admin email**?",
        "db_column": "org_admin_email",
        "table": "organization_schema.org_profile",
    },
]


# ---------------------
# Session state (in-memory, per user)
# ---------------------

# { user_id: { "form_type": "radiologist"|"organization", "step": 0, "data": {} } }
_form_sessions = {}


def get_form_steps(form_type):
    if form_type == "radiologist":
        return RADIOLOGIST_FORM_STEPS
    elif form_type == "organization":
        return ORGANIZATION_FORM_STEPS
    return []


def start_form(user_id, form_type):
    """Start a form filling session for the user."""
    steps = get_form_steps(form_type)
    if not steps:
        return "Unknown form type."

    _form_sessions[str(user_id)] = {
        "form_type": form_type,
        "step": 0,
        "data": {},
    }

    return f"Let's set up your **{form_type} profile**! I'll ask you a few questions.\n\n{steps[0]['question']}"


def is_form_active(user_id):
    """Check if user has an active form session."""
    return str(user_id) in _form_sessions


def cancel_form(user_id):
    """Cancel the active form session."""
    _form_sessions.pop(str(user_id), None)
    return "Profile setup cancelled. You can restart anytime by saying 'setup my profile'."


def process_form_input(conn, user_id, user_message):
    """
    Process user input during form filling.
    Saves the answer to DB and returns the next question.
    """
    uid = str(user_id)
    session = _form_sessions.get(uid)
    if not session:
        return None

    # Check for cancel
    if user_message.lower().strip() in ("cancel", "stop", "quit", "exit"):
        return cancel_form(user_id)

    form_type = session["form_type"]
    step_idx = session["step"]
    steps = get_form_steps(form_type)

    if step_idx >= len(steps):
        _form_sessions.pop(uid, None)
        return "Profile setup already complete!"

    current_step = steps[step_idx]
    answer = user_message.strip()

    # Handle 'skip'
    if answer.lower() == "skip":
        answer = None

    # Save to DB
    if answer:
        _save_form_field(conn, user_id, form_type, current_step, answer)
        session["data"][current_step["field"]] = answer

    # Move to next step
    session["step"] = step_idx + 1

    if session["step"] >= len(steps):
        # Form complete
        _form_sessions.pop(uid, None)

        if form_type == "organization":
            _mark_org_profile_completed(conn, user_id)

        summary = _build_summary(session["data"], steps)
        return f"Profile setup complete! Here's what we saved:\n\n{summary}\n\nYou can update any field by saying 'setup my profile' again."

    # Return next question
    next_step = steps[session["step"]]
    step_num = session["step"] + 1
    total = len(steps)
    return f"({step_num}/{total}) {next_step['question']}"


def _save_form_field(conn, user_id, form_type, step, value):
    """Save a single form field to the database."""
    cursor = conn.cursor()
    table = step["table"]
    column = step["db_column"]

    if form_type == "radiologist":
        # Ensure radiologist row exists
        cursor.execute(
            """INSERT INTO radiology_schema.radiologists (user_id)
               VALUES (%s)
               ON CONFLICT (user_id) DO NOTHING""",
            (str(user_id),)
        )
        cursor.execute(
            f"UPDATE {table} SET {column} = %s, updated_at = NOW() WHERE user_id = %s",
            (value, str(user_id))
        )

    elif form_type == "organization":
        # Ensure org_profile row exists
        cursor.execute(
            """INSERT INTO organization_schema.org_profile (user_id)
               VALUES (%s)
               ON CONFLICT (user_id) DO NOTHING""",
            (str(user_id),)
        )
        cursor.execute(
            f"UPDATE {table} SET {column} = %s, updated_at = NOW() WHERE user_id = %s",
            (value, str(user_id))
        )

    conn.commit()
    cursor.close()


def _mark_org_profile_completed(conn, user_id):
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE organization_schema.org_profile SET profile_completed = TRUE WHERE user_id = %s",
        (str(user_id),)
    )
    conn.commit()
    cursor.close()


def _build_summary(data, steps):
    lines = []
    for step in steps:
        field = step["field"]
        label = step["field"].replace("_", " ").title()
        value = data.get(field, "Skipped")
        lines.append(f"• **{label}:** {value}")
    return "\n".join(lines)
