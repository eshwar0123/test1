# backend/email_utils.py
import os
from dotenv import load_dotenv
from email.message import EmailMessage
import smtplib

load_dotenv()

EMAIL = os.getenv("EMAIL")
EMAIL_APP_PASSWORD = os.getenv("EMAIL_APP_PASSWORD")

def send_otp_email(to_email: str, otp: str):
    msg = EmailMessage()
    msg["Subject"] = "LOMA — Your verification OTP"
    msg["From"] = EMAIL
    msg["To"] = to_email
    msg.set_content(f"Your OTP is: {otp}\nIt will expire in 5 minutes. Do not share this code.")

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(EMAIL, EMAIL_APP_PASSWORD)
        smtp.send_message(msg)
