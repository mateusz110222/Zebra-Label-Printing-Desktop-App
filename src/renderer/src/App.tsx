import React from "react";
import { HashRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

import {
  AuditLogsView,
  ConfigView,
  LabelEditView,
  LabelsFormatsView,
  LayoutView,
  LoginView,
  PrintView,
  ReprintView,
  SystemHealthView
} from "./views";

function ItProtectedRoute({
  children,
}: {
  children: React.JSX.Element;
}): React.JSX.Element {
  const { CanEdit } = useAuth();
  return CanEdit ? children : <Navigate to="/login" replace />;
}

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
              <Route
                path="reprint"
                element={
                  <ItProtectedRoute>
                    <ReprintView />
                  </ItProtectedRoute>
                }
              />
              <Route path="history" element={<AuditLogsView />} />
              <Route path="health" element={<SystemHealthView />} />
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
