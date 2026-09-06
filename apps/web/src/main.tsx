import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { AuthProvider } from "./shared/auth";
import { AppLayout, PublicLayout } from "./shared/layout";
import { RequireAuth } from "./shared/require-auth";
import { HomePage } from "./pages/home";
import { LoginPage, RegisterPage } from "./pages/auth";
import { AppsPage } from "./pages/apps";
import { NewAppPage } from "./pages/app-new";
import { AppDetailPage } from "./pages/app-detail";
import { AppStatsPage } from "./pages/app-stats";
import { DocsApi, DocsIndex, DocsLayout, DocsRules, DocsUi } from "./pages/docs";
import { OpsAdminsPage, OpsAnomaliesPage, OpsAppPage, OpsCategoriesPage, OpsConfigPage, OpsReviewPage } from "./pages/ops";

if (
  import.meta.env.PROD &&
  window.location.protocol === "http:" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
) {
  window.location.replace(`https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`);
}

function Forbidden() {
  return <p className="p-10">没有权限</p>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/403" element={<Forbidden />} />
            <Route path="/docs" element={<DocsLayout />}>
              <Route index element={<DocsIndex />} />
              <Route path="api" element={<DocsApi />} />
              <Route path="rules" element={<DocsRules />} />
              <Route path="ui" element={<DocsUi />} />
            </Route>
          </Route>
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/apps" element={<AppsPage />} />
            <Route path="/apps/new" element={<NewAppPage />} />
            <Route path="/apps/:id" element={<AppDetailPage />} />
            <Route path="/apps/:id/stats" element={<AppStatsPage />} />
            <Route
              path="/ops/review"
              element={
                <RequireAuth admin>
                  <OpsReviewPage />
                </RequireAuth>
              }
            />
            <Route
              path="/ops/apps/:id"
              element={
                <RequireAuth admin>
                  <OpsAppPage />
                </RequireAuth>
              }
            />
            <Route
              path="/ops/anomalies"
              element={
                <RequireAuth admin>
                  <OpsAnomaliesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/ops/config"
              element={
                <RequireAuth admin>
                  <OpsConfigPage />
                </RequireAuth>
              }
            />
            <Route
              path="/ops/categories"
              element={
                <RequireAuth admin>
                  <OpsCategoriesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/ops/admins"
              element={
                <RequireAuth superAdmin>
                  <OpsAdminsPage />
                </RequireAuth>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
