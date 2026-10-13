import random
from gmail_service import send_email

otp = random.randint(100000, 999999)

send_email(
    "virudha22@gmail.com",   # change this
    "Your OTP Code",
    f"Your OTP is {otp}"
)

