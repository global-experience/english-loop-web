import Home from "../page";

const APP_TABS = ["today", "learn", "feed", "review", "report", "settings"] as const;

export function generateStaticParams() {
  return APP_TABS.map((tab) => ({ tab }));
}

export default function TabPage() {
  return <Home />;
}
