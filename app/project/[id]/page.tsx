"use client";

import { useEffect, useState, useMemo, useCallback, Suspense, startTransition, useDeferredValue } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from 'next/dynamic';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import {
  Download,
  Eye,
  Heart,
  Calendar,
  FileText,
  FileCode,
  FileVideo,
  File as FileIcon,
  Box,
  Loader2,
  AlertTriangle,
  Info,
  List,
  ChevronLeft,
  Edit,
  Lock,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ShareButton from "@/components/share-button";

// 🚀 OPTIMIZATION: Dynamic imports for better code splitting
const ModelViewer = dynamic(() => import("@/components/three/model-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton type="3D Model" />
});

const PDFViewer = dynamic(() => import("@/components/PDF/PDF-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton type="PDF Document" />
});

const CodeViewer = dynamic(() => import("@/components/CODE/code-viewer"), {
  ssr: false,
  loading: () => <ViewerSkeleton type="Code File" />
});

const VideoPlayer = dynamic(() => import("@/components/MP4/video-player"), {
  ssr: false,
  loading: () => <ViewerSkeleton type="Video" />
});

// TypeScript interfaces
interface FileAttachment {
  type: "model" | "code" | "documentation" | "video" | "other";
  url: string;
  filename: string;
  size: number;
  storagePath?: string;
}

interface ProjectData {
  id: string;
  title: string;
  description: string;
  tags: string[];
  authorName: string;
  authorAvatar?: string;
  username: string;
  userId: string;
  visibility?: "public" | "private";
  files: {
    model?: {
      glb?: { url: string; filename: string; size: number };
      stl?: { url: string; filename: string; size: number };
    };
    thumbnail?: { url: string };
    attachments?: Array<Omit<FileAttachment, "type"> & { type: string }>;
  };
  stats: {
    views: number;
    likes: number;
  };
  allowDownloads: boolean;
  createdAt: string;
  conversionStatus?: {
    inProgress: boolean;
    completed: boolean;
    errors: any[];
  };
}

// 🚀 OPTIMIZATION: Client-side cache for reducing API calls
class ProjectCache {
  private cache = new Map<string, { data: ProjectData; timestamp: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  set(projectId: string, data: ProjectData): void {
    this.cache.set(projectId, {
      data,
      timestamp: Date.now(),
    });
  }

  get(projectId: string): ProjectData | null {
    const item = this.cache.get(projectId);
    if (!item) return null;

    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(projectId);
      return null;
    }

    return item.data;
  }

  invalidate(projectId: string): void {
    this.cache.delete(projectId);
  }
}

const projectCache = new ProjectCache();

// 🚀 OPTIMIZATION: Loading skeleton for better UX
function ViewerSkeleton({ type }: { type: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 animate-pulse">
      <div className="w-16 h-16 bg-slate-300 dark:bg-slate-700 rounded-lg mb-4"></div>
      <p className="text-slate-500 dark:text-slate-400">Loading {type}...</p>
    </div>
  );
}

// 🚀 OPTIMIZATION: File preloader for better LCP (Firebase Storage safe)
function FilePreloader({ files }: { files: Array<{ url: string; type: string; priority?: boolean }> }) {
  useEffect(() => {
    files.forEach((file) => {
      if (file.priority && file.url) {
        const isFirebaseStorage = file.url.includes('firebasestorage.app') || 
                                file.url.includes('googleapis.com') ||
                                file.url.includes('storage.googleapis.com');
        
        if (isFirebaseStorage) {
          // Skip prefetching for Firebase Storage - signed URLs already optimized
          console.log('🚀 Skipping prefetch for Firebase Storage (signed URL):', file.url.split('?')[0]);
          return;
        }
        
        // Only preload non-Firebase files
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = file.url;
        link.as = 'fetch';
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
        
        console.log('🚀 Preloading external file:', file.url);
        
        // Cleanup on unmount
        return () => {
          if (document.head.contains(link)) {
            document.head.removeChild(link);
          }
        };
      }
    });
  }, [files]);

  return null;
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const { user: loggedInUser, loading: authLoading } = useAuth();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"details" | "files">("files");
  const [activeFile, setActiveFile] = useState<FileAttachment | null>(null);
  const [viewCountIncremented, setViewCountIncremented] = useState(false);

  // 🚀 OPTIMIZATION: React 19 - Use deferred value for better INP
  const deferredProject = useDeferredValue(project);

  const isOwner = loggedInUser?.uid === project?.userId;

  // 🚀 OPTIMIZATION: Enhanced fetchProject with caching
  const fetchProject = useCallback(async (): Promise<void> => {
    if (!projectId) return;

    try {
      // Try cache first
      const cached = projectCache.get(projectId);
      if (cached) {
        console.log('🚀 Cache HIT:', projectId);
        setProject(cached);
        setLoading(false);
        return;
      }

      console.log('🚀 Cache MISS:', projectId);

      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };

      if (loggedInUser) {
        try {
          const token = await loggedInUser.getIdToken(true);
          headers["Authorization"] = `Bearer ${token}`;
        } catch (tokenError) {
          console.error("Failed to get auth token:", tokenError);
        }
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`,
        {
          method: "GET",
          headers,
          credentials: "include",
          // 🚀 OPTIMIZATION: Adjusted caching for better Firebase compatibility
          cache: 'default', // Changed from 'force-cache' for better Firebase signed URL handling
        }
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(
          errorData.error || `Failed to load project (${response.status})`
        );
      }

      const data: ProjectData = await response.json();
      
      // Cache the result
      projectCache.set(projectId, data);
      
      setProject(data);
      setError("");

      // 🚀 OPTIMIZATION: React 19 - Use startTransition for non-urgent updates
      startTransition(() => {
        // Auto-select first available file
        if (data.files?.model?.glb && !data.conversionStatus?.inProgress) {
          setActiveFile({
            type: "model",
            url: data.files.model.glb.url,
            filename: data.files.model.stl?.filename || data.files.model.glb.filename,
            size: data.files.model.stl?.size || data.files.model.glb.size,
          });
        } else if (data.files?.attachments?.[0]) {
          setActiveFile(data.files.attachments[0] as FileAttachment);
        }
      });

      // Handle conversion status polling
      if (data.conversionStatus?.inProgress) {
        setTimeout(() => fetchProject(), 5000);
      }
    } catch (err: any) {
      console.error("Error fetching project:", err);
      setError(err.message || "Failed to load project");
    } finally {
      setLoading(false);
    }
  }, [projectId, loggedInUser]);

  useEffect(() => {
    if (!authLoading && projectId) {
      fetchProject();
    }
  }, [authLoading, projectId, fetchProject]);

  // 🚀 OPTIMIZATION: Debounced view count to reduce API calls
  useEffect(() => {
    if (projectId && !authLoading && project && !viewCountIncremented) {
      const timeoutId = setTimeout(() => {
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}/view`,
          { method: "POST" }
        )
        .then(() => {
          console.log('🚀 View count incremented');
          setViewCountIncremented(true);
        })
        .catch(console.error);
      }, 2000); // Wait 2 seconds before counting view

      return () => clearTimeout(timeoutId);
    }
  }, [projectId, authLoading, project, viewCountIncremented]);

  // 🚀 OPTIMIZATION: Memoized file list with deferred project
  const allFiles = useMemo((): FileAttachment[] => {
    if (!deferredProject) return [];
    const files: FileAttachment[] = [];

    if (deferredProject.files.model?.glb && !deferredProject.conversionStatus?.inProgress) {
      files.push({
        type: "model",
        url: deferredProject.files.model.glb.url,
        filename: deferredProject.files.model.stl?.filename || deferredProject.files.model.glb.filename,
        size: deferredProject.files.model.stl?.size || deferredProject.files.model.glb.size,
      });
    }

    if (deferredProject.files.attachments) {
      files.push(
        ...deferredProject.files.attachments.map((f) => ({
          ...f,
          type: f.type as FileAttachment["type"],
        }))
      );
    }

    return files;
  }, [deferredProject]);

  // 🚀 OPTIMIZATION: Memoized preload files for LCP
  const preloadFiles = useMemo(() => {
    if (!project) return [];
    
    const files: Array<{ url: string; type: string; priority?: boolean }> = [];
    if (project.files.model?.glb) {
      files.push({
        url: project.files.model.glb.url,
        type: 'model',
        priority: true // Preload main 3D model
      });
    }
    
    return files;
  }, [project]);

  // Your existing Viewer component with Suspense optimization and error handling
  const Viewer = () => {
    if (project?.conversionStatus?.inProgress) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8 text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
          <h3 className="text-lg font-semibold mb-2">Model is being processed...</h3>
          <p className="text-slate-500 dark:text-slate-400">
            This may take a moment. The page will update automatically.
          </p>
        </div>
      );
    }

    if (!activeFile) {
      return <Placeholder text="Select a file to view." icon={List} />;
    }

    // 🚀 OPTIMIZATION: Enhanced error boundary for Firebase Storage issues
    const ViewerComponent = () => {
      try {
        switch (activeFile.type) {
          case "model":
            return <ModelViewer modelUrl={activeFile.url} />;
          case "documentation":
            return <PDFViewer fileUrl={activeFile.url} />;
          case "code":
            return <CodeViewer fileUrl={activeFile.url} />;
          case "video":
            return <VideoPlayer fileUrl={activeFile.url} />;
          default:
            return <Placeholder text="Preview not available." icon={FileIcon} />;
        }
      } catch (error) {
        console.error('Viewer error:', error);
        return (
          <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Unable to load file</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">
              There was an issue loading this file. This might be a temporary issue.
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => window.location.reload()}
            >
              Try Again
            </Button>
          </div>
        );
      }
    };

    return (
      <Suspense fallback={<ViewerSkeleton type={activeFile.type} />}>
        <ViewerComponent />
      </Suspense>
    );
  };

  const Placeholder = ({
    text,
    icon: Icon,
  }: {
    text: string;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  }) => (
    <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-8 text-center">
      <Icon className="w-16 h-16 text-slate-400 dark:text-slate-600 mb-4" />
      <p className="text-slate-600 dark:text-slate-400">{text}</p>
    </div>
  );

  // 🚀 OPTIMIZATION: Memoized file icon function
  const getFileIcon = useCallback((type: string) => {
    const className = "w-5 h-5 flex-shrink-0";
    switch (type) {
      case "model":
        return <Box className={`${className} text-blue-500`} />;
      case "code":
        return <FileCode className={`${className} text-green-500`} />;
      case "documentation":
        return <FileText className={`${className} text-yellow-500`} />;
      case "video":
        return <FileVideo className={`${className} text-red-500`} />;
      default:
        return <FileIcon className={`${className} text-slate-500`} />;
    }
  }, []);

  // 🚀 OPTIMIZATION: React 19 - Optimized file selection
  const handleFileSelect = useCallback((file: FileAttachment) => {
    startTransition(() => {
      setActiveFile(file);
    });
  }, []);

  const handleDownload = useCallback(async (fileUrl: string, filename: string): Promise<void> => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download failed:", error);
    }
  }, []);

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }, []);

  if (loading || authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
        <p className="text-slate-600 dark:text-slate-400">
          {authLoading ? "Checking authentication..." : "Loading project..."}
        </p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2 dark:text-white">
          Project Not Found
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6 text-center max-w-md">
          {error || "This project may be private or does not exist."}
        </p>
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => router.back()}>
            <ChevronLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
          <Button onClick={() => router.push("/")}>Go Home</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* 🚀 OPTIMIZATION: Preload critical files for better LCP */}
      <FilePreloader files={preloadFiles} />
      
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <div className="container mx-auto p-4 md:p-8 max-w-7xl">
          {/* Header with Navigation */}
          <div className="flex items-center justify-between mb-6">
            <Button 
              variant="ghost" 
              onClick={() => router.back()}
              className="gap-2 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            
            <div className="flex gap-3">
              <ShareButton 
                title={project.title}
                description={project.description}
                authorName={project.authorName}
                size="sm"
                variant="outline"
              />
              {isOwner && (
                <Button onClick={() => router.push(`/project/edit/${project.id}`)} size="sm" className="gap-2">
                  <Edit className="h-4 w-4" />
                  Edit Project
                </Button>
              )}
            </div>
          </div>

          {/* Project Hero Section - MOVED DESCRIPTION HERE */}
          <div className="mb-8 space-y-6">
            {/* Title and Author */}
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="space-y-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                    {project.title}
                  </h1>
                  {project.visibility === "private" && (
                    <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                      <Lock className="h-3 w-3" />
                      Private
                    </Badge>
                  )}
                </div>

                {/* Author Card */}
                <a
                  href={`/user/${project.username}`}
                  className="inline-flex items-center gap-3 group hover:bg-white/60 dark:hover:bg-slate-800/60 rounded-lg p-3 -ml-3 transition-all duration-200"
                >
                  <Avatar className="h-12 w-12 ring-2 ring-slate-200 dark:ring-slate-700">
                    <AvatarImage src={project.authorAvatar} />
                    <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                      {project.authorName?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {project.authorName}
                    </div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      @{project.username}
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap gap-6 text-sm text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {project.stats.views.toLocaleString()}
                  </span>
                  <span>views</span>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {project.stats.likes.toLocaleString()}
                  </span>
                  <span>likes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{formatDistanceToNow(new Date(project.createdAt))} ago</span>
                </div>
              </div>
            </div>

            {/* Tags */}
            {project.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {project.tags.map((tag, i) => (
                  <Badge 
                    key={i} 
                    className="bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900/70 border-0 cursor-pointer transition-colors"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
            {/* Viewer - Main Content */}
            <div className="xl:col-span-3">
              <Card className="overflow-hidden shadow-xl bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 h-[500px] lg:h-[600px]">
                <Viewer />
              </Card>
            </div>

            {/* Sidebar */}
            <div className="xl:col-span-1 space-y-6">
              {/* Project Quick Info */}
              <Card className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Project Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Downloads</span>
                      <span className={`font-medium ${project.allowDownloads ? 'text-green-600 dark:text-green-400' : 'text-slate-500'}`}>
                        {project.allowDownloads ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Files</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {allFiles.length}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 dark:text-slate-400">Visibility</span>
                      <Badge variant={project.visibility === 'private' ? 'secondary' : 'outline'} className="text-xs">
                        {project.visibility || 'public'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Files List */}
              <Card className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <List className="h-5 w-5" />
                    Files ({allFiles.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {allFiles.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <FileIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No files available</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {allFiles.map((file, i) => (
                        <div
                          key={i}
                          className={`group p-3 rounded-lg border transition-all duration-200 hover:shadow-md ${
                            activeFile?.url === file.url
                              ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-700"
                              : "bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-slate-800/50 dark:border-slate-700 dark:hover:bg-slate-800"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleFileSelect(file)}
                              className="flex items-center gap-3 flex-grow text-left min-w-0"
                            >
                              {getFileIcon(file.type)}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium leading-tight truncate text-slate-900 dark:text-slate-100">
                                  {file.filename}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {formatFileSize(file.size)}
                                </p>
                              </div>
                            </button>

                            {project.allowDownloads && (
                              <Button
                                onClick={() => {
                                  if (file.type === "model" && project.files.model?.stl) {
                                    handleDownload(project.files.model.stl.url, project.files.model.stl.filename);
                                  } else {
                                    handleDownload(file.url, file.filename);
                                  }
                                }}
                                size="sm"
                                variant="ghost"
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 h-8 w-8 p-0"
                                title={`Download ${file.filename}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Description Section - Positioned under viewer with matching layout */}
          {project.description && (
            <div className="mt-8">
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                <div className="xl:col-span-3">
                  <Card className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-lg">
                    <CardHeader>
                      <CardTitle className="text-xl text-slate-900 dark:text-slate-100">About This Project</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">
                        {project.description}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                {/* Empty space to match sidebar layout */}
                <div className="xl:col-span-1"></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
// Memoized utility function
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};