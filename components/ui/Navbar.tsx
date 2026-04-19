import { auth } from "@/lib/auth";
import NavbarClient from "@/components/ui/NavbarClient";

export default async function Navbar() {
  const session = await auth();
  return <NavbarClient user={session?.user ?? null} />;
}
