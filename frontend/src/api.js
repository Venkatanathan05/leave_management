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

export default api;
