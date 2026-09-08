import { permanentRedirect } from "next/navigation";

export default function LegacyAdminJobsPage() {
  permanentRedirect("/backoffice");
}
