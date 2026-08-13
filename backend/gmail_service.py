from email.mime.text import MIMEText
import base64
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

def send_email(receiver, subject, body):
    creds = Credentials.from_authorized_user_file("token.json")
    service = build("gmail", "v1", credentials=creds)

    message = MIMEText(body)
    message['to'] = receiver
    message['subject'] = subject

    encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()

    send_body = {
        "raw": encoded_message
    }

    result = service.users().messages().send(userId="me", body=send_body).execute()
    print("✅ Email sent:", result)
