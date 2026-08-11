# crud.py
from database import get_conn
import bcrypt
import uuid


# ---------- Password helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ---------- User functions ----------
def user_exists(email: str) -> bool:
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM core_schema.users WHERE email = %s", (email,))
    exists = cur.fetchone() is not None
    cur.close()
    conn.close()
    return exists


def create_user(email, password, role, username=None):
    conn = get_conn()
    cur = conn.cursor()

    hashed = hash_password(password)
    user_id = str(uuid.uuid4())

    cur.execute("""
        INSERT INTO core_schema.users (user_id, email, password, role, username, is_verified)
        VALUES (%s, %s, %s, %s, %s, false)

        RETURNING user_id
    """, (user_id, email, hashed, role, username))

    uid = cur.fetchone()[0]
    conn.commit()
    cur.close()
    conn.close()
    return uid



def activate_user(email: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        UPDATE core_schema.users
        SET is_verified = true
        WHERE email = %s
    """, (email,))
    conn.commit()
    cur.close()
    conn.close()


def get_user_by_email(email: str):
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("""
        SELECT user_id, email, password, is_verified, role
        FROM core_schema.users
        WHERE email = %s
    """, (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    return user
