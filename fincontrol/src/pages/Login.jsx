import { useState } from "react";
import axios from "axios";

export default function Login({ setToken }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    const res = await axios.post("http://localhost:3001/login", {
      email,
      password,
    });
    localStorage.setItem("token", res.data.token);
    setToken(res.data.token);
  }

  return (
    <div className="flex items-center justify-center h-screen bg-blue-600">
      <div className="bg-white p-8 rounded-xl shadow-lg w-80">
        <h1 className="text-xl font-bold mb-4">Login</h1>
        <input
          className="w-full mb-3 p-2 border rounded"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full mb-3 p-2 border rounded"
          type="password"
          placeholder="Senha"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="w-full bg-blue-600 text-white p-2 rounded"
          onClick={handleLogin}
        >
          Entrar
        </button>
      </div>
    </div>
  );
}
