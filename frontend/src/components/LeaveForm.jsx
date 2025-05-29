import { useState, useEffect } from "react";
import { useAuth } from "../auth/authContext.jsx";
import { applyLeave, getLeaveTypes } from "../api.js";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "../styles/LeaveForm.css";

function LeaveForm() {
  const { user } = useAuth();
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [formData, setFormData] = useState({
    type_id: "",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLeaveTypes = async () => {
      try {
        const data = await getLeaveTypes();
        setLeaveTypes(data);
      } catch {
        setError("Failed to load leave types");
        toast.error("Failed to load leave types", { position: "top-right" });
      }
    };
    fetchLeaveTypes();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

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
                {type.name}
              </option>
            ))}
          </select>
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
        <button type="submit" disabled={loading} onClick={handleSubmit}>
          {loading ? "Submitting..." : "Apply Leave"}
        </button>
      </div>
    </div>
  );
}

export default LeaveForm;
