import { Navigate, Route, Routes } from "react-router-dom";
import Privacy from "./pages/Privacy";
import Sidequester from "./pages/Sidequester";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Sidequester />} />
      <Route path="/sidequester" element={<Sidequester />} />
      <Route path="/admin" element={<Sidequester admin />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
