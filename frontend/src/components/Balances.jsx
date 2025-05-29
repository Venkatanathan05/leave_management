import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../auth/authContext.jsx";
import { getLeaveBalances } from "../api.js";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/Balances.css";

function Balances({ refreshTrigger }) {
  const { user } = useAuth();
  const [balances, setBalances] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchBalances = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getLeaveBalances(user.user_id);
      setBalances(data);
    } catch {
      setError("Failed to load balances");
      toast.error("Failed to load balances", { position: "top-right" });
    } finally {
      setLoading(false);
    }
  }, [user.user_id]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances, refreshTrigger]);

  if (!user) return null;

  return (
    <div className="balances-container">
      <h2>Leave Balances</h2>
      <ToastContainer />
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading...</p>}
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
              <tr key={balance.balance_id || `balance-${index}`}>
                <td>{balance.leaveType?.name || "Unknown"}</td>
                <td>{balance.available_days}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        !loading && !error && <p>No balances available</p>
      )}
    </div>
  );
}

export default Balances;
