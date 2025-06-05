import { useState, useEffect } from "react";
import { useAuth } from "../auth/authContext.jsx";
import { applyLeave, getLeaveBalances, getLeaveTypes } from "../api.js";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/LeaveForm.css";

function LeaveForm() {
  const { user } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveBalances, setLeaveBalances] = useState([]);
  const [formData, setFormData] = useState({
    type_id: "",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [types, balances] = await Promise.all([
          getLeaveTypes(),
          getLeaveBalances(user.user_id),
        ]);
        setLeaveTypes(types);
        setLeaveBalances(balances);
        setError("");
      } catch (err) {
        const message =
          err.response?.data?.message || "Failed to load leave data";
        setError(message);
        toast.error(message, { position: "top-right" });
      }
    };

    if (user) fetchData();
  }, [user]);

  const getAvailableDays = (type_id) => {
    const balance = leaveBalances.find((b) => b.type_id === type_id);
    return balance ? balance.available_days : 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (formData.end_date < formData.start_date) {
      setError("End date must be after start date");
      toast.error("End date must be after start date", {
        position: "top-right",
      });
      setLoading(false);
      return;
    }

    try {
      await applyLeave({
        ...formData,
        type_id: parseInt(formData.type_id),
      });
      setFormData({
        type_id: "",
        start_date: "",
        end_date: "",
        reason: "",
      });
      toast.success("Leave applied successfully", { position: "top-right" });
    } catch (error) {
      const errorMessage =
        error.response?.data?.message || "Failed to apply leave";
      setError(errorMessage);
      if (errorMessage.includes("weekend")) {
        toast.error("Cannot apply leave on a weekend", {
          position: "top-right",
        });
      } else if (errorMessage.includes("holiday")) {
        toast.error("Cannot apply leave on a holiday", {
          position: "top-right",
        });
      } else {
        toast.error(errorMessage, { position: "top-right" });
      }
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="leave-form">
      <h2>Apply for Leave</h2>
      <ToastContainer />
      {error && <p className="error">{error}</p>}
      <div className="form-container">
        <div className="form-group">
          <label htmlFor="type_id">Leave Type</label>
          <select
            id="type_id"
            name="type_id"
            value={formData.type_id}
            onChange={handleChange}
            required
          >
            <option value="" disabled>
              Select leave type
            </option>
            {leaveTypes.map((type) => (
              <option key={type.type_id} value={type.type_id}>
                {type.name} (Available: {getAvailableDays(type.type_id)} days)
              </option>
            ))}
          </select>
          {formData.type_id && (
            <p>
              Available days for selected leave type:{" "}
              <strong>{getAvailableDays(parseInt(formData.type_id))}</strong>
            </p>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="start_date">Start Date</label>
          <input
            type="date"
            id="start_date"
            name="start_date"
            value={formData.start_date}
            onChange={handleChange}
            required
            min={today}
          />
        </div>
        <div className="form-group">
          <label htmlFor="end_date">End Date</label>
          <input
            type="date"
            id="end_date"
            name="end_date"
            value={formData.end_date}
            onChange={handleChange}
            required
            min={formData.start_date || today}
          />
        </div>
        <div className="form-group">
          <label htmlFor="reason">Reason</label>
          <textarea
            id="reason"
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading || leaveTypes.length === 0}
          onClick={handleSubmit}
        >
          {loading ? "Submitting..." : "Apply Leave"}
        </button>
      </div>
    </div>
  );
}

export default LeaveForm;
