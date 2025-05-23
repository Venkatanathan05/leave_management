import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import { getLeaveBalances } from "../api.js";
import "../styles/Balances.css";

function Balances() {
  const { user } = useAuth();
  const [balances, setBalances] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchBalances = async () => {
      try {
        const data = await getLeaveBalances();
        setBalances(data);
      } catch {
        setError("Failed to load balances");
      }
    };
    fetchBalances();
  }, []);

  if (!user) return null;

  return (
    <div className="balances-container">
      <h2>Leave Balances</h2>
      {error && <p className="error">{error}</p>}
      {balances.length > 0 ? (
        <table className="balances-table">
          <thead>
            <tr>
              <th>Leave Type</th>
              <th>Available Days</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((balance, index) => (
              <tr key={balance.leave_type_id || `balance-${index}`}>
                <td>{balance.leave_type_name}</td>
                <td>{balance.available_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>No balances available</p>
      )}
    </div>
  );
}

export default Balances;
