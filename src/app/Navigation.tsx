"use client";
import { usePathname } from "next/navigation";

export default function Navigation() {
  const path = usePathname();
  return (
    <nav className="global-nav" aria-label="주 메뉴">
      <a href="/" className="brand">
        COFFEERIGHT
      </a>
      <div>
        {[
          ["/applicants", "서류 평가"],
          ["/interviews", "면접·최종 선발"],
          ["/import", "CSV 가져오기"],
          ["/hermes", "Hermes"],
          ["/reviewer", "평가자 설정"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            aria-current={path.startsWith(href) ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
