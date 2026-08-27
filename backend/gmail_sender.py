# gmail_service.py
import base64
import os
from email.mime.text import MIMEText

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from google.auth.exceptions import RefreshError

SCOPES = ["https://www.googleapis.com/auth/gmail.send"]

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TOKEN_PATH = os.path.join(BASE_DIR, "token.json")
CREDS_PATH = os.path.join(BASE_DIR, "credentials.json")


def get_gmail_service():
    creds = None

    if os.path.exists(TOKEN_PATH):
        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)

    if not creds or not creds.valid:
        try:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    CREDS_PATH, SCOPES
                )
                creds = flow.run_local_server(
                    port=0,
                    access_type="offline",
                    prompt="consent"   # 🔥 IMPORTANT
                )

            with open(TOKEN_PATH, "w") as token:
                token.write(creds.to_json())

        except RefreshError:
            return None

    return build("gmail", "v1", credentials=creds)


def send_email(to_email, subject, body):
    service = get_gmail_service()
    if not service:
        return False

    message = MIMEText(body, "html")
    message["to"] = to_email
    message["subject"] = subject

    raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

    service.users().messages().send(
        userId="me",
        body={"raw": raw_message}
    ).execute()

    print("✅ Email sent to:", to_email)
    return True

