import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <section className="flex min-h-[70vh] items-center justify-center">
      <SignIn />
    </section>
  );
}
