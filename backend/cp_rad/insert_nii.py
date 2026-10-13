import psycopg2
import os

def insert_nii_to_db(case_id, file_path, thumb_path, user_id):
    """
    Inserts a NIfTI scan record into the PostgreSQL database.
    """
    DB_HOST = os.getenv("RAD_DB_HOST", "localhost")
    DB_NAME = os.getenv("RAD_DB_NAME", "Radiology_kbs")
    DB_USER = os.getenv("RAD_DB_USER", "postgres")
    DB_PASS = os.getenv("RAD_DB_PASSWORD")
    DB_PORT = os.getenv("RAD_DB_PORT", "5432")
    conn = None
    try:
        # 1. Connect to Database
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        cursor = conn.cursor()

        # 2. Prepare Data
        file_name = os.path.basename(file_path)
        scan_type = 'CT'  # Explicitly setting type for Radiology

        # 3. SQL Query
        insert_query = """
        INSERT INTO rad_scans (case_id, file_path, scan_type, user_id, thumbnail_path)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING scan_id;
        """

        # 4. Execute
        cursor.execute(insert_query, (case_id, file_path, scan_type, user_id, thumb_path))
        scan_id = cursor.fetchone()[0]
        
        # 5. Commit changes
        conn.commit()
        
        print(f"Successfully inserted NII scan into DB. Scan ID: {scan_id}")
        return scan_id

    except (Exception, psycopg2.Error) as error:
        print(f"Error inserting data: {error}")
    
    finally:
        if conn:
            cursor.close()
            conn.close()

# --- Usage Example ---
if __name__ == "__main__":
    # You would typically call this right after the thumbnail script finishes
    insert_nii_to_db(
        case_id="9",
        file_path="CT_Abdo.nii",
        thumb_path="CT_Abdo_thumb.png",
        user_id=4
    )
