# otp_utils.py
import random
from datetime import datetime, timedelta

# In-memory store (for testing)
otp_store = {}

def generate_otp(email: str) -> str:
    otp = str(random.randint(100000, 999999))
    otp_store[email] = {
        "otp": otp,
        "expiry": datetime.now() + timedelta(minutes=5)
    }
    return otp

def verify_otp(email: str, otp: str) -> bool:
    data = otp_store.get(email)
    if not data:
        return False

    if datetime.now() > data["expiry"]:
        return False

    return data["otp"] == otp

def resend_otp(email: str) -> str:
    return generate_otp(email)
