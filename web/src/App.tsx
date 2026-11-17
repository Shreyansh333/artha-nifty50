import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Skeleton } from "./components/ui";

const Overview = lazy(() => import("./pages/Overview"));
const CompanyPage = lazy(() => import("./pages/Company"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Compare = lazy(() => import("./pages/Compare"));
const Intelligence = lazy(() => import("./pages/Intelligence"));
const Screener = lazy(() => import("./pages/Screener"));
const Exports = lazy(() => import("./pages/Exports"));
const Methodology = lazy(() => import("./pages/Methodology"));

function PageFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      <Skeleton className="h-96" />
    </div>
  );
}

function Shell() {
  const loc = useLocation();
  return (
    <Layout>
      <ErrorBoundary resetKey={loc.pathname}>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/company" element={<Navigate to="/company/RELIANCE" replace />} />
            <Route path="/company/:symbol" element={<CompanyPage />} />
            <Route path="/company/:symbol/:tab" element={<CompanyPage />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/intelligence" element={<Intelligence />} />
            <Route path="/screener" element={<Screener />} />
            <Route path="/exports" element={<Exports />} />
            <Route path="/methodology" element={<Methodology />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Shell />
    </BrowserRouter>
  );
}
