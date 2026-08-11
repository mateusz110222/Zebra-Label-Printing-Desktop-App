import React from "react";
import { HashRouter as Router, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

import { ConfigView, LabelEditView, LabelsFormatsView, LayoutView, LoginView, PrintView, ReprintView } from "./views";

function App(): React.JSX.Element {
  const { t } = useTranslation();

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
              <Route path="reprint" element={<ReprintView />} />
            </Route>
            <Route path="/preview" element={<LabelEditView />} />
            <Route path="*" element={<div>{t("common.page_not_found")}</div>} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
