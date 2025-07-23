'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { ProjectCard } from '@/components/project-card';
import { 
  Github, 
  Linkedin, 
  Calendar, 
  AlertTriangle,
  User,
  Edit,
  Pin,
  Grid3x3,
  LayoutGrid,
  MapPin,
  Sparkles,
  PlusCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { Toaster, toast } from 'sonner';

// --- Interface Definitions ---
interface Project {
  id: string;
  title: string;
  files: { thumbnail?: { url: string } };
  stats: { views: number; likes: number; downloads?: number };
  isPinned?: boolean;
  createdAt: string;
  visibility?: string;
  authorName: string;
  username: string;
  authorAvatar?: string;
}

interface UserProfile {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  avatar?: string;
  backgroundImage?: string;
  github?: string;
  linkedin?: string;
  location?: string;
  skills?: string[];
  stats: { totalProjects: number; totalViews: number; totalLikes: number };
  createdAt: string;
  allProjects: Project[]; 
}

// --- Skeleton Loader for a smoother loading experience ---
const ProfileSkeleton = () => (
  <div className="min-h-screen bg-slate-50 dark:bg-slate-900 animate-pulse">
    <div className="h-48 md:h-64 bg-slate-200 dark:bg-slate-800"></div>
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
      <div className="relative -mt-16 md:-mt-20 mb-8">
        <div className="flex flex-col md:flex-row md:items-end md:space-x-6">
          <div className="h-32 w-32 md:h-40 md:w-40 rounded-full bg-slate-300 dark:bg-slate-700 border-4 border-white dark:border-slate-900"></div>
          <div className="mt-4 md:mt-0 flex-grow">
            <div className="h-10 w-48 bg-slate-300 dark:bg-slate-700 rounded-md"></div>
            <div className="h-6 w-32 bg-slate-200 dark:bg-slate-700 rounded-md mt-2"></div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
        </div>
        <div className="lg:col-span-8 xl:col-span-9 space-y-8">
          <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-lg"></div>
        </div>
      </div>
    </div>
  </div>
);


// --- Main Page Component ---
export default function UserProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user: loggedInUser } = useAuth();
  const username = params.username as string;
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [layoutMode, setLayoutMode] = useState<'grid' | 'compact'>('grid');
  
  useEffect(() => {
    if (profile?.backgroundImage) {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = profile.backgroundImage;
      document.head.appendChild(link);
      return () => {
        document.head.removeChild(link);
      };
    }
  }, [profile?.backgroundImage]);

  const fetchUserProfile = useCallback(async () => {
    if (!username) return;
    
    try {
      setLoading(true);
      const headers: HeadersInit = {};
      if (loggedInUser) {
        const token = await loggedInUser.getIdToken();
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/${username}`, { 
        headers,
        next: { revalidate: 60 }
      });
      
      if (!response.ok) throw new Error('User not found');
      const data = await response.json();

      // --- FIX: Inject author details into each project to make ProjectCard scalable ---
      const allProjects = [...(data.pinnedProjects || []), ...(data.otherProjects || [])]
        .map(project => ({
          ...project,
          authorName: data.displayName,
          username: data.username,
          authorAvatar: data.avatar,
        }))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setProfile({ ...data, allProjects });

    } catch (err: any) {
      setError(err.message || 'Failed to load user profile');
    } finally {
      setLoading(false);
    }
  }, [username, loggedInUser]);

  useEffect(() => {
    fetchUserProfile();
  }, [fetchUserProfile]);

  const handlePinToggle = async (projectId: string) => {
    if (!profile || !loggedInUser) return;
    
    const originalProfile = { ...profile };
    
    const updatedProjects = profile.allProjects.map(p => 
      p.id === projectId ? { ...p, isPinned: !p.isPinned } : p
    );
    const projectToToggle = profile.allProjects.find(p => p.id === projectId);
    const isCurrentlyPinned = projectToToggle?.isPinned;

    if (!isCurrentlyPinned && updatedProjects.filter(p => p.isPinned).length > 4) {
      toast.error("Cannot Pin Project", { description: "You can only pin a maximum of 4 projects." });
      return;
    }
    
    setProfile({ ...profile, allProjects: updatedProjects });

    try {
      const token = await loggedInUser.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/users/projects/${projectId}/toggle-pin`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to update pin status.');
      toast.success(isCurrentlyPinned ? "Project unpinned" : "Project pinned");
    } catch (err: any) {
      toast.error("Update Failed", { description: err.message });
      setProfile(originalProfile);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    if (!loggedInUser || !profile) return;
    const originalProfile = { ...profile };
    
    setProfile(prev => {
      if (!prev) return prev;
      return { ...prev, allProjects: prev.allProjects.filter(p => p.id !== projectId), stats: { ...prev.stats, totalProjects: prev.stats.totalProjects - 1 }};
    });

    toast.promise(
      async () => {
        const token = await loggedInUser.getIdToken();
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Failed to delete project.');
      },
      {
        loading: 'Deleting project...',
        success: 'Project deleted successfully!',
        error: (err) => {
          setProfile(originalProfile);
          return err.message;
        },
      }
    );
  };

  const isOwnProfile = loggedInUser?.uid === profile?.id;
  
  const pinnedProjects = useMemo(() => profile?.allProjects.filter(p => p.isPinned) || [], [profile?.allProjects]);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2 dark:text-white">User Not Found</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
        <Button onClick={() => router.push('/')}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <Toaster position="top-center" richColors />
      
      <div className="h-48 md:h-64 bg-gradient-to-br from-blue-600 to-purple-700 dark:from-blue-800 dark:to-purple-900 relative overflow-hidden">
        {profile.backgroundImage && <img src={profile.backgroundImage} alt={`${profile.displayName}'s banner`} className="w-full h-full object-cover opacity-90" loading="eager" fetchPriority="high" />}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-50 dark:from-slate-900 via-transparent to-transparent" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="relative -mt-16 md:-mt-20 mb-8">
          <div className="flex flex-col md:flex-row md:items-end md:space-x-6">
            <Avatar className="h-32 w-32 md:h-40 md:w-40 border-4 border-white dark:border-slate-900 shadow-xl flex-shrink-0 bg-white dark:bg-slate-800">
              <AvatarImage src={profile.avatar} loading="lazy" />
              <AvatarFallback className="text-4xl bg-gradient-to-br from-blue-500 to-purple-600 text-white">{profile.displayName?.[0]}</AvatarFallback>
            </Avatar>
            <div className="mt-4 md:mt-0 flex-grow">
              <div className="flex flex-col md:flex-row justify-between items-start">
                <div>
                  <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-slate-50">{profile.displayName}</h1>
                  <p className="text-md text-slate-500 dark:text-slate-400">@{profile.username}</p>
                </div>
                {isOwnProfile && (
                  <div className="flex items-center gap-2 mt-4 md:mt-0">
                    <Button onClick={() => router.push('/dashboard/profile')} variant="outline"><Edit className="h-4 w-4 mr-2" /> Edit Profile</Button>
                  </div>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-x-4 gap-y-2 mt-3 text-slate-600 dark:text-slate-400">
                {profile.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{profile.location}</span>}
                {profile.github && <a href={`https://github.com/${profile.github}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"><Github className="h-4 w-4" /><span>GitHub</span></a>}
                {profile.linkedin && <a href={`https://linkedin.com/in/${profile.linkedin}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-blue-600 transition-colors"><Linkedin className="h-4 w-4" /><span>LinkedIn</span></a>}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 xl:col-span-3 space-y-6">
            <Card className="shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-lg">About</CardTitle></CardHeader><CardContent><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{profile.bio || 'No bio provided.'}</p><div className="text-xs text-slate-500 dark:text-slate-400 mt-4 flex items-center"><Calendar className="h-3 w-3 mr-2" />Joined {formatDistanceToNow(new Date(profile.createdAt))} ago</div></CardContent></Card>
            {profile.skills && profile.skills.length > 0 && (
              <Card className="shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-lg flex items-center gap-2"><Sparkles className="h-4 w-4 text-purple-500"/> Skills</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">{profile.skills.map(skill => <Badge key={skill} variant="secondary">{skill}</Badge>)}</CardContent></Card>
            )}
            <Card className="shadow-sm"><CardHeader className="pb-3"><CardTitle className="text-lg">Statistics</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex justify-between items-center text-sm"><span className="text-slate-500 dark:text-slate-400">Projects</span><span className="font-semibold">{profile.stats.totalProjects}</span></div><div className="flex justify-between items-center text-sm"><span className="text-slate-500 dark:text-slate-400">Total Views</span><span className="font-semibold">{profile.stats.totalViews.toLocaleString()}</span></div><div className="flex justify-between items-center text-sm"><span className="text-slate-500 dark:text-slate-400">Total Likes</span><span className="font-semibold">{profile.stats.totalLikes.toLocaleString()}</span></div></CardContent></Card>
          </div>

          <div className="lg:col-span-8 xl:col-span-9 space-y-8">
            {pinnedProjects.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold mb-4 text-slate-900 dark:text-slate-100 flex items-center gap-2"><Pin className="h-5 w-5" /> Pinned Projects</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* --- FIX: Simplified props, passing the complete project object --- */}
                  {pinnedProjects.map((project) => <ProjectCard key={project.id} project={{...project, stats: {...project.stats, downloads: project.stats.downloads || 0}}} isOwnProfile={isOwnProfile} onPinToggle={handlePinToggle} onDelete={handleDeleteProject} />)}
                </div>
              </section>
            )}

            <section>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">All Projects {profile.allProjects.length > 0 && `(${profile.allProjects.length})`}</h2>
                <div className="flex items-center gap-2">
                  {profile.allProjects.length > 0 && (
                    <>
                      <Button size="sm" variant={layoutMode === 'grid' ? 'default' : 'outline'} onClick={() => setLayoutMode('grid')} className="h-8"><Grid3x3 className="h-4 w-4" /></Button>
                      <Button size="sm" variant={layoutMode === 'compact' ? 'default' : 'outline'} onClick={() => setLayoutMode('compact')} className="h-8"><LayoutGrid className="h-4 w-4" /></Button>
                    </>
                  )}
                  {isOwnProfile && <Button onClick={() => router.push('/project/create')}><PlusCircle className="h-4 w-4 mr-2" /> Create</Button>}
                </div>
              </div>
              
              {profile.allProjects.length > 0 ? (
                <ScrollArea className={`w-full h-[420px] ${layoutMode === 'compact' ? 'rounded-md border' : ''}`}>
                  <div className={`flex ${layoutMode === 'compact' ? 'flex-col gap-3 p-4' : 'gap-4 py-2'}`}>
                    {profile.allProjects.map((project) => (
                      <div key={project.id} className={`${layoutMode === 'compact' ? 'w-full' : 'w-[280px] md:w-[300px] flex-shrink-0'}`}>
                        {/* --- FIX: Simplified props, passing the complete project object --- */}
                        <ProjectCard project={{...project, stats: {...project.stats, downloads: project.stats.downloads || 0}}} isOwnProfile={isOwnProfile} onPinToggle={handlePinToggle} onDelete={handleDeleteProject} compact={layoutMode === 'compact'} />
                      </div>
                    ))}
                  </div>
                  <ScrollBar orientation={layoutMode === 'compact' ? 'vertical' : 'horizontal'} className="data-[orientation=vertical]:w-1.5 data-[orientation=horizontal]:h-1.5" />
                </ScrollArea>
              ) : (
                <Card className="border-2 border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <User className="h-12 w-12 text-slate-400 mb-4" />
                    <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100">No Projects Yet</h3>
                    <p className="text-slate-600 dark:text-slate-400 text-center mt-2">Ready to showcase your work? Create your first project!</p>
                    {isOwnProfile && <Button className="mt-4" onClick={() => router.push('/project/create')}><PlusCircle className="h-4 w-4 mr-2" /> Create Your First Project</Button>}
                  </CardContent>
                </Card>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}