import EnquiryForm from "@/components/EnquiryForm";

export const metadata = {
  title: "Contact Us | LeadNear Jobs",
  description: "Get in touch about posting jobs, hiring solutions, or anything else.",
  alternates: { canonical: "/contact-us" },
};

export default function ContactPage() {
  return (
    <div className="auth-page auth-page-wide">
      <h1>Contact us</h1>
      <p className="page-lede">
        Posting a role, exploring hiring solutions, or something else — send us the details and we&apos;ll come back to you.
      </p>
      <EnquiryForm
        endpoint="/jobs/api/contact"
        submitLabel="Send message"
        successLabel="Thanks — we'll be in touch."
        fields={[
          { name: "name", label: "Your name", required: true, placeholder: "Jane Doe" },
          { name: "email", label: "Email", type: "email", required: true, placeholder: "you@company.com" },
          { name: "subject", label: "Subject", required: true, placeholder: "Post a job" },
          { name: "message", label: "Message", type: "textarea", required: true, placeholder: "Tell us what you need…" },
        ]}
      />
    </div>
  );
}
