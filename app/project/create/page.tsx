import ProjectForm from '@/components/project/project-form';
import AuthGuard from '@/components/auth/auth-guard';

export default function NewProjectPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <ProjectForm />
      </div>
    </AuthGuard>
  );
}