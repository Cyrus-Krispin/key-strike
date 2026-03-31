import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <section className="flex min-h-[70vh] items-center justify-center">
      <SignUp />
    </section>
  );
}
