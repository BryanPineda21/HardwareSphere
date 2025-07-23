import SignupForm from '@/components/auth/signup-form';

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Join the HWSPhere Community</h1>
          <p className="text-gray-600 mt-2">Create your account to start sharing 3D projects</p>
        </div>
        <SignupForm />
      </div>
    </div>
  );
}
