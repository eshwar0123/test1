import smtplib
from email.mime.text import MIMEText
from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv()

EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")
EMAIL_DISABLED = os.getenv("EMAIL_DISABLED", "0") == "1"
def send_email(to, otp):
    if EMAIL_DISABLED:
        print(f"[EMAIL_DISABLED] OTP for {to}: {otp}")
        return
    html_content = f"""\
    <html>
    <body>
        <p>Hello,</p>
        <p>Your account is nearly set up. Please use this code to verify your email address:</p>
        <p><b>{otp}</b></p>
        <p>Code will expire in 10 minutes.</p>
        <p>Thank you,<br>Genphase</p>
    </body>
    </html>
    """
    msg = MIMEText(html_content,"html")
    msg["Subject"] = "Your Email Verification OTP"
    msg["From"] =  EMAIL_USER
    msg["To"] = to

    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(EMAIL_USER, EMAIL_PASS)
        server.sendmail(EMAIL_USER, [to], msg.as_string())
