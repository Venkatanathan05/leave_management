import { useState, useEffect } from "react";
import { jwtDecode } from "jwt-decode";
import { AuthContext } from "./authContext.jsx";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");
    if (storedToken && storedUser) {
      try {
        const decoded = jwtDecode(storedToken);
        if (decoded.exp * 1000 > Date.now()) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        } else {
          logout();
        }
      } catch {
        logout();
      }
    }
  }, []);

  const login = (token, user) => {
    localStorage.setItem("token", token);
    localStorage.setItem(
      "user",
      JSON.stringify({
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role_id: user.role_id,
        role_name: user.role_name, // Added
      })
    );
    setToken(token);
    setUser({
      user_id: user.user_id,
      name: user.name,
      email: user.email,
      role_id: user.role_id,
      role_name: user.role_name,
    });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
