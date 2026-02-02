import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout";
import { AuthProvider } from "./context/AuthContext";

import ConfigView from "./views/ConfigView";
import PrintView from "./views/PrintView";
import LabelsFormats from "./views/LabelsFormats";
import History from "./views/History";
import Login from "./views/Login";
import React from "react";

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="/" element={<PrintView />} />
            <Route path="/login" element={<Login />} />
            <Route path="templates" element={<LabelsFormats />} />
            <Route path="config" element={<ConfigView />} />
            <Route path="history" element={<History />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
export default App;
