import EnquiryForm from "@/components/EnquiryForm";

export const metadata = {
  title: "Opt Out | LeadNear Jobs",
  description: "Request removal of your information from LeadNear.",
  alternates: { canonical: "/opt-out" },
};

export default function OptOutPage() {
  return (
    <div className="auth-page auth-page-wide">
      <h1>Opt out</h1>
      <p className="page-lede">
        Ask us to remove your information. Give us enough detail to identify the
        record — the profile link is the most reliable way to match it.
      </p>
      <EnquiryForm
        endpoint="/jobs/api/opt-out"
        submitLabel="Submit request"
        successLabel="Your opt-out request has been submitted."
        fields={[
          { name: "fullName", label: "Full name", required: true, placeholder: "John Doe" },
          { name: "email", label: "Email", type: "email", required: true, placeholder: "your@email.com" },
          { name: "contactNumber", label: "Contact number", placeholder: "+1 123 456 7890" },
          { name: "profileLink", label: "Profile link on our site", placeholder: "https://www.leadnear.com/..." },
          { name: "linkedinUrl", label: "LinkedIn URL", placeholder: "https://www.linkedin.com/in/your-profile" },
        ]}
      />
    </div>
  );
}
