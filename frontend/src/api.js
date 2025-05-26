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
    console.log("API request:", config.url, {
      token: token ? "present" : "missing",
    });
    return config;
  },
  (error) => Promise.reject(error)
);

export const loginUser = async (email, password) => {
  try {
    console.log("Login payload:", { email, password });
    const response = await api.post("/auth/login", { email, password });
    return response.data;
  } catch (error) {
    console.error("Login error:", error.response?.data || error.message);
    throw error;
  }
};

export const getLeaveTypes = async () => {
  const response = await api.get("/leaves/types");
  return response.data;
};

export const applyLeave = async (leaveData) => {
  const response = await api.post("/leaves", leaveData);
  return response.data;
};

export const getLeaveBalances = async (userId) => {
  const endpoint = userId ? `/leaves/balance/${userId}` : "/leaves/balance";
  const response = await api.get(endpoint);
  return response.data;
};

export const getMyLeaves = async (userId) => {
  const endpoint = userId ? `/leaves/my/${userId}` : "/leaves/my";
  const response = await api.get(endpoint);
  return response.data;
};

export const getLeaveAvailability = async () => {
  const response = await api.get("/leaves/calendar/leave-availability");
  return response.data;
};

// HR endpoints
export const getHRUsers = async () => {
  try {
    const response = await api.get("/hr/users");
    return response.data;
  } catch (error) {
    console.error("getHRUsers error:", error.response?.data);
    throw error;
  }
};

export const getHRPendingRequests = async () => {
  try {
    const response = await api.get("/hr/leave-requests/pending");
    console.log("getHRPendingRequests response:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "getHRPendingRequests error:",
      error.response?.data || error.message
    );
    throw error;
  }
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
  try {
    const response = await api.get("/manager/team-users");
    return response.data;
  } catch (error) {
    console.error("getTeamUsers error:", error.response?.data);
    throw error;
  }
};

export const getManagerPendingRequests = async () => {
  try {
    const response = await api.get("/manager/pending-requests");
    console.log("getManagerPendingRequests response:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "getManagerPendingRequests error:",
      error.response?.data || error.message
    );
    throw error;
  }
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
export const getAllUsers = async () => {
  try {
    const response = await api.get("/admin/users");
    console.log("getAllUsers response:", response.data);
    return response.data;
  } catch (error) {
    console.error("getAllUsers error:", error.response?.data || error.message, {
      status: error.response?.status,
    });
    throw error;
  }
};

export const getAdminPendingRequests = async () => {
  try {
    const response = await api.get("/admin/leave-requests/approvals-needed");
    console.log("getAdminPendingRequests response:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "getAdminPendingRequests error:",
      error.response?.data || error.message
    );
    throw error;
  }
};

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

export const updateProfile = async (profileData) => {
  try {
    const response = await api.put("/auth/profile", profileData);
    return response.data;
  } catch (error) {
    console.error(
      "updateProfile error:",
      error.response?.data || error.message
    );
    throw error;
  }
};

export const approveAdminLeave = async (leaveId, comments) => {
  const response = await api.post(`/admin/leave-requests/${leaveId}/approve`, {
    comments,
  });
  return response.data;
};

export const rejectAdminLeave = async (leaveId, comments) => {
  const response = await api.post(`/admin/leave-requests/${leaveId}/reject`, {
    comments,
  });
  return response.data;
};

export const getTeamAvailability = async ({ period, date }) => {
  try {
    const response = await api.get("/manager/team-availability", {
      params: { period, date },
    });
    console.log("getTeamAvailability response:", response.data);
    return response.data;
  } catch (error) {
    console.error(
      "getTeamAvailability error:",
      error.response?.data || error.message
    );
    throw error;
  }
};

export const getHolidays = async () => {
  try {
    const response = await api.get("/holidays");
    return response.data;
  } catch (error) {
    console.error("getHolidays error:", error.response?.data || error.message);
    throw error;
  }
};

// Existing getCalendarData
export const getCalendarData = async ({ period, date }) => {
  try {
    const response = await api.get("/leaves/calendar", {
      params: { period, date },
    });
    return response.data;
  } catch (error) {
    console.error(
      "getCalendarData error:",
      error.response?.data || error.message
    );
    throw error;
  }
};

export const checkLeaveOverlap = (startDate, endDate, existingLeaves) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  let overlaps = false;
  let isSubset = false;
  let canMerge = false;

  for (const leave of existingLeaves) {
    const leaveStart = new Date(leave.start_date);
    const leaveEnd = new Date(leave.end_date);

    if (
      (start >= leaveStart && start <= leaveEnd) ||
      (end >= leaveStart && end <= leaveEnd) ||
      (start <= leaveStart && end >= leaveEnd)
    ) {
      overlaps = true;
      if (start >= leaveStart && end <= leaveEnd) {
        isSubset = true;
      }
      if (leave.status === "approved") {
        canMerge = true;
      }
    }
  }

  return { overlaps, isSubset, canMerge };
};

export default api;
