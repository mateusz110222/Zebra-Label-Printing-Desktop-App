import React from "react";
import { HashRouter as Router, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

import { LayoutView, PrintView, LoginView, LabelsFormatsView, ConfigView, HistoryView, ReprintView } from "./views";

function App(): React.JSX.Element {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<LayoutView />}>
              <Route path="/" element={<PrintView />} />
              <Route path="/login" element={<LoginView />} />
              <Route path="templates" element={<LabelsFormatsView />} />
              <Route path="config" element={<ConfigView />} />
              <Route path="history" element={<HistoryView />} />
              <Route path="reprint" element={<ReprintView />} />
            </Route>
            <Route path="*" element={<div>Nie znaleziono strony</div>} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
