'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Eye, Heart, Pin, PinOff, ImageIcon, Download, Trash2, Dot } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter

// --- Interface Definitions ---
interface Project {
  id: string;
  title: string;
  authorName: string;
  username: string;
  authorAvatar?: string;
  files: {
    thumbnail?: { url:string };
  };
  stats: {
    views: number;
    likes: number;
    downloads: number;
  };
  isPinned?: boolean;
  createdAt: string | { _seconds: number, _nanoseconds: number };
}

interface ProjectCardProps {
  project: Project;
  isOwnProfile?: boolean;
  onPinToggle?: (projectId: string) => void;
  onDelete: (projectId: string) => void;
  compact?: boolean;
}

// --- Helper Function ---
const formatFirestoreTimestamp = (timestamp: any): string => {
  if (!timestamp) return 'just now';
  try {
    if (timestamp && typeof timestamp === 'object' && timestamp._seconds) {
      return formatDistanceToNow(new Date(timestamp._seconds * 1000));
    }
    return formatDistanceToNow(new Date(timestamp));
  } catch (error) {
    console.error("Failed to format date:", timestamp, error);
    return 'a while';
  }
};

// --- Main Component ---
export function ProjectCard({ project, isOwnProfile, onPinToggle, onDelete, compact = false }: ProjectCardProps) {
  const [isImageLoading, setImageLoading] = useState(true);
  const router = useRouter(); // Initialize router

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete(project.id);
  };

  // --- FIX: Navigate to user profile on author click ---
  const handleAuthorClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent the main card link from firing
    e.preventDefault();
    router.push(`/user/${project.username}`);
  };

  // --- COMPACT LAYOUT ---
  if (compact) {
    return (
      <div className="group relative flex w-full items-center space-x-4 rounded-lg border bg-card p-3 transition-all hover:bg-muted dark:hover:bg-slate-800/60">
        <Link href={`/project/${project.id}`} className="flex-shrink-0" aria-label={project.title}>
          <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden">
            {project.files.thumbnail?.url ? (
              <img src={project.files.thumbnail.url} alt={project.title} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
        </Link>
        <div className="flex-grow overflow-hidden">
          <Link href={`/project/${project.id}`} className="block">
            <h3 className="truncate font-medium text-card-foreground">{project.title}</h3>
          </Link>
          <div className="flex items-center text-xs text-muted-foreground mt-1 flex-wrap">
            <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {project.stats.views.toLocaleString()}</span>
            <Dot className="h-4 w-4" />
            <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {project.stats.likes.toLocaleString()}</span>
            <Dot className="h-4 w-4" />
            <span className="flex items-center gap-1"><Download className="h-3 w-3" /> {project.stats.downloads.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {isOwnProfile && onPinToggle && (
            <Button size="icon" variant="ghost" className="h-8 w-8" title={project.isPinned ? 'Unpin project' : 'Pin project'} onClick={(e) => { e.preventDefault(); onPinToggle?.(project.id); }}>
              {project.isPinned ? <PinOff className="h-4 w-4 text-blue-500" /> : <Pin className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />}
            </Button>
          )}
          {isOwnProfile && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-500 hover:bg-red-500/10" title="Delete project">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This action cannot be undone. This will permanently delete your project and remove its data from our servers.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    );
  }

  // --- GRID LAYOUT (REVAMPED) ---
  return (
    <div className="group relative h-full w-full">
      <div className="absolute top-3 right-3 z-20 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        {isOwnProfile && onPinToggle && (
          <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full bg-black/40 text-white hover:bg-black/60" title={project.isPinned ? 'Unpin project' : 'Pin project'} onClick={() => onPinToggle?.(project.id)}>
            {project.isPinned ? <PinOff className="h-4 w-4 text-blue-400" /> : <Pin className="h-4 w-4" />}
          </Button>
        )}
        {isOwnProfile && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="secondary" className="h-8 w-8 rounded-full bg-black/40 text-white hover:bg-red-500/70" title="Delete project">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle><AlertDialogDescription>This will permanently delete your project.</AlertDialogDescription></AlertDialogHeader>
              <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <Card className="relative h-full w-full overflow-hidden rounded-xl transition-all duration-300 ease-in-out group-hover:-translate-y-1 bg-card flex flex-col shadow-md dark:shadow-black/20 group-hover:shadow-xl group-hover:shadow-purple-500/20 dark:group-hover:shadow-purple-400/10">
        <Link href={`/project/${project.id}`} className="h-full flex flex-col" aria-label={project.title}>
          <CardHeader className="p-0 border-b dark:border-slate-800">
            <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
              {isImageLoading && <div className="w-full h-full bg-slate-200 dark:bg-slate-800 animate-pulse"></div>}
              {project.files.thumbnail?.url ? (
                <img 
                  src={project.files.thumbnail.url} 
                  alt={project.title} 
                  loading="lazy"
                  className={`h-full w-full object-cover transition-all duration-500 group-hover:scale-105 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                  onLoad={() => setImageLoading(false)}
                />
              ) : (
                <div className={`flex items-center justify-center w-full h-full ${isImageLoading ? 'hidden' : ''}`}>
                   <ImageIcon className="h-10 w-10 text-muted-foreground" />
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4 flex flex-col flex-grow">
            <div className="flex-grow">
              <h3 className="font-semibold text-lg truncate text-card-foreground">{project.title}</h3>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                <span className="flex items-center gap-1.5"><Eye className="h-4 w-4" /> {project.stats.views.toLocaleString()}</span>
                <span className="flex items-center gap-1.5"><Heart className="h-4 w-4" /> {project.stats.likes.toLocaleString()}</span>
                <span className="flex items-center gap-1.5"><Download className="h-4 w-4" /> {project.stats.downloads.toLocaleString()}</span>
              </div>
            </div>
            {/* --- FIX: Author section is now a clickable link --- */}
            <div 
              className="border-t dark:border-slate-800 mt-4 pt-3 flex items-center gap-3 cursor-pointer rounded-b-lg -mx-4 -mb-4 px-4 pb-4 hover:bg-muted/50 transition-colors"
              onClick={handleAuthorClick}
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src={project.authorAvatar} />
                <AvatarFallback>{project.authorName?.[0]}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium text-foreground truncate">{project.authorName}</p>
                <p className="text-xs text-muted-foreground"> {formatFirestoreTimestamp(project.createdAt)} ago</p>
              </div>
            </div>
          </CardContent>
        </Link>
      </Card>
    </div>
  );
}
