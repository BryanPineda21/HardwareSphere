"use client";

import { useState, useEffect, useRef, ReactElement } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import AuthGuard from "@/components/auth/auth-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  X,
  Upload,
  Loader2,
  Save,
  FileText,
  FileCode,
  FileVideo,
  Box,
  Image as ImageIcon,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Toaster, toast } from "sonner";

// --- Type Definitions ---
interface FileAttachment {
  type: string;
  url: string;
  filename: string;
  size: number;
  storagePath: string;
}

interface FileSlot {
  type: string;
  icon: React.ComponentType<{ className?: string }>;
  accepted: string;
  label: string;
  description: string;
}

// --- This state interface is the key to managing file updates correctly ---
interface FileState {
  existing: FileAttachment | null; // The file that was loaded from the server
  new: File | null; // A new file selected by the user from their computer
  toDelete: boolean; // A flag to mark if the 'existing' file should be deleted
}

interface ConversionStatus {
  stlFiles: number;
  convertedFiles: number;
  inProgress: boolean;
  completed: boolean;
  errors: any[];
  progress?: number;
  currentFile?: string;
}

interface ProjectData {
  title: string;
  description: string;
  tags: string[];
  visibility: "public" | "private";
  allowDownloads: boolean;
  userId: string;
  conversionStatus?: ConversionStatus;
  files: {
    thumbnail?: FileAttachment;
    model?: {
      stl?: FileAttachment;
      // Fixed: Changed from 'gltf' to 'glb' to match backend
      glb?: FileAttachment;
    };
    attachments?: FileAttachment[];
  };
}

// --- Main Component ---
export default function ProjectEditPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    tags: [] as string[],
    isPublic: true,
    allowDownloads: true,
  });

  const [tagInput, setTagInput] = useState("");
  // This state is the single source of truth for all file-related actions.
  const [fileStates, setFileStates] = useState<Record<string, FileState>>({});
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [conversionStatus, setConversionStatus] =
    useState<ConversionStatus | null>(null);

  // Use ref to prevent multiple fetches
  const fetchInProgressRef = useRef(false);

  const fileSlots: FileSlot[] = [
    {
      type: "banner",
      icon: ImageIcon,
      accepted: "image/*",
      label: "Banner Image",
      description: "Main project image (JPG, PNG, GIF)",
    },
    {
      type: "model",
      icon: Box,
      accepted: ".stl",
      label: "3D Model",
      description: "STL file only (will be converted to GLB for web viewing)",
    },
    {
      type: "documentation",
      icon: FileText,
      accepted: ".pdf,.doc,.docx,.txt,.md",
      label: "Documentation",
      description: "PDF, DOC, or text files",
    },
    {
      type: "code",
      icon: FileCode,
      accepted:
        ".py,.cpp,.c,.java,.js,.ts,.tsx,.jsx,.html,.css,.m,.h,.hpp,.cs,.php,.rb,.go,.rs,.swift,.kt,.scala,.r,.matlab,.sh,.bat,.ps1",
      label: "Source Code",
      description: "Code files only (no ZIP archives)",
    },
    {
      type: "video",
      icon: FileVideo,
      accepted: ".mp4,.mov,.avi,.mkv,.webm",
      label: "Demo Video",
      description: "MP4, MOV, or other video formats",
    },
  ];

  // Initialize file states
  useEffect(() => {
    const initialStates: Record<string, FileState> = {};
    fileSlots.forEach((slot) => {
      initialStates[slot.type] = { existing: null, new: null, toDelete: false };
    });
    setFileStates(initialStates);
  }, []); // Empty dependency array ensures this runs only once

  // Fetch initial project data
  useEffect(() => {
    if (!projectId || !user || fetchInProgressRef.current) return;

    const fetchProjectData = async (): Promise<void> => {
      fetchInProgressRef.current = true;
      try {
        // Include auth headers for private projects
        const token = await user.getIdToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!res.ok) throw new Error("Failed to fetch project data.");
        const data: ProjectData = await res.json();

        if (data.userId !== user.uid) {
          toast.error("You don't have permission to edit this project.");
          router.push(`/project/${projectId}`);
          return;
        }

        setFormData({
          title: data.title,
          description: data.description,
          tags: data.tags || [],
          isPublic: data.visibility === "public",
          allowDownloads: data.allowDownloads,
        });

        if (data.conversionStatus) {
          setConversionStatus(data.conversionStatus);
        }

        // This logic correctly populates the initial state from the fetched data
        const newFileStates: Record<string, FileState> = {};
        fileSlots.forEach((slot) => {
          newFileStates[slot.type] = {
            existing: null,
            new: null,
            toDelete: false,
          };
        });

        if (data.files.thumbnail) {
          newFileStates.banner.existing = {
            ...data.files.thumbnail,
            type: "banner",
          };
        }

        if (data.files.model?.stl) {
          newFileStates.model.existing = {
            ...data.files.model.stl,
            type: "model",
          };
        }

        (data.files.attachments || []).forEach((file: FileAttachment) => {
          if (
            file.type.includes("pdf") ||
            file.type.includes("text") ||
            file.type.includes("document") ||
            file.filename.endsWith(".pdf") ||
            file.filename.endsWith(".doc") ||
            file.filename.endsWith(".docx") ||
            file.filename.endsWith(".txt") ||
            file.filename.endsWith(".md")
          ) {
            if (!newFileStates.documentation.existing)
              newFileStates.documentation.existing = file;
          } else if (
            file.filename.match(
              /\.(py|cpp|c|java|js|ts|tsx|jsx|html|css|m|h|hpp|cs|php|rb|go|rs|swift|kt|scala)$/
            )
          ) {
            if (!newFileStates.code.existing)
              newFileStates.code.existing = file;
          } else if (
            file.type.includes("video") ||
            file.filename.match(/\.(mp4|mov|avi|mkv|webm)$/)
          ) {
            if (!newFileStates.video.existing)
              newFileStates.video.existing = file;
          }
        });

        setFileStates(newFileStates);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "An unknown error occurred";
        toast.error(errorMessage);
        router.push("/");
      } finally {
        setLoading(false);
        fetchInProgressRef.current = false;
      }
    };

    fetchProjectData();
  }, [projectId, user, router]);

  // Poll for conversion status updates
  useEffect(() => {
    if (!conversionStatus?.inProgress || !projectId) return;

    const pollInterval = setInterval(async () => {
      try {
        const token = await user?.getIdToken();
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }
        );
        if (res.ok) {
          const data: ProjectData = await res.json();
          if (data.conversionStatus) {
            setConversionStatus(data.conversionStatus);
            if (!data.conversionStatus.inProgress) {
              clearInterval(pollInterval);
              if (
                data.conversionStatus.completed &&
                data.conversionStatus.errors.length === 0
              ) {
                toast.success("3D model conversion completed!");
              }
            }
          }
        }
      } catch (error) {
        console.error("Error polling conversion status:", error);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [conversionStatus?.inProgress, projectId, user]);

  // --- Form Handlers ---
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const newTag = tagInput.trim().toLowerCase();
      if (newTag && !formData.tags.includes(newTag)) {
        setFormData((prev) => ({ ...prev, tags: [...prev.tags, newTag] }));
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  };

  // --- File Management Logic: This section is well-implemented ---
  const handleFileUpload = (fileType: string, file: File): void => {
    if (fileType === "model" && !file.name.toLowerCase().endsWith(".stl")) {
      toast.error("Please upload an STL file for 3D models");
      return;
    }
    setFileStates((prev) => ({
      ...prev,
      [fileType]: { ...prev[fileType], new: file, toDelete: false },
    }));
  };

  const removeFile = (fileType: string): void => {
    // This correctly marks an existing file for deletion on the backend.
    setFileStates((prev) => ({
      ...prev,
      [fileType]: {
        ...prev[fileType],
        new: null,
        toDelete: prev[fileType].existing ? true : false,
      },
    }));
  };

  const replaceFile = (fileType: string, file: File): void => {
    if (fileType === "model" && !file.name.toLowerCase().endsWith(".stl")) {
      toast.error("Please upload an STL file for 3D models");
      return;
    }
    // This is the core logic for replacement: upload a new file AND mark the old one for deletion.
    setFileStates((prev) => ({
      ...prev,
      [fileType]: {
        ...prev[fileType],
        new: file,
        toDelete: prev[fileType].existing ? true : false,
      },
    }));
  };

  // --- Submit Handler: This correctly assembles the data for the backend ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Authentication failed.");

      const data = new FormData();
      data.append("title", formData.title);
      data.append("description", formData.description);
      data.append("tags", JSON.stringify(formData.tags));
      data.append("isPublic", String(formData.isPublic));
      data.append("allowDownloads", String(formData.allowDownloads));

      // 1. Collect all storage paths for files that are marked for deletion.
      const filesToDelete: string[] = [];
      Object.entries(fileStates).forEach(([type, state]) => {
        if (state.toDelete && state.existing?.storagePath) {
          filesToDelete.push(state.existing.storagePath);
        }
      });
      data.append("filesToDelete", JSON.stringify(filesToDelete));

      // 2. Append all new files with the correct field names for the backend middleware.
      Object.entries(fileStates).forEach(([type, state]) => {
        if (state.new) {
          if (type === "banner") {
            data.append("bannerImage", state.new);
          } else if (type === "model") {
            data.append("modelFile", state.new); // Crucially uses 'modelFile'
          } else {
            data.append("projectFiles", state.new);
          }
        }
      });

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/projects/${projectId}`,
        {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}` },
          body: data,
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || "Failed to update project.");
      }

      toast.success(
        "Project updated successfully! Any model conversion will continue in the background."
      );
      router.push(`/project/${projectId}`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update project";
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const getFileIcon = (type: string): ReactElement => {
    const className = "h-5 w-5 flex-shrink-0";
    if (
      type.includes("pdf") ||
      type.includes("text") ||
      type.includes("document")
    )
      return <FileText className={`${className} text-amber-500`} />;
    if (
      type.includes("python") ||
      type.includes("javascript") ||
      type.includes("java") ||
      type.includes("cpp") ||
      type.includes("code") ||
      type.includes("html") ||
      type.includes("css")
    )
      return <FileCode className={`${className} text-green-500`} />;
    if (type.includes("video"))
      return <FileVideo className={`${className} text-rose-500`} />;
    if (type.includes("image"))
      return <ImageIcon className={`${className} text-blue-500`} />;
    if (type.includes("stl") || type.includes("model"))
      return <Box className={`${className} text-purple-500`} />;
    return <FileText className={className} />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (loading)
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );

  return (
    <AuthGuard>
      <Toaster position="top-center" richColors />
      <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Edit Project
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Update your project details and manage files.
          </p>

          {conversionStatus?.inProgress && (
            <Alert className="mb-6">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>
                <strong>3D Model Conversion in Progress...</strong>
                {conversionStatus.currentFile && (
                  <p className="mt-1">
                    Converting: {conversionStatus.currentFile}
                  </p>
                )}
                {conversionStatus.progress !== undefined && (
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${conversionStatus.progress}%` }}
                    />
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          {conversionStatus?.errors && conversionStatus.errors.length > 0 && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Conversion Errors</strong>
                {conversionStatus.errors.map((error, idx) => (
                  <p key={idx} className="mt-1">
                    {error.fileName}: {error.error}
                  </p>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    rows={6}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="tags">Tags</Label>
                  <div className="flex flex-wrap gap-2 p-2 border rounded-md mt-2">
                    {formData.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="ml-2 hover:text-red-500"
                        >
                          <X size={12} />
                        </button>
                      </Badge>
                    ))}
                    <Input
                      id="tags"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder="Add a tag and press Enter"
                      className="flex-1 border-none outline-none shadow-none focus-visible:ring-0"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Project Files</CardTitle>
                <CardDescription>
                  Upload one file for each category. You can replace existing
                  files or add new ones.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {fileSlots.map((slot) => {
                  const fileState = fileStates[slot.type];
                  const hasExisting =
                    fileState?.existing && !fileState.toDelete;
                  const hasNew = fileState?.new;
                  const currentFile = hasNew
                    ? fileState.new
                    : hasExisting
                    ? fileState.existing
                    : null;

                  return (
                    <div key={slot.type} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <slot.icon className="h-5 w-5 text-gray-600" />
                        <Label className="font-medium">{slot.label}</Label>
                      </div>
                      <p className="text-sm text-gray-500 mb-2">
                        {slot.description}
                      </p>

                      {currentFile ? (
                        <div className="w-full flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                          <div className="flex items-center gap-3">
                            {getFileIcon(
                              hasNew
                                ? currentFile.type
                                : (currentFile as FileAttachment).type
                            )}
                            <div>
                              <p className="text-sm font-medium">
                                {hasNew
                                  ? (currentFile as File).name
                                  : (currentFile as FileAttachment).filename}
                              </p>
                              <p className="text-xs text-gray-500">
                                {hasNew
                                  ? formatFileSize((currentFile as File).size)
                                  : formatFileSize(
                                      (currentFile as FileAttachment).size
                                    )}
                                {hasNew && (
                                  <span className="ml-2 text-blue-600">
                                    • New upload
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label
                              htmlFor={`${slot.type}-replace`}
                              className="cursor-pointer"
                            >
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                asChild
                              >
                                <span>
                                  <RefreshCw className="h-4 w-4 mr-1" />
                                  Replace
                                </span>
                              </Button>
                            </Label>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => removeFile(slot.type)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <input
                            id={`${slot.type}-replace`}
                            type="file"
                            className="hidden"
                            accept={slot.accepted}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) replaceFile(slot.type, file);
                            }}
                          />
                        </div>
                      ) : (
                        <Label
                          htmlFor={`${slot.type}-upload`}
                          className="cursor-pointer block w-full"
                        >
                          <div className="w-full flex items-center gap-3 p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                            <slot.icon className="h-6 w-6 text-gray-400" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                Upload {slot.label}
                              </p>
                              <p className="text-xs text-gray-500">
                                {slot.description}
                              </p>
                            </div>
                            <Upload className="h-4 w-4 text-gray-400" />
                          </div>
                        </Label>
                      )}

                      <input
                        id={`${slot.type}-upload`}
                        type="file"
                        className="hidden"
                        accept={slot.accepted}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(slot.type, file);
                        }}
                      />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Project Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="isPublic">Public Project</Label>
                    <p className="text-sm text-gray-500">
                      Make this project visible to everyone
                    </p>
                  </div>
                  <Switch
                    id="isPublic"
                    checked={formData.isPublic}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isPublic: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="allowDownloads">Allow Downloads</Label>
                    <p className="text-sm text-gray-500">
                      Let users download project files
                    </p>
                  </div>
                  <Switch
                    id="allowDownloads"
                    checked={formData.allowDownloads}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, allowDownloads: checked })
                    }
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSaving || conversionStatus?.inProgress}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </AuthGuard>
  );
}
