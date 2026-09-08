import { permanentRedirect } from "next/navigation";

export default function LegacyAdminPage() {
  permanentRedirect("/backoffice");
}
