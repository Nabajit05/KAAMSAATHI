"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/Icon";
import { Card } from "@/components/ui";
import { caseClient } from "@/features/cases/client";
import type { FixtureId } from "@/fixtures/demo";
import { useT } from "../providers";

const EXAMPLES: Array<{ id: FixtureId; en: [string, string]; hi: [string, string] }> = [
  { id: "A", en: ["Incentive paid less", "Offer: ₹600 for 30 orders. 32 done, ₹300 credited."], hi: ["इंसेंटिव कम मिला", "ऑफ़र: 30 ऑर्डर पर ₹600। 32 किए, ₹300 मिले।"] },
  { id: "B", en: ["Target not reached", "Same offer, 29 orders, no incentive."], hi: ["टारगेट पूरा नहीं हुआ", "वही ऑफ़र, 29 ऑर्डर, कोई इंसेंटिव नहीं।"] },
  { id: "C", en: ["Screenshot cut off", "Offer conditions and dates are missing."], hi: ["स्क्रीनशॉट कटा हुआ", "ऑफ़र की शर्तें और तारीखें नहीं दिख रहीं।"] },
  { id: "D", en: ["Bank transfer looks low", "Earned ₹1,200 but ₹800 reached the bank."], hi: ["बैंक में कम पैसा आया", "₹1,200 कमाए लेकिन बैंक में ₹800 आए।"] },
  { id: "E", en: ["Contractor wages due", "8 days at ₹700, paid ₹2,000."], hi: ["ठेकेदार की मज़दूरी बाकी", "₹700 रोज़ पर 8 दिन, ₹2,000 मिले।"] },
];

export default function DemoPage() {
  const { t, locale } = useT();
  const router = useRouter();

  const start = (id: FixtureId) => {
    const c = caseClient.createDemo(id, locale);
    router.push(`/cases/${c.id}/${id === "E" ? "review" : "evidence"}`);
  };

  return (
    <AppShell variant="task" title={t("welcome.tryExample")} backHref="/" demo>
      <h1 className="text-2xl font-semibold">{t("welcome.tryExample")}</h1>
      <p className="mt-2 text-muted">{t("app.demoBannerLong")}</p>
      <ul className="mt-5 space-y-3">
        {EXAMPLES.map((ex) => {
          const [title, body] = ex[locale];
          return (
            <Card as="li" key={ex.id} className="p-0">
              <button
                type="button"
                onClick={() => start(ex.id)}
                className="flex w-full items-center gap-4 rounded-[var(--radius-card)] p-5 text-left hover:bg-sunken"
              >
                <span aria-hidden className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-soft font-semibold text-primary">
                  {ex.id}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{title}</span>
                  <span className="block text-muted">{body}</span>
                </span>
                <Icon name="chevronRight" className="shrink-0 text-muted" />
              </button>
            </Card>
          );
        })}
      </ul>
    </AppShell>
  );
}
