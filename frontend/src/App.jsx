import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import WebPlayer from './pages/WebPlayer';
import RemoteControl from './pages/RemoteControl';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/player" element={<WebPlayer />} />
        <Route path="/remote" element={<RemoteControl />} />
        <Route path="*" element={<Navigate to="/player" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
