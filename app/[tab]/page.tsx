import Home from "../page";

const APP_TABS = ["today", "learn", "feed", "review", "report", "settings"] as const;
type AppTab = typeof APP_TABS[number];

function isValidTab(value: unknown): value is AppTab {
  return typeof value === "string" && (APP_TABS as readonly string[]).includes(value);
}

export function generateStaticParams() {
  return APP_TABS.map((tab) => ({ tab }));
}

export default async function TabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  const validTab: AppTab = isValidTab(tab) ? tab : "today";
  return <Home initialTab={validTab} />;
}
