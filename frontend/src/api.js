import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5001/api",
});

// In-memory cache
const cache = new Map();

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
  const response = await api.get(endpoint, {
    params: { t: Date.now() }, // Cache-busting query param
  });
  console.log(`getLeaveBalances - userId=${userId}, endpoint=${endpoint}`);
  return response.data;
};

export const getMyLeaves = async (userId) => {
  const endpoint = userId ? `/leaves/my/${userId}` : "/leaves/my";
  const response = await api.get(endpoint);
  return response.data;
};

export const getMyActions = async (role_id) => {
  let endpoint = "";
  switch (role_id) {
    case 1: // Admin
      endpoint = "/admin/my-actions";
      break;
    case 5: // HR
      endpoint = "/hr/my-actions";
      break;
    case 3: // Manager
      endpoint = "/manager/my-actions";
      break;
    default:
      // Return empty or throw error if called for a role without actions
      console.error("getMyActions called for an invalid role:", role_id);
      return [];
  }

  try {
    const response = await api.get(endpoint);
    return response.data;
  } catch (error) {
    console.error(
      `getMyActions for role ${role_id} error:`,
      error.response?.data || error.message
    );
    throw error;
  }
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
  const response = await api.put(`/admin/users/${employeeId}/assign`, {
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

export const getCalendarData = async ({ period, date }) => {
  try {
    const cacheKey = `calendar_${period}_${date}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
      console.log("Returning cached calendar data:", cacheKey);
      return cached.data;
    }
    const response = await api.get("/leaves/calendar/leave-availability", {
      params: { period, date },
    });
    cache.set(cacheKey, { data: response.data, timestamp: Date.now() });
    return response.data;
  } catch (error) {
    console.error(
      "getCalendarData error:",
      error.response?.data || error.message
    );
    throw error;
  }
};

export const cancelLeave = async (leaveId) => {
  const response = await api.delete(`/leaves/${leaveId}`);
  return response.data;
};

export const checkLeaveOverlap = async (startDate, endDate, userId) => {
  const response = await api.get(`/leaves/${userId}/check-overlap`, {
    params: { startDate, endDate },
  });
  return response.data;
};

export default api;
