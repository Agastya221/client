import NavbarClient from "@/components/ui/NavbarClient";

/**
 * The navbar deliberately does not read the session on the server. Calling auth() here
 * reads cookies, which forced every page that renders the navbar (all of them, via the
 * root layout) to be re-rendered per request, so no page could ever be served from cache.
 * NavbarClient fetches /api/auth/session in the browser when it gets no user.
 */
export default function Navbar() {
  return <NavbarClient user={null} />;
}
