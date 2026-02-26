import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  if (!token) return <Login setToken={setToken} />;
  return (
    <Dashboard
      onLogout={() => {
        localStorage.removeItem("token");
        setToken(null);
      }}
    />
  );
}
