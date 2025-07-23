'use client';

import { useAuth } from '@/hooks/use-auth';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, Settings, Plus, LogOut } from 'lucide-react';
import AuthGuard from '@/components/auth/auth-guard';
import { getCurrentUser } from '@/lib/api';
import { useRouter } from 'next/navigation';



export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

function DashboardContent() {
  const { user, userProfile, logout } = useAuth();
  const [backendData, setBackendData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const router = useRouter();
  // Test backend connection
  useEffect(() => {
    const testBackendConnection = async () => {
      try {
        setLoading(true);
        const data = await getCurrentUser();
        setBackendData(data);
        console.log('Backend data:', data);
      } catch (err: any) {
        setError(err.message);
        console.error('Backend error:', err);
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      testBackendConnection();
    }
  }, [user]);

  const handleLogout = async () => {
    await logout();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
              <p className="text-gray-600">Welcome back, {userProfile?.displayName || user?.email}</p>
            </div>
            <div className="flex items-center space-x-4">
             <Button variant={"secondary"} size="sm" onClick={() => router.push('/dashboard/new-project')}>
              <Plus className="h-4 w-4 mr-2 text-white rounded-full p-1" />
                New Project
              </Button>
              <Button variant={"secondary"} size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          
          {/* User Profile Card */}
          <Card>
            <CardHeader className="flex flex-row items-center space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Profile</CardTitle>
              <User className="h-4 w-4 ml-auto" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={userProfile?.avatar} />
                  <AvatarFallback>
                    {userProfile?.displayName ? getInitials(userProfile.displayName) : 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{userProfile?.displayName}</p>
                  <p className="text-xs text-gray-500">{userProfile?.email}</p>
                  {userProfile?.username && (
                    <p className="text-xs text-blue-600">@{userProfile.username}</p>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full mt-4">
                <Settings className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            </CardContent>
          </Card>

          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Your Stats</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Projects:</span>
                  <span className="font-medium">{userProfile?.stats?.totalProjects || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Views:</span>
                  <span className="font-medium">{userProfile?.stats?.totalViews || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Likes:</span>
                  <span className="font-medium">{userProfile?.stats?.totalLikes || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Backend Connection Test */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Backend Status</CardTitle>
              <CardDescription>Testing API connection</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-gray-600">Connecting to backend...</p>
              ) : error ? (
                <div className="space-y-2">
                  <p className="text-sm text-red-600">❌ Connection failed</p>
                  <p className="text-xs text-gray-500">{error}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-green-600">✅ Connected successfully</p>
                  <p className="text-xs text-gray-500">
                    Backend user ID: {backendData?.id?.slice(0, 8)}...
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Debug Information (remove in production) */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Debug Info</CardTitle>
            <CardDescription>Firebase + Backend data (for development)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-medium mb-2">Firebase Auth User:</h4>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {JSON.stringify({
                    uid: user?.uid,
                    email: user?.email,
                    emailVerified: user?.emailVerified
                  }, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Backend Response:</h4>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto">
                  {backendData ? JSON.stringify(backendData, null, 2) : 'No data'}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}