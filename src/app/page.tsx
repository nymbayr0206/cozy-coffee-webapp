import Link from "next/link";
import { ArrowRight, Coffee, MonitorCog, Smartphone } from "lucide-react";

const appOptions = [
  {
    href: "/pos",
    title: "Kass систем",
    description: "Касс, ээлж, бараа, агуулах, борлуулалт болон тайлангаа удирдана.",
    action: "Касс нээх",
    icon: MonitorCog,
  },
  {
    href: "/user",
    title: "Хэрэглэгчийн app",
    description: "Loyalty карт, тамга, купон, QR эрхээ утаснаасаа ашиглана.",
    action: "User app нээх",
    icon: Smartphone,
  },
] as const;

export default function HomePage() {
  return (
    <main className="app-launcher">
      <section className="launcher-panel" aria-labelledby="launcher-title">
        <div className="launcher-brand">
          <img src="/cozy-coffee-logo.jpg" alt="Cozy Coffee" />
          <span>
            <Coffee size={16} aria-hidden="true" />
            Cozy Coffee
          </span>
        </div>

        <div className="launcher-copy">
          <p>Нэг систем, хоёр хэрэглээ</p>
          <h1 id="launcher-title">Cozy Coffee app сонгоно уу</h1>
        </div>

        <div className="launcher-options">
          {appOptions.map((option) => {
            const Icon = option.icon;

            return (
              <Link className="launcher-option" href={option.href} key={option.href}>
                <span className="launcher-option-icon">
                  <Icon size={24} aria-hidden="true" />
                </span>
                <span className="launcher-option-copy">
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                </span>
                <span className="launcher-option-action">
                  {option.action}
                  <ArrowRight size={16} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
