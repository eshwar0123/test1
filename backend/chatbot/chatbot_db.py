"""
Separate DB connection for the personal assistant chatbot.
Uses the local onix_ai_db database (localhost:5432).
"""
import os
import psycopg2
from dotenv import load_dotenv
load_dotenv()

def get_chatbot_conn():
    return psycopg2.connect(
        host=os.getenv("CHATBOT_DB_HOST", "localhost"),
        port=int(os.getenv("CHATBOT_DB_PORT", "5432")),
        database=os.getenv("CHATBOT_DB_NAME", "onix_ai_db"),
        user=os.getenv("CHATBOT_DB_USER", "postgres"),
        password=os.getenv("CHATBOT_DB_PASSWORD"),
    )
