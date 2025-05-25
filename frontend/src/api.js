import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const loginUser = async (email, password) => {
  const response = await api.post("/auth/login", { email, password });
  return response.data;
};

export const getLeaveTypes = async () => {
  const response = await api.get("/leaves/types");
  return response.data;
};

export const applyLeave = async (leaveData) => {
  const response = await api.post("/leaves", leaveData);
  return response.data;
};

export const getLeaveBalances = async () => {
  const response = await api.get("/leaves/balance");
  return response.data;
};

export const getMyLeaves = async () => {
  const response = await api.get("/leaves/my");
  return response.data;
};

export const getLeaveAvailability = async () => {
  const response = await api.get("/leaves/calendar/leave-availability");
  return response.data;
};

// HR endpoints
export const getHRUsers = async () => {
  const response = await api.get("/hr/users");
  return response.data;
};

export const approveHRLeave = async (leaveId, comments) => {
  const response = await api.post(`/hr/leave-requests/${leaveId}/approve`, {
    comments,
  });
  return response.data;
};

export const rejectHRLeave = async (leaveId, comments) => {
  const response = await api.post(`/hr/leave-requests/${leaveId}/reject`, {
    comments,
  });
  return response.data;
};

// Manager endpoints
export const getTeamUsers = async () => {
  const response = await api.get("/manager/team-users"); // Assumes new endpoint
  return response.data;
};

export const approveManagerLeave = async (leaveId, comments) => {
  const response = await api.post(
    `/manager/leave-requests/${leaveId}/approve`,
    { comments }
  );
  return response.data;
};

export const rejectManagerLeave = async (leaveId, comments) => {
  const response = await api.post(`/manager/leave-requests/${leaveId}/reject`, {
    comments,
  });
  return response.data;
};

// Admin endpoints
export const createUser = async (userData) => {
  const response = await api.post("/admin/users", userData);
  return response.data;
};

export const deleteUser = async (userId) => {
  const response = await api.delete(`/admin/users/${userId}`);
  return response.data;
};

export const assignEmployeeToManager = async (employeeId, managerId) => {
  const response = await api.put(`/admin/users/${employeeId}/assign-manager`, {
    manager_id: managerId,
  });
  return response.data;
};

export default api;
