"""
Intent matching engine for the personal assistant chatbot.
Step 1: Try keyword matching (instant, free)
Step 2: Fall back to AI (Gemma 3 27B via HF) for complex questions
"""

import re
import os
import json
from huggingface_hub import InferenceClient


# ---------------------
# Keyword-based intents
# ---------------------

KEYWORD_INTENTS = [
    # Case / Scan counts
    {
        "intent": "case_count_today",
        "keywords": [["how many", "count", "total", "number"], ["case", "cases", "scan", "scans"], ["today"]],
        "description": "Count of cases/scans received today",
    },
    {
        "intent": "case_count_week",
        "keywords": [["how many", "count", "total", "number"], ["case", "cases", "scan", "scans"], ["week", "this week", "weekly"]],
        "description": "Count of cases/scans received this week",
    },
    {
        "intent": "case_count_month",
        "keywords": [["how many", "count", "total", "number"], ["case", "cases", "scan", "scans"], ["month", "this month", "monthly"]],
        "description": "Count of cases/scans received this month",
    },
    {
        "intent": "case_count_total",
        "keywords": [["how many", "count", "total", "number", "all"], ["case", "cases", "scan", "scans"]],
        "description": "Total count of all cases/scans",
    },
    # Report counts
    {
        "intent": "report_count_today",
        "keywords": [["how many", "count", "total", "number"], ["report", "reports"], ["today"]],
        "description": "Count of reports completed today",
    },
    {
        "intent": "report_count_week",
        "keywords": [["how many", "count", "total", "number"], ["report", "reports"], ["week", "this week"]],
        "description": "Count of reports completed this week",
    },
    {
        "intent": "report_count_total",
        "keywords": [["how many", "count", "total", "number", "all"], ["report", "reports"]],
        "description": "Total count of all reports",
    },
    # Pending
    {
        "intent": "pending_cases",
        "keywords": [["pending", "unreported", "not reported", "remaining", "incomplete", "without report"]],
        "description": "List or count of pending/unreported cases",
    },
    # Profile info
    {
        "intent": "my_name",
        "keywords": [["my", "what is my", "what's my"], ["name"]],
        "description": "User's name",
    },
    {
        "intent": "my_email",
        "keywords": [["my", "what is my", "what's my"], ["email", "mail"]],
        "description": "User's email",
    },
    {
        "intent": "my_profile",
        "keywords": [["my", "show my", "view my"], ["profile", "details", "info", "information"]],
        "description": "User's full profile",
    },
    {
        "intent": "my_qualification",
        "keywords": [["my", "what is my", "what's my"], ["qualification", "degree"]],
        "description": "User's qualification",
    },
    # Organization info
    {
        "intent": "org_info",
        "keywords": [["organization", "organisation", "org", "company"], ["info", "details", "profile", "name", "about"]],
        "description": "Organization details",
    },
    # Recent activity
    {
        "intent": "recent_cases",
        "keywords": [["recent", "latest", "last", "show", "list"], ["case", "cases", "scan", "scans"]],
        "description": "List recent cases/scans",
    },
    {
        "intent": "recent_reports",
        "keywords": [["recent", "latest", "last", "show", "list"], ["report", "reports"]],
        "description": "List recent reports",
    },
    # Greetings
    {
        "intent": "greeting",
        "keywords": [["hi", "hello", "hey", "good morning", "good afternoon", "good evening"]],
        "description": "User greeting",
    },
    # Help
    {
        "intent": "help",
        "keywords": [["help", "what can you do", "commands", "features"]],
        "description": "Show help / available commands",
    },
]

# Form filling intents
FORM_INTENTS = [
    {
        "intent": "start_profile_setup",
        "keywords": [["setup", "set up", "fill", "create", "update", "edit"], ["profile", "my profile", "details", "my details"]],
        "description": "Start profile setup flow",
    },
    {
        "intent": "start_org_setup",
        "keywords": [["setup", "set up", "fill", "create", "register"], ["organization", "organisation", "org", "company"]],
        "description": "Start organization profile setup",
    },
]


def _normalize(text):
    """Lowercase and strip punctuation for matching."""
    return re.sub(r'[^\w\s]', '', text.lower().strip())


def match_keywords(user_message):
    """
    Try to match user message against predefined keyword patterns.
    Returns (intent_name, confidence) or (None, 0).

    Each intent has keyword groups — at least one word from each group must be present.
    """
    text = _normalize(user_message)

    # Check form intents first
    for intent_def in FORM_INTENTS:
        groups = intent_def["keywords"]
        if _groups_match(text, groups):
            return intent_def["intent"], 0.9

    # Check for high-priority single-group intents (pending, greeting, help)
    # These should match before multi-group intents that might accidentally match
    priority_intents = ["pending_cases", "greeting", "help"]
    for intent_def in KEYWORD_INTENTS:
        if intent_def["intent"] in priority_intents:
            if _groups_match(text, intent_def["keywords"]):
                return intent_def["intent"], 0.9

    # Then check regular intents (more specific first — they have more keyword groups)
    sorted_intents = sorted(KEYWORD_INTENTS, key=lambda x: len(x["keywords"]), reverse=True)

    for intent_def in sorted_intents:
        if intent_def["intent"] in priority_intents:
            continue  # already checked
        groups = intent_def["keywords"]
        if _groups_match(text, groups):
            return intent_def["intent"], 0.85

    return None, 0


def _groups_match(text, groups):
    """Check if at least one keyword from each group is found in text."""
    for group in groups:
        found = False
        for keyword in group:
            if keyword in text:
                found = True
                break
        if not found:
            return False
    return True


# ---------------------
# AI Fallback (Gemma 3 27B)
# ---------------------

AVAILABLE_INTENTS_FOR_AI = """
Available intents (pick exactly one):
- case_count_today: Count cases received today
- case_count_week: Count cases received this week
- case_count_month: Count cases received this month
- case_count_total: Total count of all cases
- report_count_today: Count reports completed today
- report_count_week: Count reports this week
- report_count_total: Total reports
- pending_cases: Pending/unreported cases
- recent_cases: List recent cases (last 10)
- recent_reports: List recent reports (last 10)
- my_name: User's name
- my_email: User's email
- my_profile: User's full profile info
- my_qualification: User's qualification
- org_info: Organization details
- report_search: Search reports by a field (needs: field, search_term, period)
- case_search: Search cases by criteria (needs: field, search_term, period)
- greeting: User is greeting
- help: User wants help
- unknown: Cannot determine intent
"""


def ai_classify_intent(user_message):
    """
    Use Gemma 3 27B to classify the user's intent when keyword matching fails.
    Returns (intent_name, params_dict).
    """
    hf_token = os.getenv("HF_API_TOKEN")
    if not hf_token:
        return "unknown", {}

    prompt = f"""You are an intent classifier for a radiology platform chatbot.
The user said: "{user_message}"

{AVAILABLE_INTENTS_FOR_AI}

Respond with ONLY a JSON object (no markdown, no explanation):
{{"intent": "<intent_name>", "params": {{"field": "...", "search_term": "...", "period": "..."}}}}

If no params are needed, use empty params: {{"intent": "<intent_name>", "params": {{}}}}
"""

    try:
        client = InferenceClient(api_key=hf_token)
        result = client.chat_completion(
            model="google/gemma-3-27b-it",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=150,
        )
        response_text = result.choices[0].message.content.strip()

        # Extract JSON from response
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group())
            return data.get("intent", "unknown"), data.get("params", {})

        return "unknown", {}

    except Exception as e:
        print(f"AI intent classification error: {e}")
        return "unknown", {}


def classify_intent(user_message):
    """
    Hybrid intent classification:
    1. Try keyword matching first (instant)
    2. Fall back to AI if no match (3-8 sec)
    Returns (intent, params, method)
    """
    intent, confidence = match_keywords(user_message)

    if intent and confidence > 0.5:
        return intent, {}, "keyword"

    # AI fallback
    intent, params = ai_classify_intent(user_message)
    return intent, params, "ai"
