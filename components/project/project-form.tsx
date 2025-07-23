'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Upload, X, File, Loader2, CheckCircle, FileImage, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth'; // Assuming this hook provides user authentication

// Define allowed file extensions for project files
const ALLOWED_PROJECT_FILE_EXTENSIONS = [
  'stl', 'gltf', 'glb', 'obj', // 3D Models
  'pdf', 'doc', 'docx', 'txt', // Documentation
  'mp4', 'mov', 'avi', 'webm', // Videos
  'py', 'cpp', 'js', 'm' // Code/Archives
];

// Define allowed image extensions for the banner
const ALLOWED_BANNER_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'webp'
];

// Simple list of bad words for client-side censorship (case-insensitive)
// For a production app, use a more comprehensive library or a server-side API.
const BAD_WORDS = ['badword1', 'inappropriate', 'swearword', 'xxx'];

interface ProjectFile {
  file: File;
  type: 'model' | 'code' | 'documentation' | 'video' | 'other';
  preview?: string; // Only used for image previews, though not strictly needed for project files here
}

interface ProjectFormData {
  title: string;
  description: string;
  tags: string[];
  isPublic: boolean;
  allowDownloads: boolean;
}

export default function ProjectForm() {
  const [formData, setFormData] = useState<ProjectFormData>({
    title: '',
    description: '',
    tags: [],
    isPublic: true,
    allowDownloads: true
  });
  
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [currentTag, setCurrentTag] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for file input
  const bannerInputRef = useRef<HTMLInputElement>(null); // Ref for banner input
  
  const { user } = useAuth(); // Get authenticated user from your auth hook
  const router = useRouter();

  // Helper function to censor bad words in a string
  const censorText = (text: string): string => {
    let censored = text;
    BAD_WORDS.forEach(word => {
      const regex = new RegExp(`\\b${word}\\b`, 'gi'); // Case-insensitive, whole word
      censored = censored.replace(regex, '*'.repeat(word.length));
    });
    return censored;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const addTag = () => {
    if (currentTag.trim()) {
      const processedTag = censorText(currentTag.trim());
      if (processedTag.includes('*')) {
        setError('Inappropriate word detected in tag. Tag has been censored.');
      }

      if (!formData.tags.includes(processedTag) && processedTag.length > 0) {
        setFormData(prev => ({
          ...prev,
          tags: [...prev.tags, processedTag]
        }));
        setCurrentTag('');
        setError(''); // Clear error if tag was added successfully
      } else if (formData.tags.includes(processedTag)) {
        setError('Tag already exists.');
      }
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const getFileType = (file: File): ProjectFile['type'] => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !ALLOWED_PROJECT_FILE_EXTENSIONS.includes(extension)) {
      return 'other'; // Treat as 'other' if not in allowed list
    }
    
    if (['stl', 'gltf', 'glb', 'obj'].includes(extension)) return 'model';
    if (['py', 'cpp', 'js', 'ino', 'zip'].includes(extension)) return 'code';
    if (['pdf', 'doc', 'docx', 'txt'].includes(extension)) return 'documentation';
    if (['mp4', 'mov', 'avi', 'webm'].includes(extension)) return 'video';
    return 'other'; // Fallback for allowed but uncategorized
  };

  const handleFileSelect = (selectedFiles: FileList) => {
    const newValidFiles: ProjectFile[] = [];
    const invalidFiles: string[] = [];

    Array.from(selectedFiles).forEach(file => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension && ALLOWED_PROJECT_FILE_EXTENSIONS.includes(extension)) {
        newValidFiles.push({
          file,
          type: getFileType(file),
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined // For potential future image previews
        });
      } else {
        invalidFiles.push(file.name);
      }
    });
    
    setFiles(prev => [...prev, ...newValidFiles]);
    if (invalidFiles.length > 0) {
      setError(`Unsupported file type(s) detected: ${invalidFiles.join(', ')}. Allowed types: ${ALLOWED_PROJECT_FILE_EXTENSIONS.map(ext => `.${ext}`).join(', ')}.`);
    } else {
      setError(''); // Clear error if all new files are valid
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleBannerSelect = (selectedFiles: FileList | null) => {
    if (selectedFiles && selectedFiles.length > 0) {
      const file = selectedFiles[0];
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension && ALLOWED_BANNER_EXTENSIONS.includes(extension) && file.type.startsWith('image/')) {
        setBannerFile(file);
        setBannerPreview(URL.createObjectURL(file));
        setError(''); // Clear error on successful selection
      } else {
        setBannerFile(null);
        setBannerPreview(null);
        setError(`Unsupported banner file type. Please upload an image file (${ALLOWED_BANNER_EXTENSIONS.map(ext => `.${ext}`).join(', ')}).`);
        if (bannerInputRef.current) {
          bannerInputRef.current.value = ''; // Clear file input
        }
      }
    }
  };

  const removeBanner = () => {
    setBannerFile(null);
    setBannerPreview(null);
    if (bannerInputRef.current) {
      bannerInputRef.current.value = ''; // Clear file input
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleBannerDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleBannerSelect(e.dataTransfer.files);
    }
  };

  const validateForm = () => {
    if (!formData.title.trim()) {
      setError('Project title is required.');
      return false;
    }
    
    if (!formData.description.trim()) {
      setError('Project description is required.');
      return false;
    }
    
    const hasModelFile = files.some(f => f.type === 'model');
    if (!hasModelFile) {
      setError('At least one 3D model file (.stl, .gltf, .glb, .obj) is required.');
      return false;
    }

    if (formData.tags.length === 0) {
      setError('Please add at least one tag for your project.');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validateForm()) return;
    
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const uploadData = new FormData();
      uploadData.append('title', formData.title);
      uploadData.append('description', formData.description);
      uploadData.append('tags', JSON.stringify(formData.tags));
      uploadData.append('isPublic', formData.isPublic.toString());
      uploadData.append('allowDownloads', formData.allowDownloads.toString());
      
      files.forEach((fileObj) => {
        uploadData.append(`projectFiles`, fileObj.file); // Use a consistent name for backend
      });

      if (bannerFile) {
        uploadData.append('bannerImage', bannerFile); // Append banner file
      }

      const token = await user?.getIdToken(); // Get auth token

      // Simulate upload progress (replace with actual upload progress listener if available)
      let currentProgress = 0;
      const interval = setInterval(() => {
        currentProgress += 10;
        if (currentProgress <= 90) {
          setUploadProgress(currentProgress);
        } else {
          clearInterval(interval);
        }
      }, 200);
      
      // Upload to backend
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/projects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
          // 'Content-Type': 'multipart/form-data' is NOT needed for FormData, browser sets it automatically
        },
        body: uploadData
      });

      clearInterval(interval); // Clear interval once fetch is complete

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create project. Please try again.');
      }

      const result = await response.json();
      setUploadProgress(100);
      
      // Redirect to project view
      setTimeout(() => {
        router.push(`/project/${result.id}`);
      }, 1000);
      
    } catch (err: any) {
      setError(err.message || 'Failed to create project. Please check your network and try again.');
      setUploadProgress(0); // Reset progress on error
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeColor = (type: ProjectFile['type']) => {
    switch (type) {
      case 'model': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300';
      case 'code': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'documentation': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300';
      case 'video': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 md:p-8 lg:p-10"> {/* Increased max-width for better layout */}
      <Card className="border-gray-200 dark:border-gray-800 shadow-lg dark:shadow-none rounded-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create New Project</CardTitle>
          <CardDescription className="text-lg text-gray-600 dark:text-gray-400">
            Showcase your amazing 3D models and creative projects
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-8"> {/* Increased gap */}
            {error && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-3 rounded-md border border-red-200 dark:border-red-800 animate-fade-in">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8"> {/* Two-column layout */}
              {/* Left Column: Project Details & Tags */}
              <div className="space-y-6">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 border-b pb-2 border-gray-200 dark:border-gray-700">Project Details</h3>
                
                <div>
                  <Label htmlFor="title" className="text-gray-900 dark:text-gray-100 mb-1 block">Project Title</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="My Awesome 3D Project"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="description" className="text-gray-900 dark:text-gray-100 mb-1 block">Description</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Describe your project, how it was made, what it's used for..."
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={6} // Increased rows for more space
                    className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>

                {/* Tags */}
                <div>
                  <Label className="text-gray-900 dark:text-gray-100 mb-1 block">Tags</Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      placeholder="Add a tag (e.g., 'robotics', 'architecture')..."
                      value={currentTag}
                      onChange={(e) => setCurrentTag(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      className="bg-white dark:bg-gray-950 border-gray-300 dark:border-gray-700 flex-grow"
                    />
                    <Button type="button" onClick={addTag} variant="outline" className="dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-100">
                      Add
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-[40px] p-2 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900">
                    {formData.tags.length === 0 && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">No tags added yet.</span>
                    )}
                    {formData.tags.map((tag, index) => (
                      <Badge key={index} variant="secondary" className="dark:bg-gray-800 dark:text-gray-300 flex items-center gap-1 pr-1">
                        {tag}
                        {/* Changed X icon to be wrapped in a Button for better clickability */}
                        <Button
                          type="button"
                          variant="ghost" // Make it transparent
                          size="icon" // Use Shadcn's icon size for small buttons
                          className="h-5 w-5 p-0.5 ml-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                          onClick={(e) => {
                            e.stopPropagation(); // Essential to prevent badge click if badge were clickable
                            removeTag(tag);
                          }}
                        >
                          <X className="h-3.5 w-3.5" /> {/* Keep icon size, button provides clickable area */}
                        </Button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: File Uploads */}
              <div className="space-y-6">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 border-b pb-2 border-gray-200 dark:border-gray-700">Media & Files</h3>

                {/* Project Files Upload */}
                <div>
                  <Label className="text-gray-900 dark:text-gray-100 mb-1 block">Project Files (Models, Code, Docs, Videos)</Label>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()} // Click to open file dialog
                    className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  >
                    <Upload className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                      <span className="text-blue-600 dark:text-blue-400 hover:text-blue-500">
                        Click to upload
                      </span>{' '}
                      or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      Supported: {ALLOWED_PROJECT_FILE_EXTENSIONS.map(ext => `.${ext}`).join(', ')}
                    </p>
                    <input
                      id="file-upload"
                      type="file"
                      multiple
                      onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                      className="hidden"
                      ref={fileInputRef} // Attach ref
                      accept={ALLOWED_PROJECT_FILE_EXTENSIONS.map(ext => `.${ext}`).join(',')} // Hint for browser
                    />
                  </div>

                  {/* File List */}
                  {files.length > 0 && (
                    <div className="mt-4 space-y-2 max-h-60 overflow-y-auto pr-2"> {/* Added max-height and scroll */}
                      {files.map((fileObj, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg shadow-sm">
                          <div className="flex items-center space-x-3">
                            <File className="h-5 w-5 text-gray-400 dark:text-gray-600 flex-shrink-0" />
                            <div className="flex-grow overflow-hidden">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{fileObj.file.name}</p>
                              <div className="flex items-center space-x-2 mt-0.5">
                                <Badge className={getFileTypeColor(fileObj.type)}>
                                  {fileObj.type.charAt(0).toUpperCase() + fileObj.type.slice(1)}
                                </Badge>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatFileSize(fileObj.file.size)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeFile(index)}
                            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 ml-2 p-1 h-auto"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Banner Image Upload */}
                <div>
                  <Label className="text-gray-900 dark:text-gray-100 mb-1 block">Project Banner Image</Label>
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleBannerDrop}
                    onClick={() => bannerInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer relative"
                  >
                    {!bannerPreview ? (
                      <>
                        <FileImage className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-600" />
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <span className="text-blue-600 dark:text-blue-400 hover:text-blue-500">
                            Click to upload
                          </span>{' '}
                          or drag and drop
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                          Supported: {ALLOWED_BANNER_EXTENSIONS.map(ext => `.${ext}`).join(', ')} (Max 5MB)
                        </p>
                      </>
                    ) : (
                      <div className="relative w-full h-40 flex items-center justify-center">
                        <img src={bannerPreview} alt="Banner Preview" className="max-h-full max-w-full object-contain rounded-md" />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); removeBanner(); }} // Stop propagation to prevent re-opening file dialog
                          className="absolute top-2 right-2 p-1 h-auto rounded-full"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    <input
                      id="banner-upload"
                      type="file"
                      onChange={(e) => handleBannerSelect(e.target.files)}
                      className="hidden"
                      ref={bannerInputRef}
                      accept={ALLOWED_BANNER_EXTENSIONS.map(ext => `image/${ext}`).join(',')} // Hint for browser
                    />
                  </div>
                  {bannerFile && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 text-center">
                      {bannerFile.name} ({formatFileSize(bannerFile.size)})
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Settings */}
            <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Project Settings</h3>
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="isPublic"
                  name="isPublic"
                  checked={formData.isPublic}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:checked:bg-blue-600 dark:checked:border-transparent"
                />
                <Label htmlFor="isPublic" className="text-base text-gray-900 dark:text-gray-100 cursor-pointer">
                  Make this project public
                  <p className="text-sm text-gray-500 dark:text-gray-400">Public projects are visible to everyone on the discover page.</p>
                </Label>
              </div>
              
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="allowDownloads"
                  name="allowDownloads"
                  checked={formData.allowDownloads}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:checked:bg-blue-600 dark:checked:border-transparent"
                />
                <Label htmlFor="allowDownloads" className="text-base text-gray-900 dark:text-gray-100 cursor-pointer">
                  Allow users to download files
                  <p className="text-sm text-gray-500 dark:text-gray-400">Users will be able to download the project files you upload.</p>
                </Label>
              </div>
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-2 pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                  <span className="text-base text-gray-600 dark:text-gray-400 font-medium">
                    Uploading and processing files...
                  </span>
                </div>
                <Progress value={uploadProgress} className="w-full h-2 bg-gray-200 dark:bg-gray-700" />
                <p className="text-right text-sm text-gray-500 dark:text-gray-400">{uploadProgress}% Complete</p>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/dashboard')}
                disabled={isUploading}
                className="dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUploading} className="min-w-[150px] bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-600">
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Create Project
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
