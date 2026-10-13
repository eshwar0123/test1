from database import get_conn

def create_tables():
    conn = get_conn()
    cur = conn.cursor()

    # =========================
    # Radiologist Scans Table
    # =========================
    cur.execute("""
    CREATE TABLE IF NOT EXISTS rad_scans (
        scan_id SERIAL PRIMARY KEY,
        case_id TEXT NOT NULL,
        filename TEXT,
        file_path TEXT,
        file_url TEXT,
        thumbnail TEXT,
        scan_type TEXT,
        scan_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        patient_name TEXT,
        patient_sex TEXT,
        patient_age INT,
        uploaded_by INT
    );
    """)

    conn.commit()
    cur.close()
    conn.close()
    print("✅ Database tables ready")
