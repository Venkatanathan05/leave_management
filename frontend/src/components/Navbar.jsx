import { useAuth } from "../authContext.jsx";
import { useNavigate } from "react-router-dom";
import "../styles/Navbar.css";

function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <div className="navbar-logo">
        <h1>Leave App</h1>
      </div>
      {user && (
        <button className="navbar-signout" onClick={handleLogout}>
          Sign Out
        </button>
      )}
    </nav>
  );
}

export default Navbar;
