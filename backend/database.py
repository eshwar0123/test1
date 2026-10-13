import os
import psycopg2
from dotenv import load_dotenv

# Load .env from the current directory
load_dotenv()

def get_conn():
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.getenv("DB_NAME", "onix_db"),
        user=os.getenv("DB_USER", "genphase"),
        password=os.getenv("DB_PASSWORD"),
    )
