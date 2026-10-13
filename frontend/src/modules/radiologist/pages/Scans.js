import { useEffect, useState } from "react";
import { API } from "../api";
import { useNavigate } from "react-router-dom";
import "./Scans.css"; // We'll create this CSS file

export default function Scans() {
  const [scans, setScans] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    API.get("/scans").then(res => setScans(res.data.data));
  }, []);

  return (
    <div style={{ padding: 30 }}>
      <h2>Completed Scans</h2>
      <div className="scan-grid">
        {scans.map(scan => (
          <div 
            key={scan.scan_id} 
            className="scan-card"
            onClick={() => nav(`/viewer/${scan.scan_id}`)}
          >
            <div className="thumbnail-container">
              <img src={scan.thumbnail} alt={scan.case_id} />
              <div className="zoom-lens"></div>
            </div>
            <p className="">{scan.case_id}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
