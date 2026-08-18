import { Header } from '@/components/layout/Header';

/**
 * Shell for every shopping route.
 *
 * The header lives here rather than in each page, and that is the whole point of this layout.
 * In the App Router, layout output persists across navigation while page output is unmounted and
 * replaced. With `<Header />` rendered by each page — as it was — every navigation tore down and
 * re-created the entire top bar, including the two queries behind its category rail and account
 * link. The visible result was the header flickering on every click.
 *
 * Rendered here it mounts once and survives navigation. The route group `(shop)` does not appear in
 * any URL; it exists so the sign-in pages under `(auth)` can opt out of this chrome.
 */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
    </>
  );
}
