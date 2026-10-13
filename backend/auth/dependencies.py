# dependencies.py
# Load .env eagerly so this module reads the right JWT_SECRET no matter
# which entry point imports it.
from dotenv import load_dotenv
load_dotenv()

import os
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("JWT_SECRET", "dev_secret_change_me")  # ✅ fallback
ALGORITHM  = "HS256"

security = HTTPBearer()


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )
        return payload  # { user_id, email, role, exp }
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
