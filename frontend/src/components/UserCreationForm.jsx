import { useState, useEffect } from "react";
import { useAuth } from "../authContext.jsx";
import { createUser, getAllUsers } from "../api.js";
import "../styles/UserCreationForm.css";

function UserCreationForm() {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role_id: "",
    manager_id: "",
    password: "",
  });
  const [managers, setManagers] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchManagers = async () => {
      try {
        const users = await getAllUsers();
        setManagers(users.filter((u) => u.role_id === 3));
      } catch {
        setError("Failed to load managers");
      }
    };
    if (user?.role_id === 1) fetchManagers();
  }, [user]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      if (
        name === "role_id" &&
        value === "2" &&
        managers.length > 0 &&
        !prev.manager_id
      ) {
        updated.manager_id = managers[0].user_id;
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const data = {
        name: formData.name,
        email: formData.email,
        role_id: parseInt(formData.role_id),
        manager_id: formData.manager_id
          ? parseInt(formData.manager_id)
          : undefined,
        password: formData.password,
      };
      await createUser(data);
      setSuccess("User created successfully");
      setFormData({
        name: "",
        email: "",
        role_id: "",
        manager_id: "",
        password: "",
      });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  if (!user || user.role_id !== 1) return null;

  return (
    <div className="user-creation-form">
      <h2>Create User</h2>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      {loading && <p>Loading...</p>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="role_id">Role</label>
          <select
            id="role_id"
            name="role_id"
            value={formData.role_id}
            onChange={handleChange}
            required
          >
            <option value="">Select Role</option>
            <option value="1">Admin</option>
            <option value="2">Employee</option>
            <option value="3">Manager</option>
            <option value="4">Intern</option>
            <option value="5">HR</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="manager_id">Manager</label>
          <select
            id="manager_id"
            name="manager_id"
            value={formData.manager_id}
            onChange={handleChange}
          >
            <option value="">No Manager</option>
            {managers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          Create User
        </button>
      </form>
    </div>
  );
}

export default UserCreationForm;
